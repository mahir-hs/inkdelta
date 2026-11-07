//! Everything Git.
//!
//! Built-in engine (libgit2), works without Git installed:
//! * `history`  - versions of a .docx, and reading a file at a version
//! * `status`   - changed files, stage / unstage / discard / commit
//! * `branches` - branches and tags
//! * `stash`    - shelve and restore uncommitted work
//! * `graph`    - the commit graph and the files of one commit
//! * `conflicts` - resolving merge conflicts
//! * `lines`     - the diff of one text file, and staging individual lines or hunks
//! * `identity` - name and email on commits
//!
//! Installed Git program, only for talking to servers:
//! * `cli`      - fetch, pull, push, clone, merge

pub mod branches;
pub mod cli;
mod common;
pub mod conflicts;
pub mod graph;
pub mod history;
pub mod identity;
pub mod lines;
pub mod stash;
pub mod status;

pub use history::{file_versions, open_repository, read_source, working_file};

#[cfg(test)]
mod tests;
