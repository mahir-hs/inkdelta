//! Data types for the Git client features (status, branches, stash, graph).

use serde::{Deserialize, Serialize};

#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ChangeStatus {
    Added,
    Modified,
    Deleted,
    Renamed,
    Untracked,
    Conflicted,
    TypeChange,
}

/// One changed file. A file changed both in the index and in the working
/// folder appears twice: once with `staged = true`, once with `staged = false`.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FileChange {
    pub path: String,
    pub status: ChangeStatus,
    pub staged: bool,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RepoStatus {
    pub branch: String,
    pub detached: bool,
    pub has_commits: bool,
    pub upstream: Option<String>,
    pub ahead: usize,
    pub behind: usize,
    /// A merge is in progress (conflicts to resolve, or a commit to finish).
    pub merging: bool,
    /// The message Git prepared for the merge commit ("Merge branch ..."), while merging.
    pub merge_message: Option<String>,
    pub files: Vec<FileChange>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct BranchInfo {
    pub name: String,
    pub is_current: bool,
    pub is_remote: bool,
    pub upstream: Option<String>,
    pub ahead: usize,
    pub behind: usize,
    pub summary: String,
    pub time: i64,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct StashInfo {
    pub index: usize,
    pub message: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RemoteInfo {
    pub name: String,
    pub url: String,
}

#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum RefKind {
    Head,
    Branch,
    Remote,
    Tag,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RefLabel {
    pub name: String,
    pub kind: RefKind,
}

/// A line from one lane in the row above to a lane in this row (or this row to the next).
#[derive(Serialize, Clone, Copy, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LaneLink {
    pub from: usize,
    pub to: usize,
}

/// One row of the commit graph, with everything needed to draw it.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GraphRow {
    pub id: String,
    pub short_id: String,
    pub parents: Vec<String>,
    pub summary: String,
    pub author: String,
    pub time: i64,
    pub refs: Vec<RefLabel>,
    /// Column of this commit's dot.
    pub lane: usize,
    /// Lines coming into this row from the row above.
    pub top: Vec<LaneLink>,
    /// Lines leaving this row towards the row below.
    pub bottom: Vec<LaneLink>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Graph {
    pub rows: Vec<GraphRow>,
    pub lane_count: usize,
    /// More commits exist beyond the requested limit.
    pub truncated: bool,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CommitFile {
    pub path: String,
    pub status: ChangeStatus,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GitToolInfo {
    pub available: bool,
    pub version: String,
}

// ---------- merge conflicts ----------

/// Which side of a merge: "ours" is the branch you are on, "theirs" is the one being merged in.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum MergeSide {
    Ours,
    Theirs,
}

/// Everything the resolver needs to know about one conflicted file.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ConflictInfo {
    pub path: String,
    /// Name of the branch you are on.
    pub ours_label: String,
    /// Name of the branch being merged in.
    pub theirs_label: String,
    /// False when that side deleted the file.
    pub ours_exists: bool,
    pub theirs_exists: bool,
    /// Plain text that can be merged hunk by hunk (not a Word file or other binary).
    pub is_text: bool,
}

/// A file with conflict markers, split into untouched text and conflicting hunks.
#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum ConflictPart {
    Text { text: String },
    Conflict { ours: String, theirs: String },
}

/// How to settle one conflicting hunk.
#[derive(Deserialize, Clone, Debug)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum HunkChoice {
    Ours,
    Theirs,
    Both,
    Custom { text: String },
}

// ---------- line-level staging ----------

#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum LineKind {
    Context,
    Added,
    Removed,
}

/// One line of a diff, ready to draw.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DiffLineInfo {
    pub kind: LineKind,
    pub old_no: Option<u32>,
    pub new_no: Option<u32>,
    /// Without the trailing line break.
    pub text: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DiffHunkInfo {
    /// The "@@ -3,4 +3,6 @@" line.
    pub header: String,
    pub lines: Vec<DiffLineInfo>,
}

/// The changes of one text file, either not yet staged or already staged.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FileDiff {
    pub path: String,
    pub staged: bool,
    pub binary: bool,
    pub hunks: Vec<DiffHunkInfo>,
    /// Changes if the file changes. Sent back with a staging request so a stale view is refused.
    pub fingerprint: String,
    /// Lines can be picked individually (text files that were added or modified, not deleted).
    pub selectable: bool,
}

/// Points at one line inside a [`FileDiff`]: hunk number and line number within that hunk.
#[derive(Deserialize, Clone, Copy, Debug, PartialEq, Eq, Hash)]
#[serde(rename_all = "camelCase")]
pub struct LineRef {
    pub hunk: usize,
    pub line: usize,
}
