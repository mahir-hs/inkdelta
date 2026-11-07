//! Small files the app saves next to the user's work.
//!
//! Review progress (which reviewer comment is done, notes, links to changes) is
//! stored as JSON in `<repo>/.inkdelta/review.json`, so it can be committed
//! and shared with co-authors. The UI owns the JSON shape; the backend only
//! reads and writes the text.

use crate::error::{AppError, AppResult};
use std::fs;
use std::path::PathBuf;

fn review_file(repo_root: &str) -> PathBuf {
    PathBuf::from(repo_root).join(".inkdelta").join("review.json")
}

pub fn load_review_state(repo_root: &str) -> AppResult<Option<String>> {
    let path = review_file(repo_root);
    if !path.is_file() {
        return Ok(None);
    }
    Ok(Some(fs::read_to_string(path)?))
}

pub fn save_review_state(repo_root: &str, json: &str) -> AppResult<()> {
    let path = review_file(repo_root);
    if let Some(folder) = path.parent() {
        fs::create_dir_all(folder)?;
    }
    fs::write(path, json)?;
    Ok(())
}

/// Replace a file safely: write a temporary file next to it, then swap it in.
/// If the file is open in Word (which locks it) the swap fails and the original is left untouched.
pub fn replace_file(path: &std::path::Path, content: &[u8]) -> AppResult<()> {
    let mut temp = path.as_os_str().to_owned();
    temp.push(".inkdelta-tmp");
    let temp = PathBuf::from(temp);
    fs::write(&temp, content)?;
    fs::rename(&temp, path).map_err(|e| {
        let _ = fs::remove_file(&temp);
        AppError::Io(format!("Could not save. If the document is open in Word, close it and try again. ({e})"))
    })
}

/// Used by "Export": the UI builds the HTML, the backend just writes it.
pub fn save_text_file(path: &str, content: &str) -> AppResult<()> {
    if path.trim().is_empty() {
        return Err(AppError::Invalid("no file path given".into()));
    }
    fs::write(path, content)?;
    Ok(())
}
