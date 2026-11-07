//! Reads Word (.docx) files.
//!
//! * `xml`       - tiny XML tree
//! * `package`   - opens the zip container
//! * `numbering` - list markers
//! * `tokenizer` - splits text into words
//! * `parser`    - builds the `Document` (the main logic)
//!
//! Public entry points: [`parse`] and [`outline`].

pub mod edit;
mod numbering;
mod package;
mod parser;
mod tokenizer;
mod xml;

use crate::error::AppResult;
use crate::model::{Block, Document, Outline, OutlineItem};

/// Parse the bytes of a .docx file.
pub fn parse(bytes: Vec<u8>) -> AppResult<Document> {
    parser::parse_document(bytes)
}

/// Flatten a document into a list of non-empty paragraphs (plus its Word comments).
pub fn outline(document: &Document) -> Outline {
    let mut items = Vec::new();
    let mut position = 0;
    collect_outline(&document.blocks, &mut items, &mut position);
    Outline { items, comments: document.comments.clone() }
}

fn collect_outline(blocks: &[Block], items: &mut Vec<OutlineItem>, position: &mut usize) {
    for block in blocks {
        match block {
            Block::Paragraph(paragraph) => {
                let text = paragraph.plain_text().replace('\u{FFFC}', "").trim().to_string();
                if !text.is_empty() {
                    items.push(OutlineItem {
                        index: *position,
                        heading: paragraph.heading,
                        list_marker: paragraph.list_marker.clone(),
                        text,
                    });
                }
                *position += 1;
            }
            Block::Table(rows) => {
                *position += 1;
                for cell in rows.iter().flatten() {
                    collect_outline(cell, items, position);
                }
            }
        }
    }
}
