//! The comparison result sent to the UI.

use super::document::WordComment;
use serde::Serialize;
use std::collections::HashMap;

#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SegmentOp {
    Equal,
    Inserted,
    Deleted,
}

#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum BlockKind {
    Equal,
    Inserted,
    Deleted,
    Modified,
}

/// A piece of paragraph text with one status and one format.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DiffSegment {
    pub op: SegmentOp,
    pub text: String,
    pub bold: bool,
    pub italic: bool,
    pub underline: bool,
    pub superscript: bool,
    pub subscript: bool,
    pub math: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DiffParagraph {
    pub kind: BlockKind,
    pub heading: u8,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub list_marker: Option<String>,
    pub indent: u8,
    pub position: usize,
    pub editable: bool,
    pub segments: Vec<DiffSegment>,
    /// 1-based position in the "next/previous change" list. None when unchanged.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub change: Option<usize>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum DiffBlock {
    Paragraph(DiffParagraph),
    Table {
        kind: BlockKind,
        rows: Vec<Vec<Vec<DiffBlock>>>,
    },
}

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct Stats {
    pub inserted_paragraphs: usize,
    pub deleted_paragraphs: usize,
    pub modified_paragraphs: usize,
    pub words_added: usize,
    pub words_removed: usize,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DiffDocument {
    pub blocks: Vec<DiffBlock>,
    pub change_count: usize,
    pub stats: Stats,
    /// image hash -> `data:` URL, from both versions
    pub images: HashMap<String, String>,
    /// Word comments found in the newer version
    pub comments: Vec<WordComment>,
}
