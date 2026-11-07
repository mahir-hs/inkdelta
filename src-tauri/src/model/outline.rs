use super::document::WordComment;
use serde::Serialize;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct OutlineItem {
    pub index: usize,
    pub heading: u8,
    pub list_marker: Option<String>,
    pub text: String,
}

/// Flat view of a document: every non-empty paragraph plus its Word comments.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Outline {
    pub items: Vec<OutlineItem>,
    pub comments: Vec<WordComment>,
}
