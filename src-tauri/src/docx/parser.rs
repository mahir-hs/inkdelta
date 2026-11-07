//! Turns the XML inside a .docx into a `Document`.
//!
//! Word's XML in one paragraph:
//!
//! ```text
//! <w:p>                      paragraph
//!   <w:pPr>…</w:pPr>         paragraph properties (heading style, list info)
//!   <w:r>                    a "run": text that shares one format
//!     <w:rPr><w:b/></w:rPr>  run properties (bold here)
//!     <w:t>Hello</w:t>       the text
//!   </w:r>
//! </w:p>
//! ```
//!
//! Tracked changes inside the file are read in their *accepted* form:
//! inserted text (`<w:ins>`) is kept and deleted text (`<w:del>`) is dropped.

use super::numbering::Numbering;
use super::package::Package;
use super::tokenizer::tokenize;
use super::xml::Node;
use crate::error::{AppError, AppResult};
use crate::model::*;
use base64::Engine;
use sha2::{Digest, Sha256};
use std::collections::HashMap;

pub fn parse_document(bytes: Vec<u8>) -> AppResult<Document> {
    let mut package = Package::open(bytes)?;
    let document_xml = package
        .read_xml("word/document.xml")
        .ok_or_else(|| AppError::Docx("word/document.xml is missing".into()))?;
    let body = document_xml
        .child("body")
        .ok_or_else(|| AppError::Docx("the document has no body".into()))?;

    let mut parser = Parser::new(&mut package);
    let blocks = parser.parse_blocks(body);
    let comments = parser.read_comments(&mut package, &blocks);
    Ok(Document { blocks, comments, images: parser.images })
}

/// Everything the paragraph parser needs to look things up while it walks the body.
struct Parser {
    /// style id -> lowercase style name (to recognise "heading 2")
    style_names: HashMap<String, String>,
    numbering: Numbering,
    /// relationship id -> file path inside the zip (images live here)
    relationships: HashMap<String, String>,
    /// zip path -> image hash
    image_hash_by_path: HashMap<String, String>,
    /// image hash -> data: URL
    images: HashMap<String, String>,
    /// comment id -> index of the paragraph where the comment starts
    comment_anchor: HashMap<String, usize>,
    /// paragraphs and tables seen so far (used as a stable position number)
    block_counter: usize,
}

impl Parser {
    fn new(package: &mut Package) -> Self {
        let mut parser = Parser {
            style_names: HashMap::new(),
            numbering: Numbering::default(),
            relationships: HashMap::new(),
            image_hash_by_path: HashMap::new(),
            images: HashMap::new(),
            comment_anchor: HashMap::new(),
            block_counter: 0,
        };
        parser.load_styles(package);
        parser.load_numbering(package);
        parser.load_relationships(package);
        parser.load_images(package);
        parser
    }

    // ---------- loading the supporting files ----------

    fn load_styles(&mut self, package: &mut Package) {
        let Some(styles) = package.read_xml("word/styles.xml") else { return };
        for style in styles.children_named("style") {
            let id = style.attr("styleId");
            let name = style.child("name").and_then(|n| n.attr("val"));
            if let (Some(id), Some(name)) = (id, name) {
                self.style_names.insert(id.to_string(), name.to_lowercase());
            }
        }
    }

    fn load_numbering(&mut self, package: &mut Package) {
        if let Some(root) = package.read_xml("word/numbering.xml") {
            self.numbering = Numbering::from_xml(&root);
        }
    }

    fn load_relationships(&mut self, package: &mut Package) {
        let Some(rels) = package.read_xml("word/_rels/document.xml.rels") else { return };
        for rel in rels.children_named("Relationship") {
            if let (Some(id), Some(target)) = (rel.attr("Id"), rel.attr("Target")) {
                self.relationships.insert(id.to_string(), target.to_string());
            }
        }
    }

    /// Reads every image the document links to, hashes it, and keeps a data: URL for the UI.
    fn load_images(&mut self, package: &mut Package) {
        for target in self.relationships.values() {
            let Some(mime) = image_mime_type(target) else { continue };
            let zip_path = match target.strip_prefix('/') {
                Some(absolute) => absolute.to_string(),
                None => format!("word/{target}"),
            };
            let Some(bytes) = package.read(&zip_path) else { continue };

            let hash: String = Sha256::digest(&bytes).iter().take(8).map(|b| format!("{b:02x}")).collect();
            let encoded = base64::engine::general_purpose::STANDARD.encode(&bytes);
            self.images.insert(hash.clone(), format!("data:{mime};base64,{encoded}"));
            self.image_hash_by_path.insert(target.clone(), hash);
        }
    }

    fn read_comments(&self, package: &mut Package, blocks: &[Block]) -> Vec<WordComment> {
        let Some(root) = package.read_xml("word/comments.xml") else { return Vec::new() };
        root.children_named("comment")
            .map(|node| {
                let id = node.attr("id").unwrap_or("").to_string();
                let text = node
                    .descendants("p")
                    .iter()
                    .map(|paragraph| paragraph.all_text())
                    .collect::<Vec<_>>()
                    .join("\n");
                let anchor_block = self.comment_anchor.get(&id).copied();
                let anchor_text = anchor_block
                    .and_then(|index| blocks.get(index))
                    .map(|block| match block {
                        Block::Paragraph(p) => p.plain_text().chars().take(120).collect(),
                        Block::Table(_) => "[table]".to_string(),
                    })
                    .unwrap_or_default();
                WordComment {
                    id,
                    author: node.attr("author").unwrap_or("").to_string(),
                    date: node.attr("date").unwrap_or("").to_string(),
                    text,
                    anchor_block,
                    anchor_text,
                }
            })
            .collect()
    }

    // ---------- body: paragraphs and tables ----------

    fn parse_blocks(&mut self, parent: &Node) -> Vec<Block> {
        let mut blocks = Vec::new();
        for node in &parent.children {
            match node.name.as_str() {
                "p" => {
                    let position = self.next_block_position();
                    blocks.push(Block::Paragraph(self.parse_paragraph(node, position)));
                }
                "tbl" => {
                    self.next_block_position();
                    blocks.push(Block::Table(self.parse_table(node)));
                }
                // Content controls wrap ordinary blocks.
                "sdt" => {
                    if let Some(content) = node.child("sdtContent") {
                        blocks.extend(self.parse_blocks(content));
                    }
                }
                _ => {}
            }
        }
        blocks
    }

    fn next_block_position(&mut self) -> usize {
        let position = self.block_counter;
        self.block_counter += 1;
        position
    }

    fn parse_table(&mut self, table: &Node) -> Vec<Vec<Vec<Block>>> {
        table
            .children_named("tr")
            .map(|row| row.children_named("tc").map(|cell| self.parse_blocks(cell)).collect())
            .collect()
    }

    fn parse_paragraph(&mut self, node: &Node, position: usize) -> Paragraph {
        let mut paragraph = Paragraph::default();
        if let Some(properties) = node.child("pPr") {
            self.read_paragraph_properties(properties, &mut paragraph);
        }
        self.collect_inline(node, position, &Format::default(), &mut paragraph);
        paragraph.position = position;
        paragraph.editable = is_plain_text(node);
        paragraph
    }

    fn read_paragraph_properties(&mut self, properties: &Node, paragraph: &mut Paragraph) {
        // Headings: by style name ("Heading 2"), or by outline level.
        if let Some(style_id) = properties.child("pStyle").and_then(|s| s.attr("val")) {
            let name = self.style_names.get(style_id).cloned().unwrap_or_else(|| style_id.to_lowercase());
            if let Some(level) = name.strip_prefix("heading") {
                paragraph.heading = level.trim().parse().unwrap_or(1);
            } else if name == "title" {
                paragraph.heading = 1;
            }
        }
        if paragraph.heading == 0 {
            let outline_level = properties.child("outlineLvl").and_then(|o| o.attr("val")).and_then(|v| v.parse::<u8>().ok());
            if let Some(level) = outline_level.filter(|l| *l < 6) {
                paragraph.heading = level + 1;
            }
        }

        // List membership.
        if let Some(list) = properties.child("numPr") {
            let level: u8 = list.child("ilvl").and_then(|n| n.attr("val")).and_then(|v| v.parse().ok()).unwrap_or(0);
            if let Some(list_id) = list.child("numId").and_then(|n| n.attr("val")) {
                paragraph.list_marker = self.numbering.next_marker(list_id, level);
                paragraph.indent = level.min(4);
            }
        }
    }

    // ---------- inline content: runs, equations, comments ----------

    /// Walks the children of a paragraph (or of a wrapper such as a hyperlink) and appends tokens.
    fn collect_inline(&mut self, parent: &Node, position: usize, base: &Format, paragraph: &mut Paragraph) {
        for node in &parent.children {
            match node.name.as_str() {
                "r" => self.parse_run(node, base, paragraph),
                // Wrappers whose children are more runs.
                "ins" | "hyperlink" | "smartTag" | "fldSimple" | "customXml" => {
                    self.collect_inline(node, position, base, paragraph)
                }
                "sdt" => {
                    if let Some(content) = node.child("sdtContent") {
                        self.collect_inline(content, position, base, paragraph);
                    }
                }
                "oMath" | "oMathPara" => {
                    let text = node.all_text();
                    if !text.trim().is_empty() {
                        paragraph.tokens.push(Token {
                            text,
                            format: Format { math: true, ..base.clone() },
                            image: None,
                        });
                    }
                }
                "commentRangeStart" => {
                    if let Some(id) = node.attr("id") {
                        self.comment_anchor.entry(id.to_string()).or_insert(position);
                    }
                }
                // "del" (deleted text) and anything unknown are skipped on purpose.
                _ => {}
            }
        }
    }

    fn parse_run(&mut self, run: &Node, base: &Format, paragraph: &mut Paragraph) {
        let format = match run.child("rPr") {
            Some(properties) => read_run_format(properties, base),
            None => base.clone(),
        };

        let mut pending_text = String::new();
        for node in &run.children {
            match node.name.as_str() {
                "t" => pending_text.push_str(&node.text),
                "tab" => pending_text.push('\t'),
                "br" | "cr" => pending_text.push(' '),
                "noBreakHyphen" => pending_text.push('-'),
                "drawing" | "pict" => {
                    // Keep text before the image in order.
                    push_text_tokens(&mut pending_text, &format, paragraph);
                    self.push_image_tokens(node, &format, paragraph);
                }
                _ => {}
            }
        }
        push_text_tokens(&mut pending_text, &format, paragraph);
    }

    fn push_image_tokens(&self, drawing: &Node, format: &Format, paragraph: &mut Paragraph) {
        let mut pictures = drawing.descendants("blip");
        pictures.extend(drawing.descendants("imagedata"));
        for picture in pictures {
            let relationship_id = picture.attr("embed").or_else(|| picture.attr("id")).unwrap_or("");
            let hash = self
                .relationships
                .get(relationship_id)
                .and_then(|path| self.image_hash_by_path.get(path));
            if let Some(hash) = hash {
                paragraph.tokens.push(Token {
                    text: "\u{FFFC}".to_string(),
                    format: format.clone(),
                    image: Some(hash.clone()),
                });
            }
        }
    }
}

/// True when the paragraph is only ordinary text, which can be edited without risking its structure.
fn is_plain_text(paragraph: &Node) -> bool {
    const SPECIAL: [&str; 16] = [
        "tab", "br", "cr", "drawing", "pict", "object", "oMath", "oMathPara", "noBreakHyphen", "sym", "fldChar", "fldSimple",
        "instrText", "footnoteReference", "endnoteReference", "commentReference",
    ];
    !paragraph.descendants("t").is_empty() && SPECIAL.iter().all(|name| paragraph.descendants(name).is_empty())
}

fn push_text_tokens(text: &mut String, format: &Format, paragraph: &mut Paragraph) {
    if text.is_empty() {
        return;
    }
    for piece in tokenize(text) {
        paragraph.tokens.push(Token { text: piece, format: format.clone(), image: None });
    }
    text.clear();
}

fn read_run_format(properties: &Node, base: &Format) -> Format {
    let mut format = base.clone();
    format.bold |= is_switched_on(properties.child("b"));
    format.italic |= is_switched_on(properties.child("i"));
    format.underline |= is_switched_on(properties.child("u"));
    match properties.child("vertAlign").and_then(|v| v.attr("val")) {
        Some("superscript") => format.superscript = true,
        Some("subscript") => format.subscript = true,
        _ => {}
    }
    format
}

/// Word toggles are on when the element exists, unless `val` says otherwise.
fn is_switched_on(toggle: Option<&Node>) -> bool {
    match toggle {
        None => false,
        Some(node) => !matches!(node.attr("val"), Some("0" | "false" | "none" | "off")),
    }
}

fn image_mime_type(path: &str) -> Option<&'static str> {
    let lower = path.to_lowercase();
    match lower.rsplit('.').next()? {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "gif" => Some("image/gif"),
        "bmp" => Some("image/bmp"),
        "svg" => Some("image/svg+xml"),
        _ => None,
    }
}
