//! Changes the text of paragraphs inside an existing .docx, leaving everything else exactly as it was.
//!
//! The file is not rebuilt from our document model (that would lose styles, fields and layout).
//! Instead the original XML is patched in place:
//!
//!   1. find the paragraph by its position (counted the same way as the reader counts them),
//!   2. check its text still matches what the user saw (otherwise refuse),
//!   3. diff old text against new text character by character, and apply only those
//!      deletions and insertions to the existing `<w:t>` text nodes, so bold, italic and
//!      other formatting on untouched text is kept,
//!   4. write a new zip in which every other entry is copied byte for byte.
//!
//! Paragraphs holding tabs, line breaks, equations, pictures or fields are refused: their text
//! does not map cleanly onto text nodes, so they must be edited in Word.

use crate::error::{AppError, AppResult};
use crate::model::ParagraphEdit;
use quick_xml::events::Event;
use quick_xml::Reader;
use similar::{capture_diff_slices, Algorithm, DiffOp};
use std::collections::{HashMap, HashSet};
use std::io::{Cursor, Read, Write};

/// Elements whose paragraphs the reader does not count (text boxes and the like).
const NOT_COUNTED: [&str; 5] = ["drawing", "pict", "txbxContent", "AlternateContent", "object"];

/// Markup that makes a paragraph too complex to edit safely.
const COMPLEX: [&str; 10] = [
    "<w:tab/>", "<w:br", "<w:cr/>", "<w:drawing", "<w:pict", "<m:oMath", "<w:fldChar", "<w:fldSimple", "<w:sym", "<w:noBreakHyphen",
];

pub fn apply_edits(docx: &[u8], edits: &[ParagraphEdit]) -> AppResult<Vec<u8>> {
    if edits.is_empty() {
        return Err(AppError::Invalid("there are no edits to save".into()));
    }
    let bad = |m: &str| AppError::Docx(m.to_string());
    let mut archive = zip::ZipArchive::new(Cursor::new(docx)).map_err(|e| AppError::Docx(format!("not a valid .docx file ({e})")))?;

    let mut xml = String::new();
    archive.by_name("word/document.xml").map_err(|_| bad("word/document.xml is missing"))?.read_to_string(&mut xml)?;
    let patched = patch_document(&xml, edits)?;

    let mut writer = zip::ZipWriter::new(Cursor::new(Vec::new()));
    for i in 0..archive.len() {
        let file = archive.by_index_raw(i).map_err(|e| AppError::Docx(e.to_string()))?;
        if file.name().map(|name| name == "word/document.xml").unwrap_or(false) {
            writer
                .start_file("word/document.xml", zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated))
                .map_err(|e| AppError::Docx(e.to_string()))?;
            writer.write_all(patched.as_bytes())?;
        } else {
            writer.raw_copy_file(file).map_err(|e| AppError::Docx(e.to_string()))?; // untouched, byte for byte
        }
    }
    Ok(writer.finish().map_err(|e| AppError::Docx(e.to_string()))?.into_inner())
}

fn patch_document(xml: &str, edits: &[ParagraphEdit]) -> AppResult<String> {
    let wanted: HashSet<usize> = edits.iter().map(|e| e.position).collect();
    let ranges = paragraph_ranges(xml, &wanted)?;

    let mut result = xml.to_string();
    // Patch from the end of the file so earlier offsets stay valid.
    let mut ordered: Vec<&ParagraphEdit> = edits.iter().collect();
    ordered.sort_by_key(|e| std::cmp::Reverse(ranges.get(&e.position).map(|r| r.0).unwrap_or(0)));
    for edit in ordered {
        let &(start, end) = ranges.get(&edit.position).ok_or_else(|| AppError::Docx(format!("paragraph {} was not found in the file", edit.position)))?;
        let patched = patch_paragraph(&xml[start..end], &edit.old_text, &edit.new_text)?;
        result.replace_range(start..end, &patched);
    }
    Ok(result)
}

/// Byte range of each wanted paragraph, numbering paragraphs and tables the way the reader does.
fn paragraph_ranges(xml: &str, wanted: &HashSet<usize>) -> AppResult<HashMap<usize, (usize, usize)>> {
    let mut reader = Reader::from_str(xml);
    let mut found = HashMap::new();
    let (mut position, mut skipping) = (0usize, 0usize);
    let mut open: Option<(usize, usize)> = None; // (position, start offset)

    loop {
        let before = reader.buffer_position() as usize;
        let event = reader.read_event().map_err(|e| AppError::Docx(format!("xml: {e}")))?;
        match event {
            Event::Start(tag) => {
                let name = local(tag.name().as_ref());
                if NOT_COUNTED.contains(&name.as_str()) {
                    skipping += 1;
                } else if skipping == 0 {
                    if name == "tbl" {
                        position += 1;
                    } else if name == "p" {
                        if wanted.contains(&position) {
                            open = Some((position, before));
                        }
                        position += 1;
                    }
                }
            }
            Event::Empty(tag) => {
                if skipping == 0 && local(tag.name().as_ref()) == "p" {
                    position += 1; // an empty paragraph still takes a number
                }
            }
            Event::End(tag) => {
                let name = local(tag.name().as_ref());
                if NOT_COUNTED.contains(&name.as_str()) {
                    skipping = skipping.saturating_sub(1);
                } else if skipping == 0 && name == "p" {
                    if let Some((pos, start)) = open.take() {
                        found.insert(pos, (start, reader.buffer_position() as usize));
                    }
                }
            }
            Event::Eof => break,
            _ => {}
        }
    }
    Ok(found)
}

fn local(raw: &str) -> String {
    raw.rsplit(':').next().unwrap_or(raw).to_string()
}

/// One `<w:t>` text node inside a paragraph.
struct TextNode {
    start_tag: (usize, usize),
    content: (usize, usize),
    text: String,
}

fn text_nodes(paragraph: &str) -> Vec<TextNode> {
    let mut nodes = Vec::new();
    let mut from = 0;
    while let Some(found) = paragraph[from..].find("<w:t") {
        let tag_start = from + found;
        let after = paragraph.as_bytes().get(tag_start + 4).copied();
        from = tag_start + 4;
        if !matches!(after, Some(b'>') | Some(b' ')) {
            continue; // <w:tab>, <w:tbl> ... not a text node
        }
        let Some(tag_close) = paragraph[tag_start..].find('>').map(|i| tag_start + i + 1) else { break };
        if paragraph[..tag_close].ends_with("/>") {
            continue; // an empty <w:t/>
        }
        let Some(content_end) = paragraph[tag_close..].find("</w:t>").map(|i| tag_close + i) else { break };
        nodes.push(TextNode { start_tag: (tag_start, tag_close), content: (tag_close, content_end), text: unescape(&paragraph[tag_close..content_end]) });
        from = content_end;
    }
    nodes
}

fn patch_paragraph(paragraph: &str, old: &str, new: &str) -> AppResult<String> {
    if let Some(markup) = COMPLEX.iter().find(|m| paragraph.contains(**m)) {
        return Err(AppError::Docx(format!("this paragraph contains {} and must be edited in Word", markup.trim_start_matches('<').trim_end_matches("/>"))));
    }
    let nodes = text_nodes(paragraph);
    let current: String = nodes.iter().map(|n| n.text.as_str()).collect();
    if nodes.is_empty() || current != old {
        return Err(AppError::Docx("This paragraph changed since you opened it. Reload the document and edit it again.".into()));
    }

    let new_texts = distribute(&nodes, old, new);
    let mut out = paragraph.to_string();
    for (node, text) in nodes.iter().zip(&new_texts).rev() {
        out.replace_range(node.content.0..node.content.1, &escape(text));
        // Leading or trailing spaces only survive if the node says so.
        let tag = &paragraph[node.start_tag.0..node.start_tag.1];
        if !tag.contains("xml:space") {
            let fixed = format!("{} xml:space=\"preserve\">", tag.trim_end_matches('>'));
            out.replace_range(node.start_tag.0..node.start_tag.1, &fixed);
        }
    }
    Ok(out)
}

/// Turn the old text into the new one by character diff, keeping each surviving character in its original node.
fn distribute(nodes: &[TextNode], old: &str, new: &str) -> Vec<String> {
    let old_chars: Vec<char> = old.chars().collect();
    let new_chars: Vec<char> = new.chars().collect();

    let mut owner = Vec::with_capacity(old_chars.len());
    for (index, node) in nodes.iter().enumerate() {
        owner.extend(std::iter::repeat(index).take(node.text.chars().count()));
    }

    let mut keep = vec![true; old_chars.len()];
    let mut start_insert = String::new();
    let mut after: HashMap<usize, String> = HashMap::new();
    let insert_at = |before_index: usize, text: &[char], after: &mut HashMap<usize, String>, start: &mut String| {
        let text: String = text.iter().collect();
        if before_index == 0 {
            start.push_str(&text);
        } else {
            after.entry(before_index - 1).or_default().push_str(&text); // joins the character before it
        }
    };

    for op in capture_diff_slices(Algorithm::Myers, &old_chars, &new_chars) {
        match op {
            DiffOp::Equal { .. } => {}
            DiffOp::Delete { old_index, old_len, .. } => keep[old_index..old_index + old_len].fill(false),
            DiffOp::Insert { old_index, new_index, new_len } => insert_at(old_index, &new_chars[new_index..new_index + new_len], &mut after, &mut start_insert),
            DiffOp::Replace { old_index, old_len, new_index, new_len } => {
                keep[old_index..old_index + old_len].fill(false);
                insert_at(old_index + old_len, &new_chars[new_index..new_index + new_len], &mut after, &mut start_insert);
            }
        }
    }

    let mut texts = vec![String::new(); nodes.len()];
    texts[0].push_str(&start_insert);
    for (i, ch) in old_chars.iter().enumerate() {
        if keep[i] {
            texts[owner[i]].push(*ch);
        }
        if let Some(inserted) = after.get(&i) {
            texts[owner[i]].push_str(inserted);
        }
    }
    texts
}

fn escape(text: &str) -> String {
    text.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;")
}

fn unescape(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(at) = rest.find('&') {
        out.push_str(&rest[..at]);
        rest = &rest[at..];
        let Some(semi) = rest.find(';') else { break };
        let entity = &rest[1..semi];
        let decoded = match entity {
            "amp" => Some('&'),
            "lt" => Some('<'),
            "gt" => Some('>'),
            "quot" => Some('"'),
            "apos" => Some('\''),
            _ => entity
                .strip_prefix("#x")
                .and_then(|h| u32::from_str_radix(h, 16).ok())
                .or_else(|| entity.strip_prefix('#').and_then(|d| d.parse().ok()))
                .and_then(char::from_u32),
        };
        match decoded {
            Some(c) => out.push(c),
            None => out.push_str(&rest[..=semi]),
        }
        rest = &rest[semi + 1..];
    }
    out.push_str(rest);
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::docx;
    use crate::model::Block;

    const DOCUMENT: &str = concat!(
        r#"<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>"#,
        r#"<w:p><w:r><w:t xml:space="preserve">Hello </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>bold</w:t></w:r><w:r><w:t xml:space="preserve"> world</w:t></w:r></w:p>"#,
        r#"<w:tbl><w:tr><w:tc><w:p><w:r><w:t>cell &amp; one</w:t></w:r></w:p></w:tc></w:tr></w:tbl>"#,
        r#"<w:p><w:r><w:t>tab</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>here</w:t></w:r></w:p>"#,
        r#"</w:body></w:document>"#
    );
    const IMAGE: [u8; 6] = [137, 80, 78, 71, 1, 2];

    fn sample() -> Vec<u8> {
        let mut writer = zip::ZipWriter::new(Cursor::new(Vec::new()));
        let options = zip::write::SimpleFileOptions::default();
        writer.start_file("[Content_Types].xml", options).unwrap();
        writer.write_all(b"<Types/>").unwrap();
        writer.start_file("word/document.xml", options).unwrap();
        writer.write_all(DOCUMENT.as_bytes()).unwrap();
        writer.start_file("word/media/image1.png", options).unwrap();
        writer.write_all(&IMAGE).unwrap();
        writer.finish().unwrap().into_inner()
    }

    fn edit(position: usize, old: &str, new: &str) -> ParagraphEdit {
        ParagraphEdit { position, old_text: old.into(), new_text: new.into() }
    }

    fn paragraph_texts(bytes: Vec<u8>) -> Vec<String> {
        fn walk(blocks: &[Block], out: &mut Vec<String>) {
            for block in blocks {
                match block {
                    Block::Paragraph(p) => out.push(p.plain_text()),
                    Block::Table(rows) => rows.iter().flatten().for_each(|cell| walk(cell, out)),
                }
            }
        }
        let mut out = Vec::new();
        walk(&docx::parse(bytes).unwrap().blocks, &mut out);
        out
    }

    #[test]
    fn edits_text_and_keeps_formatting_and_other_files() {
        let edited = apply_edits(&sample(), &[edit(0, "Hello bold world", "Hello bold brave world")]).unwrap();
        assert_eq!(paragraph_texts(edited.clone())[0], "Hello bold brave world");

        let mut archive = zip::ZipArchive::new(Cursor::new(edited.clone())).unwrap();
        let mut image = Vec::new();
        archive.by_name("word/media/image1.png").unwrap().read_to_end(&mut image).unwrap();
        assert_eq!(image, IMAGE, "other files are copied untouched");

        let mut xml = String::new();
        archive.by_name("word/document.xml").unwrap().read_to_string(&mut xml).unwrap();
        assert!(xml.contains("<w:rPr><w:b/></w:rPr><w:t"), "the bold run keeps its formatting");
        let first_run = xml.split("</w:r>").next().unwrap();
        assert!(!first_run.contains("<w:b/>"), "the text before the bold word stays plain");
    }

    #[test]
    fn deleting_replacing_and_special_characters() {
        let edited = apply_edits(&sample(), &[edit(2, "cell & one", "cell & two <b> & more")]).unwrap();
        assert_eq!(paragraph_texts(edited)[1], "cell & two <b> & more");

        let edited = apply_edits(&sample(), &[edit(0, "Hello bold world", "Hi world")]).unwrap();
        assert_eq!(paragraph_texts(edited)[0], "Hi world");
    }

    #[test]
    fn several_edits_at_once() {
        let edited = apply_edits(&sample(), &[edit(0, "Hello bold world", "Goodbye bold world"), edit(2, "cell & one", "cell 1")]).unwrap();
        let texts = paragraph_texts(edited);
        assert_eq!((texts[0].as_str(), texts[1].as_str()), ("Goodbye bold world", "cell 1"));
    }

    #[test]
    fn refuses_stale_complex_and_missing_paragraphs() {
        let stale = apply_edits(&sample(), &[edit(0, "Hello bold WORLD", "x")]).unwrap_err().to_string();
        assert!(stale.contains("changed since"), "got: {stale}");
        let complex = apply_edits(&sample(), &[edit(3, "tabhere", "tab there")]).unwrap_err().to_string();
        assert!(complex.contains("Word"), "got: {complex}");
        assert!(apply_edits(&sample(), &[edit(9, "x", "y")]).is_err());
        assert!(apply_edits(&sample(), &[]).is_err());
    }
}
