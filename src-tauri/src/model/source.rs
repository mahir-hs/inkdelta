use serde::{Deserialize, Serialize};

#[derive(Deserialize, Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SourceKind {
    /// A committed version inside a Git repository (`rev` is a commit id).
    Git,
    /// The file as it is on disk inside the repository folder.
    Workdir,
    /// Any .docx on disk, no Git involved.
    File,
    /// An empty document: the "before" side when a file was just added.
    Empty,
    /// One side of a merge conflict (`rev` is "ours" or "theirs").
    Stage,
}

/// Points at one version of one document.
#[derive(Deserialize, Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Source {
    pub kind: SourceKind,
    pub repo: Option<String>,
    pub rev: Option<String>,
    /// Repo-relative path for Git/Workdir, absolute path for File.
    pub path: String,
}

/// One paragraph whose text the user changed in the app.
#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ParagraphEdit {
    pub position: usize,
    /// The text the user saw before editing: checked against the file so a stale edit is refused.
    pub old_text: String,
    pub new_text: String,
}

/// A new paragraph to add after an existing one.
#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ParagraphInsert {
    /// Position of the paragraph the new one goes after.
    pub after: usize,
    /// Position of a paragraph whose look (style, font) the new one copies. Defaults to `after`.
    pub like: Option<usize>,
    pub text: String,
}

/// An existing paragraph to remove.
#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ParagraphDelete {
    pub position: usize,
    /// The text the user saw: checked against the file so a stale delete is refused.
    pub old_text: String,
}

/// Everything the user changed in a document, saved together.
#[derive(Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct DocChanges {
    #[serde(default)]
    pub edits: Vec<ParagraphEdit>,
    #[serde(default)]
    pub inserts: Vec<ParagraphInsert>,
    #[serde(default)]
    pub deletes: Vec<ParagraphDelete>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RepoInfo {
    pub root: String,
    pub name: String,
    pub branch: String,
    pub docx_files: Vec<String>,
}

#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum VersionKind {
    Commit,
    Workdir,
}

/// One entry in a document's history.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct VersionInfo {
    pub kind: VersionKind,
    /// Commit id, or empty for the working copy.
    pub id: String,
    pub short_id: String,
    pub summary: String,
    pub author: String,
    /// Unix seconds.
    pub time: i64,
    pub tags: Vec<String>,
    /// Working copy only: true when it differs from the latest commit.
    pub dirty: bool,
}
