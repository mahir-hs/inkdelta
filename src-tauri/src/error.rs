//! One error type for the whole backend.
//!
//! Tauri sends command errors to the UI as strings, so `AppError` serialises
//! to its message. Add a variant here when a new *kind* of failure appears.

use serde::{Serialize, Serializer};
use std::fmt;

#[derive(Debug)]
pub enum AppError {
    /// Reading or writing a file failed.
    Io(String),
    /// The .docx file is damaged or not a Word document.
    Docx(String),
    /// A Git operation failed (not a repo, unknown revision, ...).
    Git(String),
    /// The UI sent something we cannot act on.
    Invalid(String),
}

pub type AppResult<T> = Result<T, AppError>;

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AppError::Io(m) => write!(f, "File error: {m}"),
            AppError::Docx(m) => write!(f, "Document error: {m}"),
            AppError::Git(m) => write!(f, "Git error: {m}"),
            AppError::Invalid(m) => write!(f, "{m}"),
        }
    }
}

impl std::error::Error for AppError {}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError::Io(e.to_string())
    }
}

impl From<git2::Error> for AppError {
    fn from(e: git2::Error) -> Self {
        AppError::Git(e.message().to_string())
    }
}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}
