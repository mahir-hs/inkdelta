//! Resolving merge conflicts.
//!
//! After a merge stops on conflicts, Git keeps up to three versions of each file in the index:
//!   * "ours"   - the branch you are on
//!   * "theirs" - the branch being merged in
//!   * the common ancestor
//!
//! Word files and other binaries cannot be merged line by line, so for them the user keeps one
//! side whole ([`resolve_side`]). Plain text files carry conflict markers, which are split into
//! hunks ([`conflict_hunks`]) so each can be settled on its own ([`resolve_hunks`]).

use super::common::{find_repository, working_directory};
use crate::error::{AppError, AppResult};
use crate::model::*;
use git2::{IndexConflict, Oid, Repository};
use std::fs;
use std::path::Path;

// ------------------------------------------------------------ finding a conflict

fn conflict_path(conflict: &IndexConflict) -> Option<String> {
    let entry = conflict.our.as_ref().or(conflict.their.as_ref()).or(conflict.ancestor.as_ref())?;
    Some(String::from_utf8_lossy(&entry.path).to_string())
}

fn find_conflict(repo: &Repository, path: &str) -> AppResult<IndexConflict> {
    let mut index = repo.index()?;
    index.read(true)?; // the merge may have been done by another process: re-read from disk
    for conflict in index.conflicts()? {
        let conflict = conflict?;
        if conflict_path(&conflict).as_deref() == Some(path) {
            return Ok(conflict);
        }
    }
    Err(AppError::Git(format!("'{path}' has no conflict (any more).")))
}

fn side_name(side: &str) -> AppResult<MergeSide> {
    match side {
        "ours" => Ok(MergeSide::Ours),
        "theirs" => Ok(MergeSide::Theirs),
        other => Err(AppError::Invalid(format!("unknown side '{other}'"))),
    }
}

fn pick_side(conflict: &IndexConflict, side: MergeSide) -> Option<Oid> {
    match side {
        MergeSide::Ours => conflict.our.as_ref().map(|e| e.id),
        MergeSide::Theirs => conflict.their.as_ref().map(|e| e.id),
    }
}

// ------------------------------------------------------------ describing a conflict

pub fn conflict_info(repo_path: &str, path: &str) -> AppResult<ConflictInfo> {
    let repo = find_repository(repo_path)?;
    let conflict = find_conflict(&repo, path)?;

    let ours_id = pick_side(&conflict, MergeSide::Ours);
    let theirs_id = pick_side(&conflict, MergeSide::Theirs);
    let sample = ours_id.or(theirs_id);
    let is_text = match sample {
        Some(id) => !repo.find_blob(id)?.is_binary(),
        None => false,
    };

    Ok(ConflictInfo {
        path: path.to_string(),
        ours_label: current_branch_name(&repo),
        theirs_label: incoming_branch_name(&repo),
        ours_exists: ours_id.is_some(),
        theirs_exists: theirs_id.is_some(),
        is_text,
    })
}

fn current_branch_name(repo: &Repository) -> String {
    repo.head()
        .ok()
        .and_then(|h| h.shorthand().ok().map(str::to_string))
        .unwrap_or_else(|| "your version".to_string())
}

/// The name of the branch being merged: the branch whose tip is MERGE_HEAD, or its short id.
fn incoming_branch_name(repo: &Repository) -> String {
    let Ok(text) = fs::read_to_string(repo.path().join("MERGE_HEAD")) else { return "incoming".into() };
    let Some(id) = text.lines().next().and_then(|l| Oid::from_str(l.trim()).ok()) else { return "incoming".into() };

    let name = repo.branches(None).ok().and_then(|branches| {
        branches.flatten().find_map(|(branch, _)| {
            let is_incoming = branch.get().target() == Some(id) && !branch.is_head();
            if is_incoming { branch.name().ok().flatten().map(str::to_string) } else { None }
        })
    });
    name.unwrap_or_else(|| id.to_string().chars().take(7).collect())
}

/// The bytes of one side of a conflicted file (used to compare the two Word versions).
pub fn read_conflict_side(repo_path: &str, path: &str, side: &str) -> AppResult<Vec<u8>> {
    let repo = find_repository(repo_path)?;
    let conflict = find_conflict(&repo, path)?;
    let id = pick_side(&conflict, side_name(side)?)
        .ok_or_else(|| AppError::Git(format!("The {side} side deleted '{path}'.")))?;
    let blob = repo.find_blob(id)?;
    let bytes = blob.content().to_vec();
    Ok(bytes)
}

// ------------------------------------------------------------ settling a whole file

/// Keep one side of the file as it is (or delete the file when that side deleted it).
pub fn resolve_side(repo_path: &str, path: &str, side: MergeSide) -> AppResult<()> {
    let repo = find_repository(repo_path)?;
    let full = working_directory(&repo)?.join(path);
    let conflict = find_conflict(&repo, path)?;

    match pick_side(&conflict, side) {
        Some(id) => {
            let blob = repo.find_blob(id)?;
            if let Some(folder) = full.parent() {
                fs::create_dir_all(folder)?;
            }
            fs::write(&full, blob.content())?;
            stage_resolved(&repo, path)
        }
        None => {
            if full.is_file() {
                fs::remove_file(&full)?;
            }
            let mut index = repo.index()?;
            index.read(true)?;
            index.conflict_remove(Path::new(path))?;
            let _ = index.remove_path(Path::new(path)); // already absent is fine
            index.write()?;
            Ok(())
        }
    }
}

/// Accept the file exactly as it is on disk now (for example after editing it elsewhere).
pub fn mark_resolved(repo_path: &str, path: &str) -> AppResult<()> {
    let repo = find_repository(repo_path)?;
    stage_resolved(&repo, path)
}

/// Staging a path clears its conflict entries and records the working file as the result.
fn stage_resolved(repo: &Repository, path: &str) -> AppResult<()> {
    let mut index = repo.index()?;
    index.read(true)?;
    let _ = index.conflict_remove(Path::new(path));
    index.add_path(Path::new(path))?;
    index.write()?;
    Ok(())
}

// ------------------------------------------------------------ settling a text file hunk by hunk

pub fn conflict_hunks(repo_path: &str, path: &str) -> AppResult<Vec<ConflictPart>> {
    let repo = find_repository(repo_path)?;
    let text = read_text(&repo, path)?;
    parse_markers(&text)
}

pub fn resolve_hunks(repo_path: &str, path: &str, choices: &[HunkChoice]) -> AppResult<()> {
    let repo = find_repository(repo_path)?;
    let text = read_text(&repo, path)?;
    let parts = parse_markers(&text)?;
    let resolved = compose(&parts, choices)?;
    fs::write(working_directory(&repo)?.join(path), resolved)?;
    stage_resolved(&repo, path)
}

fn read_text(repo: &Repository, path: &str) -> AppResult<String> {
    let bytes = fs::read(working_directory(repo)?.join(path))?;
    String::from_utf8(bytes).map_err(|_| AppError::Git(format!("'{path}' is not plain text, so it cannot be merged hunk by hunk.")))
}

/// Is this line a conflict marker made of seven `mark` characters (`<<<<<<<`, `=======`, ...)?
fn is_marker(line: &str, mark: char) -> bool {
    let line = line.trim_end_matches(['\r', '\n']);
    let seven = line.chars().take(7).all(|c| c == mark) && line.chars().count() >= 7;
    // "=======" stands alone; the others may be followed by a space and a label.
    seven && (line.len() == 7 || (mark != '=' && line.as_bytes()[7] == b' '))
}

/// Split text with conflict markers into plain stretches and conflicting hunks.
/// Understands the common style and the "diff3" style (which adds a `|||||||` base section).
pub fn parse_markers(text: &str) -> AppResult<Vec<ConflictPart>> {
    enum Mode {
        Plain,
        Ours,
        Base,
        Theirs,
    }
    let mut parts = Vec::new();
    let mut plain = String::new();
    let (mut ours, mut theirs) = (String::new(), String::new());
    let mut mode = Mode::Plain;

    for line in text.split_inclusive('\n') {
        match mode {
            Mode::Plain => {
                if is_marker(line, '<') {
                    if !plain.is_empty() {
                        parts.push(ConflictPart::Text { text: std::mem::take(&mut plain) });
                    }
                    mode = Mode::Ours;
                } else {
                    plain.push_str(line);
                }
            }
            Mode::Ours => {
                if is_marker(line, '|') {
                    mode = Mode::Base;
                } else if is_marker(line, '=') {
                    mode = Mode::Theirs;
                } else {
                    ours.push_str(line);
                }
            }
            Mode::Base => {
                if is_marker(line, '=') {
                    mode = Mode::Theirs; // base lines are dropped: the user chooses between the two sides
                }
            }
            Mode::Theirs => {
                if is_marker(line, '>') {
                    parts.push(ConflictPart::Conflict { ours: std::mem::take(&mut ours), theirs: std::mem::take(&mut theirs) });
                    mode = Mode::Plain;
                } else {
                    theirs.push_str(line);
                }
            }
        }
    }
    if !matches!(mode, Mode::Plain) {
        return Err(AppError::Git("The conflict markers in this file are incomplete. Fix them, then use the file as it is.".into()));
    }
    if !plain.is_empty() {
        parts.push(ConflictPart::Text { text: plain });
    }
    Ok(parts)
}

/// Rebuild the file, applying one choice to each conflicting hunk in order.
pub fn compose(parts: &[ConflictPart], choices: &[HunkChoice]) -> AppResult<String> {
    let hunks = parts.iter().filter(|p| matches!(p, ConflictPart::Conflict { .. })).count();
    if hunks != choices.len() {
        return Err(AppError::Invalid(format!("choose how to settle all {hunks} conflicting sections ({} chosen)", choices.len())));
    }

    let mut result = String::new();
    let mut next = choices.iter();
    for part in parts {
        match part {
            ConflictPart::Text { text } => result.push_str(text),
            ConflictPart::Conflict { ours, theirs } => match next.next().expect("counted above") {
                HunkChoice::Ours => result.push_str(ours),
                HunkChoice::Theirs => result.push_str(theirs),
                HunkChoice::Both => {
                    result.push_str(ours);
                    if !ours.is_empty() && !ours.ends_with('\n') {
                        result.push('\n');
                    }
                    result.push_str(theirs);
                }
                HunkChoice::Custom { text } => result.push_str(text),
            },
        }
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_a_simple_conflict() {
        let text = "before\n<<<<<<< HEAD\nmine\n=======\ntheirs\n>>>>>>> other\nafter\n";
        let parts = parse_markers(text).unwrap();
        assert_eq!(parts.len(), 3);
        assert_eq!(parts[0], ConflictPart::Text { text: "before\n".into() });
        assert_eq!(parts[1], ConflictPart::Conflict { ours: "mine\n".into(), theirs: "theirs\n".into() });
        assert_eq!(parts[2], ConflictPart::Text { text: "after\n".into() });
    }

    #[test]
    fn understands_diff3_style_and_drops_the_base() {
        let text = "<<<<<<< HEAD\nmine\n||||||| base\noriginal\n=======\ntheirs\n>>>>>>> other\n";
        let parts = parse_markers(text).unwrap();
        assert_eq!(parts, vec![ConflictPart::Conflict { ours: "mine\n".into(), theirs: "theirs\n".into() }]);
    }

    #[test]
    fn handles_several_hunks_and_windows_line_endings() {
        let text = "a\r\n<<<<<<< HEAD\r\nx\r\n=======\r\ny\r\n>>>>>>> o\r\nb\r\n<<<<<<< HEAD\r\n1\r\n=======\r\n2\r\n>>>>>>> o\r\n";
        let parts = parse_markers(text).unwrap();
        let hunks = parts.iter().filter(|p| matches!(p, ConflictPart::Conflict { .. })).count();
        assert_eq!(hunks, 2);
        let out = compose(&parts, &[HunkChoice::Theirs, HunkChoice::Ours]).unwrap();
        assert_eq!(out, "a\r\ny\r\nb\r\n1\r\n");
    }

    #[test]
    fn both_keeps_each_side_on_its_own_line() {
        let parts = parse_markers("<<<<<<< H\nno newline\n=======\nother\n>>>>>>> o\n").unwrap();
        assert_eq!(compose(&parts, &[HunkChoice::Both]).unwrap(), "no newline\nother\n");
        let parts = parse_markers("<<<<<<< H\nmine\n=======\ntheirs\n>>>>>>> o\n").unwrap();
        assert_eq!(compose(&parts, &[HunkChoice::Custom { text: "merged by hand\n".into() }]).unwrap(), "merged by hand\n");
    }

    #[test]
    fn rejects_incomplete_markers_and_wrong_choice_counts() {
        assert!(parse_markers("<<<<<<< HEAD\nmine\n=======\nno end\n").is_err());
        let parts = parse_markers("<<<<<<< H\na\n=======\nb\n>>>>>>> o\n").unwrap();
        assert!(compose(&parts, &[]).is_err());
    }

    #[test]
    fn ordinary_lines_that_look_a_little_like_markers_are_left_alone() {
        let text = "=======\nsome text\n<<<<<< six only\n";
        assert_eq!(parse_markers(text).unwrap(), vec![ConflictPart::Text { text: text.into() }]);
    }
}
