//! Who you are in Git (name and email on your commits).

use super::common::find_repository;
use crate::error::{AppError, AppResult};
use serde::Serialize;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Identity {
    pub name: String,
    pub email: String,
}

/// The identity Git would use for this repository, if one is configured.
pub fn get_identity(repo_path: &str) -> AppResult<Option<Identity>> {
    let repo = find_repository(repo_path)?;
    let config = repo.config()?.snapshot()?;
    let name = config.get_string("user.name").unwrap_or_default();
    let email = config.get_string("user.email").unwrap_or_default();
    Ok(if name.is_empty() || email.is_empty() { None } else { Some(Identity { name, email }) })
}

/// Save the identity for this computer (`global`) or only for this repository.
pub fn set_identity(repo_path: &str, name: &str, email: &str, global: bool) -> AppResult<()> {
    if name.trim().is_empty() || !email.contains('@') {
        return Err(AppError::Invalid("enter your name and a valid email address".into()));
    }
    let repo = find_repository(repo_path)?;
    let mut config = if global { git2::Config::open_default()? } else { repo.config()?.open_level(git2::ConfigLevel::Local)? };
    config.set_str("user.name", name.trim())?;
    config.set_str("user.email", email.trim())?;
    Ok(())
}
