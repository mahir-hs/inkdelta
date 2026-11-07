//! Small helpers shared by every Git module.

use crate::error::{AppError, AppResult};
use git2::Repository;
use std::path::{Path, PathBuf};

/// Open the repository that contains `path` (any folder inside it works).
pub fn find_repository(path: &str) -> AppResult<Repository> {
    Repository::discover(path).map_err(|_| AppError::Git(format!("'{path}' is not inside a Git repository")))
}

pub fn working_directory(repo: &Repository) -> AppResult<PathBuf> {
    repo.workdir()
        .map(Path::to_path_buf)
        .ok_or_else(|| AppError::Git("bare repositories are not supported".into()))
}

/// Forward slashes on every OS so the UI never has to care.
pub fn normalize(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/").trim_end_matches('/').to_string()
}

/// A short, friendly version of a commit id.
pub fn short_id(id: &git2::Oid) -> String {
    id.to_string().chars().take(7).collect()
}
