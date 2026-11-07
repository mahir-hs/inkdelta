//! Stash: shelve uncommitted work and bring it back later.

use super::common::find_repository;
use crate::error::{AppError, AppResult};
use crate::model::StashInfo;
use git2::StashFlags;

pub fn list_stashes(repo_path: &str) -> AppResult<Vec<StashInfo>> {
    let mut repo = find_repository(repo_path)?;
    let mut stashes = Vec::new();
    repo.stash_foreach(|index, message, _id| {
        stashes.push(StashInfo { index, message: message.to_string() });
        true
    })?;
    Ok(stashes)
}

pub fn stash_save(repo_path: &str, message: &str, include_untracked: bool) -> AppResult<()> {
    let mut repo = find_repository(repo_path)?;
    let signature = repo.signature().map_err(|_| AppError::Git("Set your name and email before stashing.".into()))?;
    let flags = if include_untracked { StashFlags::INCLUDE_UNTRACKED } else { StashFlags::DEFAULT };
    let text = message.trim();
    repo.stash_save2(&signature, if text.is_empty() { None } else { Some(text) }, Some(flags))
        .map_err(|e| {
            if e.code() == git2::ErrorCode::NotFound {
                AppError::Git("There is nothing to stash: no local changes.".into())
            } else {
                e.into()
            }
        })?;
    Ok(())
}

/// Re-apply a stash and keep it in the list.
pub fn stash_apply(repo_path: &str, index: usize) -> AppResult<()> {
    let mut repo = find_repository(repo_path)?;
    repo.stash_apply(index, None)
        .map_err(|e| AppError::Git(format!("Could not apply the stash. Commit or discard conflicting changes first. ({})", e.message())))
}

/// Re-apply a stash and remove it from the list.
pub fn stash_pop(repo_path: &str, index: usize) -> AppResult<()> {
    let mut repo = find_repository(repo_path)?;
    repo.stash_pop(index, None)
        .map_err(|e| AppError::Git(format!("Could not apply the stash. Commit or discard conflicting changes first. ({})", e.message())))
}

/// DESTRUCTIVE: delete a stash for good. The UI must confirm first.
pub fn stash_drop(repo_path: &str, index: usize) -> AppResult<()> {
    let mut repo = find_repository(repo_path)?;
    repo.stash_drop(index)?;
    Ok(())
}
