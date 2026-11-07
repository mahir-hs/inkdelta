//! Line-level staging: stage or unstage individual lines (or whole hunks) of a text file.
//!
//! Git stores whole files in its index, so "stage these three lines" means building a new
//! version of the file that contains only those changes, and putting that in the index.
//!
//! The idea, for both directions: start from a *base* text and walk the diff's hunks in order.
//! Unchanged lines are copied. For each changed line a yes/no decision says whether its change
//! is applied.
//!
//! * **Stage:**   base = the indexed text, diff = index -> working file, apply the *picked* changes.
//! * **Unstage:** base = the last commit's text, diff = commit -> index, apply the *un-picked* changes.

use super::common::find_repository;
use crate::error::{AppError, AppResult};
use crate::model::*;
use git2::{Delta, DiffOptions, Index, IndexEntry, IndexTime, Oid, Patch, Repository};
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::path::Path;

// ------------------------------------------------------------ reading a diff

struct RawLine {
    kind: LineKind,
    /// Exactly as in the file, including the line break (the last line may have none).
    bytes: Vec<u8>,
    old_no: Option<u32>,
    new_no: Option<u32>,
}

struct RawHunk {
    header: String,
    /// 1-based. For a pure insertion (`old_lines == 0`) this is the line *before* the insertion.
    old_start: u32,
    old_lines: u32,
    lines: Vec<RawLine>,
}

struct RawDiff {
    binary: bool,
    deleted: bool,
    hunks: Vec<RawHunk>,
}

/// The diff of one file: working file against the index (`staged = false`), or index against the last commit.
fn read_diff(repo: &Repository, path: &str, staged: bool) -> AppResult<RawDiff> {
    let mut options = DiffOptions::new();
    options.pathspec(path).disable_pathspec_match(true).context_lines(3);

    let diff = if staged {
        let head_tree = repo.head().ok().and_then(|h| h.peel_to_tree().ok());
        repo.diff_tree_to_index(head_tree.as_ref(), None, Some(&mut options))?
    } else {
        options.include_untracked(true).show_untracked_content(true).recurse_untracked_dirs(true);
        repo.diff_index_to_workdir(None, Some(&mut options))?
    };

    let Some(delta) = diff.get_delta(0) else { return Ok(RawDiff { binary: false, deleted: false, hunks: Vec::new() }) };
    let deleted = delta.status() == Delta::Deleted;
    let Some(patch) = Patch::from_diff(&diff, 0)? else { return Ok(RawDiff { binary: true, deleted, hunks: Vec::new() }) };
    // libgit2 only knows a file is binary once it has looked at the content, i.e. after the patch exists.
    if patch.delta().flags().is_binary() {
        return Ok(RawDiff { binary: true, deleted, hunks: Vec::new() });
    }

    let mut hunks = Vec::new();
    for h in 0..patch.num_hunks() {
        let (hunk, line_count) = patch.hunk(h)?;
        let mut lines = Vec::new();
        for l in 0..line_count {
            let line = patch.line_in_hunk(h, l)?;
            let kind = match line.origin() {
                ' ' => LineKind::Context,
                '+' => LineKind::Added,
                '-' => LineKind::Removed,
                _ => continue, // "no newline at end of file" markers are not lines
            };
            lines.push(RawLine { kind, bytes: line.content().to_vec(), old_no: line.old_lineno(), new_no: line.new_lineno() });
        }
        hunks.push(RawHunk {
            header: String::from_utf8_lossy(hunk.header()).trim_end().to_string(),
            old_start: hunk.old_start(),
            old_lines: hunk.old_lines(),
            lines,
        });
    }
    Ok(RawDiff { binary: false, deleted, hunks })
}

/// A short code that changes whenever the diff changes.
fn fingerprint(diff: &RawDiff) -> String {
    let mut hasher = Sha256::new();
    for hunk in &diff.hunks {
        hasher.update(hunk.header.as_bytes());
        for line in &hunk.lines {
            hasher.update([line.kind as u8]);
            hasher.update(&line.bytes);
        }
    }
    hasher.finalize().iter().take(8).map(|b| format!("{b:02x}")).collect()
}

fn display_text(bytes: &[u8]) -> String {
    String::from_utf8_lossy(bytes).trim_end_matches(['\n', '\r']).to_string()
}

pub fn file_diff(repo_path: &str, path: &str, staged: bool) -> AppResult<FileDiff> {
    let repo = find_repository(repo_path)?;
    let raw = read_diff(&repo, path, staged)?;
    let selectable = !raw.binary && !raw.deleted && !raw.hunks.is_empty();
    let fingerprint = fingerprint(&raw);
    let hunks = raw
        .hunks
        .iter()
        .map(|hunk| DiffHunkInfo {
            header: hunk.header.clone(),
            lines: hunk
                .lines
                .iter()
                .map(|l| DiffLineInfo { kind: l.kind, old_no: l.old_no, new_no: l.new_no, text: display_text(&l.bytes) })
                .collect(),
        })
        .collect();
    Ok(FileDiff { path: path.to_string(), staged, binary: raw.binary, hunks, fingerprint, selectable })
}

// ------------------------------------------------------------ rebuilding the file

/// Walk the hunks over `base`, applying each change for which `apply(hunk, line)` is true.
fn rebuild(base: &[u8], hunks: &[RawHunk], apply: &dyn Fn(usize, usize) -> bool) -> AppResult<Vec<u8>> {
    let base_lines: Vec<&[u8]> = base.split_inclusive(|b| *b == b'\n').collect();
    let stale = || AppError::Git("The file changed since this view was loaded. Reload it and select the lines again.".into());

    let mut out = Vec::with_capacity(base.len());
    let mut next = 0usize; // next base line to copy

    for (h, hunk) in hunks.iter().enumerate() {
        let start = if hunk.old_lines == 0 { hunk.old_start as usize } else { hunk.old_start as usize - 1 };
        if start < next || start > base_lines.len() {
            return Err(stale());
        }
        for line in &base_lines[next..start] {
            out.extend_from_slice(line);
        }
        next = start;

        for (l, line) in hunk.lines.iter().enumerate() {
            match line.kind {
                LineKind::Context | LineKind::Removed => {
                    let current = base_lines.get(next).ok_or_else(stale)?;
                    if *current != line.bytes.as_slice() {
                        return Err(stale()); // the base does not match what the diff was made from
                    }
                    let removed = line.kind == LineKind::Removed && apply(h, l);
                    if !removed {
                        out.extend_from_slice(current);
                    }
                    next += 1;
                }
                LineKind::Added => {
                    if apply(h, l) {
                        out.extend_from_slice(&line.bytes);
                    }
                }
            }
        }
    }
    for line in &base_lines[next..] {
        out.extend_from_slice(line);
    }
    Ok(out)
}

fn check_picks(diff: &RawDiff, picks: &[LineRef]) -> AppResult<HashSet<(usize, usize)>> {
    if picks.is_empty() {
        return Err(AppError::Invalid("select at least one changed line".into()));
    }
    let mut set = HashSet::new();
    for pick in picks {
        let line = diff.hunks.get(pick.hunk).and_then(|h| h.lines.get(pick.line));
        match line {
            Some(l) if l.kind != LineKind::Context => {
                set.insert((pick.hunk, pick.line));
            }
            _ => return Err(AppError::Invalid("that line cannot be selected".into())),
        }
    }
    Ok(set)
}

fn require_current(diff: &RawDiff, expected: &str) -> AppResult<()> {
    if diff.binary {
        return Err(AppError::Git("This is not a plain text file: stage the whole file instead.".into()));
    }
    if diff.deleted {
        return Err(AppError::Git("This file was deleted: stage the whole file instead.".into()));
    }
    if fingerprint(diff) != expected {
        return Err(AppError::Git("The file changed since this view was loaded. Reload it and select the lines again.".into()));
    }
    Ok(())
}

// ------------------------------------------------------------ the index

fn indexed_text(repo: &Repository, index: &Index, path: &str) -> AppResult<Vec<u8>> {
    match index.get_path(Path::new(path), 0) {
        Some(entry) => Ok(repo.find_blob(entry.id)?.content().to_vec()),
        None => Ok(Vec::new()),
    }
}

fn committed_text(repo: &Repository, path: &str) -> Option<Vec<u8>> {
    let tree = repo.head().ok()?.peel_to_tree().ok()?;
    let entry = tree.get_path(Path::new(path)).ok()?;
    Some(repo.find_blob(entry.id()).ok()?.content().to_vec())
}

/// Put `content` into the index as the version of `path`.
fn write_to_index(repo: &Repository, index: &mut Index, path: &str, content: &[u8]) -> AppResult<()> {
    let id: Oid = repo.blob(content)?;
    let mut entry = index.get_path(Path::new(path), 0).unwrap_or_else(|| IndexEntry {
        ctime: IndexTime::new(0, 0),
        mtime: IndexTime::new(0, 0),
        dev: 0,
        ino: 0,
        mode: 0o100644,
        uid: 0,
        gid: 0,
        file_size: 0,
        id,
        flags: 0,
        flags_extended: 0,
        path: path.as_bytes().to_vec(),
    });
    entry.id = id;
    entry.file_size = content.len() as u32;
    index.add(&entry)?;
    index.write()?;
    Ok(())
}

// ------------------------------------------------------------ the two actions

/// Stage the picked lines of the working file. `fingerprint` comes from the [`FileDiff`] the user was looking at.
pub fn stage_lines(repo_path: &str, path: &str, picks: &[LineRef], fingerprint: &str) -> AppResult<()> {
    let repo = find_repository(repo_path)?;
    let diff = read_diff(&repo, path, false)?;
    require_current(&diff, fingerprint)?;
    let picked = check_picks(&diff, picks)?;

    let mut index = repo.index()?;
    index.read(true)?;
    let base = indexed_text(&repo, &index, path)?;
    let result = rebuild(&base, &diff.hunks, &|h, l| picked.contains(&(h, l)))?;
    write_to_index(&repo, &mut index, path, &result)
}

/// Take the picked lines back out of the index (the working file is not touched).
pub fn unstage_lines(repo_path: &str, path: &str, picks: &[LineRef], fingerprint: &str) -> AppResult<()> {
    let repo = find_repository(repo_path)?;
    let diff = read_diff(&repo, path, true)?;
    require_current(&diff, fingerprint)?;
    let picked = check_picks(&diff, picks)?;

    let committed = committed_text(&repo, path);
    let base = committed.clone().unwrap_or_default();
    // Everything staged that was NOT picked stays staged.
    let result = rebuild(&base, &diff.hunks, &|h, l| !picked.contains(&(h, l)))?;

    let mut index = repo.index()?;
    index.read(true)?;
    if committed.is_none() && result.is_empty() {
        // A new file with nothing left staged: it is no longer in the index at all.
        index.remove_path(Path::new(path))?;
        index.write()?;
        return Ok(());
    }
    write_to_index(&repo, &mut index, path, &result)
}
