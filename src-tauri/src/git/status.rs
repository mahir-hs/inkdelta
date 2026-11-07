//! Working-tree status and the everyday actions: stage, unstage, discard, commit.

use super::common::{find_repository, working_directory};
use crate::error::{AppError, AppResult};
use crate::model::*;
use git2::{build::CheckoutBuilder, IndexAddOption, Repository, RepositoryState, Status, StatusOptions};
use std::path::Path;

pub fn repo_status(repo_path: &str) -> AppResult<RepoStatus> {
    let repo = find_repository(repo_path)?;
    let has_commits = repo.head().is_ok();

    let (branch, detached) = match repo.head() {
        Ok(head) if head.is_branch() => (head.shorthand().unwrap_or("HEAD").to_string(), false),
        Ok(head) => (head.target().map(|id| id.to_string().chars().take(7).collect()).unwrap_or_default(), true),
        // Before the first commit HEAD points at a branch that does not exist yet.
        Err(_) => (unborn_branch_name(&repo), false),
    };

    let (upstream, ahead, behind) = upstream_state(&repo);
    let merging = repo.state() == RepositoryState::Merge;
    let merge_message = if merging {
        std::fs::read_to_string(repo.path().join("MERGE_MSG")).ok().map(|m| clean_commit_message(&m)).filter(|m| !m.is_empty())
    } else {
        None
    };

    Ok(RepoStatus { branch, detached, has_commits, upstream, ahead, behind, merging, merge_message, files: changed_files(&repo)? })
}

/// Git's prepared messages contain "# Conflicts:" comment lines that Git itself strips when you
/// commit through its editor. We commit directly, so strip them here.
fn clean_commit_message(raw: &str) -> String {
    let kept: Vec<&str> = raw.lines().filter(|line| !line.starts_with('#')).collect();
    kept.join("\n").trim().to_string()
}

fn unborn_branch_name(repo: &Repository) -> String {
    repo.find_reference("HEAD")
        .ok()
        .and_then(|r| r.symbolic_target().ok().flatten().map(|t| t.trim_start_matches("refs/heads/").to_string()))
        .unwrap_or_else(|| "main".to_string())
}

/// Name of the tracked remote branch, and how far ahead/behind it the current branch is.
fn upstream_state(repo: &Repository) -> (Option<String>, usize, usize) {
    let Ok(head) = repo.head() else { return (None, 0, 0) };
    if !head.is_branch() {
        return (None, 0, 0);
    }
    let Ok(name) = head.shorthand() else { return (None, 0, 0) };
    let Ok(branch) = repo.find_branch(name, git2::BranchType::Local) else { return (None, 0, 0) };
    let Ok(upstream) = branch.upstream() else { return (None, 0, 0) };

    let upstream_name = upstream.name().ok().flatten().map(str::to_string);
    let (ahead, behind) = match (head.target(), upstream.get().target()) {
        (Some(local), Some(remote)) => repo.graph_ahead_behind(local, remote).unwrap_or((0, 0)),
        _ => (0, 0),
    };
    (upstream_name, ahead, behind)
}

fn changed_files(repo: &Repository) -> AppResult<Vec<FileChange>> {
    let mut options = StatusOptions::new();
    options.include_untracked(true).recurse_untracked_dirs(true).renames_head_to_index(true);

    let mut files = Vec::new();
    for entry in repo.statuses(Some(&mut options))?.iter() {
        let Ok(path) = entry.path() else { continue };
        let flags = entry.status();

        if flags.contains(Status::CONFLICTED) {
            files.push(FileChange { path: path.to_string(), status: ChangeStatus::Conflicted, staged: false });
            continue;
        }
        if let Some(status) = staged_status(flags) {
            files.push(FileChange { path: path.to_string(), status, staged: true });
        }
        if let Some(status) = unstaged_status(flags) {
            files.push(FileChange { path: path.to_string(), status, staged: false });
        }
    }
    Ok(files)
}

fn staged_status(flags: Status) -> Option<ChangeStatus> {
    if flags.contains(Status::INDEX_NEW) {
        Some(ChangeStatus::Added)
    } else if flags.contains(Status::INDEX_MODIFIED) {
        Some(ChangeStatus::Modified)
    } else if flags.contains(Status::INDEX_DELETED) {
        Some(ChangeStatus::Deleted)
    } else if flags.contains(Status::INDEX_RENAMED) {
        Some(ChangeStatus::Renamed)
    } else if flags.contains(Status::INDEX_TYPECHANGE) {
        Some(ChangeStatus::TypeChange)
    } else {
        None
    }
}

fn unstaged_status(flags: Status) -> Option<ChangeStatus> {
    if flags.contains(Status::WT_NEW) {
        Some(ChangeStatus::Untracked)
    } else if flags.contains(Status::WT_MODIFIED) {
        Some(ChangeStatus::Modified)
    } else if flags.contains(Status::WT_DELETED) {
        Some(ChangeStatus::Deleted)
    } else if flags.contains(Status::WT_RENAMED) {
        Some(ChangeStatus::Renamed)
    } else if flags.contains(Status::WT_TYPECHANGE) {
        Some(ChangeStatus::TypeChange)
    } else {
        None
    }
}

// ------------------------------------------------------------ stage / unstage / discard

/// Stage these files. An empty list stages everything.
pub fn stage(repo_path: &str, paths: &[String]) -> AppResult<()> {
    let repo = find_repository(repo_path)?;
    let workdir = working_directory(&repo)?;
    let mut index = repo.index()?;

    if paths.is_empty() {
        index.add_all(["*"].iter(), IndexAddOption::DEFAULT, None)?;
        index.update_all(["*"].iter(), None)?; // also records deletions
    } else {
        for path in paths {
            if workdir.join(path).exists() {
                index.add_path(Path::new(path))?;
            } else {
                index.remove_path(Path::new(path))?; // the file was deleted
            }
        }
    }
    index.write()?;
    Ok(())
}

/// Remove these files from the next commit (the files themselves are untouched).
pub fn unstage(repo_path: &str, paths: &[String]) -> AppResult<()> {
    let repo = find_repository(repo_path)?;
    let targets: Vec<String> = if paths.is_empty() {
        changed_files(&repo)?.into_iter().filter(|f| f.staged).map(|f| f.path).collect()
    } else {
        paths.to_vec()
    };
    if targets.is_empty() {
        return Ok(());
    }

    match repo.head().ok().and_then(|h| h.peel(git2::ObjectType::Commit).ok()) {
        Some(head) => repo.reset_default(Some(&head), targets.iter())?,
        None => {
            // No commit yet: unstaging simply means removing from the index.
            let mut index = repo.index()?;
            for path in &targets {
                index.remove_path(Path::new(path))?;
            }
            index.write()?;
        }
    }
    Ok(())
}

/// DESTRUCTIVE: throw away uncommitted changes in these files. The UI must confirm first.
pub fn discard(repo_path: &str, paths: &[String]) -> AppResult<()> {
    if paths.is_empty() {
        return Err(AppError::Invalid("choose which files to discard".into()));
    }
    let repo = find_repository(repo_path)?;
    let workdir = working_directory(&repo)?;

    let untracked: Vec<&String> = changed_files(&repo)?
        .iter()
        .filter(|f| f.status == ChangeStatus::Untracked)
        .filter_map(|f| paths.iter().find(|p| **p == f.path))
        .collect();

    // New files are deleted; everything else is restored from the last commit.
    for path in &untracked {
        let full = workdir.join(path);
        if full.is_file() {
            std::fs::remove_file(full)?;
        }
    }
    let tracked: Vec<&String> = paths.iter().filter(|p| !untracked.contains(p)).collect();
    if !tracked.is_empty() {
        let mut checkout = CheckoutBuilder::new();
        checkout.force();
        for path in tracked {
            checkout.path(path);
        }
        repo.checkout_head(Some(&mut checkout))?;
    }
    Ok(())
}

// ------------------------------------------------------------ commit

/// Commit whatever is staged. Returns the new commit's id.
pub fn commit(repo_path: &str, message: &str, amend: bool) -> AppResult<String> {
    let message = message.trim();
    if message.is_empty() && !amend {
        return Err(AppError::Invalid("write a commit message first".into()));
    }
    let mut repo = find_repository(repo_path)?;
    let signature = repo.signature().map_err(|_| {
        AppError::Git("Git does not know who you are. Set your name and email in Settings > Identity.".into())
    })?;

    // Read the merge heads first: it needs exclusive access to the repository.
    let merging = repo.state() == RepositoryState::Merge;
    let mut merge_head_ids = Vec::new();
    if merging {
        repo.mergehead_foreach(|oid| {
            merge_head_ids.push(*oid);
            true
        })?;
    }

    let mut index = repo.index()?;
    if index.has_conflicts() {
        return Err(AppError::Git("Resolve the conflicts and stage those files before committing.".into()));
    }
    let tree = repo.find_tree(index.write_tree()?)?;
    let head_commit = repo.head().ok().and_then(|h| h.peel_to_commit().ok());

    if amend {
        let previous = head_commit.ok_or_else(|| AppError::Git("there is no commit to amend".into()))?;
        let text = if message.is_empty() { previous.message().unwrap_or("").to_string() } else { message.to_string() };
        let id = previous.amend(Some("HEAD"), None, Some(&signature), None, Some(&text), Some(&tree))?;
        return Ok(id.to_string());
    }

    // Parents: the current commit, plus the merged branch when finishing a merge.
    let mut parents = Vec::new();
    if let Some(head) = head_commit {
        parents.push(head);
    }
    for oid in &merge_head_ids {
        parents.push(repo.find_commit(*oid)?);
    }
    let parent_refs: Vec<&git2::Commit> = parents.iter().collect();
    let id = repo.commit(Some("HEAD"), &signature, &signature, message, &tree, &parent_refs)?;
    if merging {
        repo.cleanup_state()?;
    }
    Ok(id.to_string())
}
