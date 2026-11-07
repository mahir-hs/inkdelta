//! Branches and tags: list, create, switch, delete.

use super::common::find_repository;
use crate::error::{AppError, AppResult};
use crate::model::*;
use git2::{build::CheckoutBuilder, BranchType, ObjectType, Repository};

pub fn list_branches(repo_path: &str) -> AppResult<Vec<BranchInfo>> {
    let repo = find_repository(repo_path)?;
    let mut result = Vec::new();

    for entry in repo.branches(None)? {
        let (branch, kind) = entry?;
        let Some(name) = branch.name()?.map(str::to_string) else { continue };
        if name.ends_with("/HEAD") {
            continue; // origin/HEAD is only a pointer
        }

        let commit = branch.get().peel_to_commit().ok();
        let upstream = branch.upstream().ok();
        let (ahead, behind) = match (&upstream, commit.as_ref()) {
            (Some(up), Some(local)) => up
                .get()
                .target()
                .and_then(|remote| repo.graph_ahead_behind(local.id(), remote).ok())
                .unwrap_or((0, 0)),
            _ => (0, 0),
        };

        result.push(BranchInfo {
            is_current: branch.is_head(),
            is_remote: kind == BranchType::Remote,
            upstream: upstream.and_then(|u| u.name().ok().flatten().map(str::to_string)),
            ahead,
            behind,
            summary: commit.as_ref().and_then(|c| c.summary().ok().flatten()).unwrap_or("").to_string(),
            time: commit.as_ref().map(|c| c.time().seconds()).unwrap_or(0),
            name,
        });
    }

    // Current branch first, then local, then remote; newest activity first inside each group.
    result.sort_by(|a, b| {
        b.is_current
            .cmp(&a.is_current)
            .then(a.is_remote.cmp(&b.is_remote))
            .then(b.time.cmp(&a.time))
    });
    Ok(result)
}

/// Create a branch at `start` (a branch, tag or commit id), or at HEAD when `start` is None.
pub fn create_branch(repo_path: &str, name: &str, start: Option<&str>, checkout_after: bool) -> AppResult<()> {
    let name = validated_name(name)?;
    let repo = find_repository(repo_path)?;
    let commit = match start {
        Some(rev) => repo.revparse_single(rev)?.peel_to_commit()?,
        None => repo
            .head()
            .and_then(|h| h.peel_to_commit())
            .map_err(|_| AppError::Git("Make a first commit before creating branches.".into()))?,
    };
    repo.branch(name, &commit, false)
        .map_err(|e| AppError::Git(format!("Could not create '{name}': {}", e.message())))?;
    if checkout_after {
        checkout_branch(repo_path, name)?;
    }
    Ok(())
}

/// Switch to a branch. Passing a remote branch (origin/x) creates a local tracking branch first.
pub fn checkout_branch(repo_path: &str, name: &str) -> AppResult<()> {
    let repo = find_repository(repo_path)?;

    let local_name = if repo.find_branch(name, BranchType::Local).is_ok() {
        name.to_string()
    } else if let Ok(remote) = repo.find_branch(name, BranchType::Remote) {
        let short = name.split_once('/').map(|(_, rest)| rest).unwrap_or(name).to_string();
        if repo.find_branch(&short, BranchType::Local).is_err() {
            let commit = remote.get().peel_to_commit()?;
            let mut local = repo.branch(&short, &commit, false)?;
            local.set_upstream(Some(name))?;
        }
        short
    } else {
        return Err(AppError::Git(format!("There is no branch called '{name}'.")));
    };

    let reference = format!("refs/heads/{local_name}");
    let target = repo.revparse_single(&reference)?;

    // "Safe" checkout refuses to overwrite uncommitted work and reports a conflict instead.
    let mut options = CheckoutBuilder::new();
    options.safe();
    repo.checkout_tree(&target, Some(&mut options)).map_err(|e| {
        AppError::Git(format!(
            "Cannot switch to '{local_name}' because your uncommitted changes would be overwritten. Commit or stash them first. ({})",
            e.message()
        ))
    })?;
    repo.set_head(&reference)?;
    Ok(())
}

/// Delete a local branch. Unmerged branches need `force` (the UI must confirm).
pub fn delete_branch(repo_path: &str, name: &str, force: bool) -> AppResult<()> {
    let repo = find_repository(repo_path)?;
    let mut branch = repo
        .find_branch(name, BranchType::Local)
        .map_err(|_| AppError::Git(format!("There is no local branch called '{name}'.")))?;
    if branch.is_head() {
        return Err(AppError::Git("You cannot delete the branch you are on. Switch to another branch first.".into()));
    }
    if !force && !is_merged_into_head(&repo, &branch) {
        return Err(AppError::Git(format!(
            "'{name}' has commits that are not merged into your current branch. Delete anyway to lose them."
        )));
    }
    branch.delete()?;
    Ok(())
}

fn is_merged_into_head(repo: &Repository, branch: &git2::Branch) -> bool {
    let (Some(tip), Some(head)) = (branch.get().target(), repo.head().ok().and_then(|h| h.target())) else {
        return false;
    };
    tip == head || repo.graph_descendant_of(head, tip).unwrap_or(false)
}

pub fn create_tag(repo_path: &str, name: &str, message: Option<&str>) -> AppResult<()> {
    let name = validated_name(name)?;
    let repo = find_repository(repo_path)?;
    let target = repo.head()?.peel(ObjectType::Commit)?;
    match message.map(str::trim).filter(|m| !m.is_empty()) {
        Some(text) => {
            let signature = repo.signature()?;
            repo.tag(name, &target, &signature, text, false)?;
        }
        None => {
            repo.tag_lightweight(name, &target, false)?;
        }
    }
    Ok(())
}

pub fn delete_tag(repo_path: &str, name: &str) -> AppResult<()> {
    let repo = find_repository(repo_path)?;
    repo.tag_delete(name)?;
    Ok(())
}

fn validated_name(name: &str) -> AppResult<&str> {
    let name = name.trim();
    if name.is_empty() {
        return Err(AppError::Invalid("enter a name".into()));
    }
    if !git2::Reference::is_valid_name(&format!("refs/heads/{name}")) {
        return Err(AppError::Invalid(format!(
            "'{name}' is not a valid name. Avoid spaces and characters like ~ ^ : ? * [ \\."
        )));
    }
    Ok(name)
}
