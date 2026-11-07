//! The in-memory shape of a parsed Word document.

use serde::Serialize;
use std::collections::HashMap;

/// Character formatting we keep and show in the redline.
#[derive(Serialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct Format {
    pub bold: bool,
    pub italic: bool,
    pub underline: bool,
    pub superscript: bool,
    pub subscript: bool,
    /// Text came from a Word equation.
    pub math: bool,
}

/// The smallest unit we compare: a word, a run of spaces, one punctuation mark, or an image.
#[derive(Clone, Debug)]
pub struct Token {
    pub text: String,
    pub format: Format,
    /// Content hash when the token is an embedded image.
    pub image: Option<String>,
}

impl Token {
    /// Value used to decide whether two tokens are "the same" during diffing.
    pub fn compare_key(&self) -> String {
        match &self.image {
            Some(hash) => format!("\u{FFFC}{hash}"),
            None => self.text.clone(),
        }
    }
}

#[derive(Clone, Debug, Default)]
pub struct Paragraph {
    /// 0 = body text, 1..=6 = heading level.
    pub heading: u8,
    /// Rendered list marker such as "1." or a bullet, when the paragraph is a list item.
    pub list_marker: Option<String>,
    pub indent: u8,
    pub tokens: Vec<Token>,
    /// Number of this paragraph among all paragraphs and tables, in reading order (used to find it again).
    pub position: usize,
    /// Plain text only: no tabs, breaks, equations, pictures or fields. Only these can be edited in the app.
    pub editable: bool,
}

impl Paragraph {
    pub fn plain_text(&self) -> String {
        self.tokens.iter().map(Token::compare_key).collect()
    }
}

#[derive(Clone, Debug)]
pub enum Block {
    Paragraph(Paragraph),
    /// rows -> cells -> blocks inside the cell
    Table(Vec<Vec<Vec<Block>>>),
}

/// A comment written inside Word (Review > New Comment).
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct WordComment {
    pub id: String,
    pub author: String,
    pub date: String,
    pub text: String,
    pub anchor_block: Option<usize>,
    pub anchor_text: String,
}

#[derive(Clone, Debug, Default)]
pub struct Document {
    pub blocks: Vec<Block>,
    pub comments: Vec<WordComment>,
    /// image hash -> `data:` URL, ready for an img tag
    pub images: HashMap<String, String>,
}
