//! Reads version history from a Git repository (using libgit2, built into the app,
//! so users do not need Git installed).
//!
//! * [`open_repository`] - repo summary and the .docx files in it
//! * [`file_versions`]   - the history of one file (commits + working copy)
//! * [`read_source`]     - bytes of one version of a file

use crate::error::{AppError, AppResult};
use crate::model::*;
use super::common::{find_repository, normalize, working_directory};
use git2::{ObjectType, Oid, Repository, StatusOptions};
use std::collections::{BTreeSet, HashMap};
use std::path::Path;

/// Safety limit so a huge repository cannot freeze the UI.
const MAX_VERSIONS: usize = 500;

fn is_word_file(path: &str) -> bool {
    let name = path.rsplit('/').next().unwrap_or(path);
    path.to_lowercase().ends_with(".docx") && !name.starts_with("~$") // "~$" files are Word lock files
}

// ------------------------------------------------------------ repository summary

pub fn open_repository(path: &str) -> AppResult<RepoInfo> {
    let repo = find_repository(path)?;
    let root = working_directory(&repo)?;

    let branch = repo
        .head()
        .ok()
        .and_then(|head| head.shorthand().ok().map(str::to_string))
        .unwrap_or_else(|| "(no commits yet)".to_string());

    let name = root
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "repository".to_string());

    Ok(RepoInfo { root: normalize(&root), name, branch, docx_files: list_word_files(&repo)? })
}

/// Tracked and untracked .docx files, as repo-relative paths.
fn list_word_files(repo: &Repository) -> AppResult<Vec<String>> {
    let mut files = BTreeSet::new();

    for entry in repo.index()?.iter() {
        let path = String::from_utf8_lossy(&entry.path).to_string();
        if is_word_file(&path) {
            files.insert(path);
        }
    }

    let mut options = StatusOptions::new();
    options.include_untracked(true).recurse_untracked_dirs(true);
    for entry in repo.statuses(Some(&mut options))?.iter() {
        if let Ok(path) = entry.path() {
            if is_word_file(path) {
                files.insert(path.to_string());
            }
        }
    }

    Ok(files.into_iter().collect())
}

// ------------------------------------------------------------ history of one file

/// Newest first: working copy, then every commit that changed the file.
pub fn file_versions(repo_path: &str, file: &str) -> AppResult<Vec<VersionInfo>> {
    let repo = find_repository(repo_path)?;
    let tags = tags_by_commit(&repo);
    let mut versions = Vec::new();

    if let Some(working_copy) = working_copy_version(&repo, file)? {
        versions.push(working_copy);
    }

    if repo.head().is_err() {
        return Ok(versions); // repository has no commits yet
    }

    let mut walk = repo.revwalk()?;
    walk.push_head()?;
    walk.set_sorting(git2::Sort::TIME)?;

    for oid in walk {
        let commit = repo.find_commit(oid?)?;
        let here = blob_id_in_commit(&commit, file);
        if here.is_none() {
            continue; // file does not exist in this commit
        }
        // Keep the commit only if the file differs from the first parent (or it is the first appearance).
        let before = commit.parent(0).ok().and_then(|parent| blob_id_in_commit(&parent, file));
        if here == before {
            continue;
        }

        let id = commit.id().to_string();
        versions.push(VersionInfo {
            kind: VersionKind::Commit,
            short_id: id.chars().take(7).collect(),
            tags: tags.get(&commit.id()).cloned().unwrap_or_default(),
            summary: commit.summary().ok().flatten().unwrap_or("").to_string(),
            author: commit.author().name().unwrap_or("").to_string(),
            time: commit.time().seconds(),
            dirty: false,
            id,
        });
        if versions.len() >= MAX_VERSIONS {
            break;
        }
    }
    Ok(versions)
}

fn working_copy_version(repo: &Repository, file: &str) -> AppResult<Option<VersionInfo>> {
    let on_disk = working_directory(repo)?.join(file);
    if !on_disk.is_file() {
        return Ok(None);
    }
    let modified = on_disk
        .metadata()
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    // Compare file content hash with the version in the latest commit.
    let disk_hash = Oid::hash_file(ObjectType::Blob, &on_disk).ok();
    let head_hash = repo
        .head()
        .ok()
        .and_then(|h| h.peel_to_commit().ok())
        .and_then(|c| blob_id_in_commit(&c, file));

    Ok(Some(VersionInfo {
        kind: VersionKind::Workdir,
        id: String::new(),
        short_id: "working".to_string(),
        summary: "Working copy".to_string(),
        author: String::new(),
        time: modified,
        tags: Vec::new(),
        dirty: disk_hash != head_hash,
    }))
}

fn blob_id_in_commit(commit: &git2::Commit, file: &str) -> Option<Oid> {
    commit.tree().ok()?.get_path(Path::new(file)).ok().map(|entry| entry.id())
}

/// commit id -> names of the tags pointing at it
fn tags_by_commit(repo: &Repository) -> HashMap<Oid, Vec<String>> {
    let mut map: HashMap<Oid, Vec<String>> = HashMap::new();
    let _ = repo.tag_foreach(|oid, name| {
        let name = String::from_utf8_lossy(name).trim_start_matches("refs/tags/").to_string();
        if let Ok(object) = repo.find_object(oid, None) {
            if let Ok(commit) = object.peel_to_commit() {
                map.entry(commit.id()).or_default().push(name);
            }
        }
        true
    });
    map
}

// ------------------------------------------------------------ reading file bytes

/// Full path of a file inside the repository's working folder.
pub fn working_file(repo_path: &str, path: &str) -> AppResult<std::path::PathBuf> {
    let repo = find_repository(repo_path)?;
    Ok(working_directory(&repo)?.join(path))
}

/// The bytes of the .docx that `source` points at.
pub fn read_source(source: &Source) -> AppResult<Vec<u8>> {
    match source.kind {
        SourceKind::File => Ok(std::fs::read(&source.path)?),
        SourceKind::Stage => super::conflicts::read_conflict_side(required(&source.repo, "repo")?, &source.path, required(&source.rev, "rev")?),
        SourceKind::Empty => Err(AppError::Invalid("an empty document has no file to read".into())),
        SourceKind::Workdir => {
            let repo = find_repository(required(&source.repo, "repo")?)?;
            Ok(std::fs::read(working_directory(&repo)?.join(&source.path))?)
        }
        SourceKind::Git => {
            let repo = find_repository(required(&source.repo, "repo")?)?;
            let rev = required(&source.rev, "rev")?;
            let commit = repo.revparse_single(rev)?.peel_to_commit()?;
            let entry = commit
                .tree()?
                .get_path(Path::new(&source.path))
                .map_err(|_| AppError::Git(format!("'{}' does not exist in commit {}", source.path, &rev[..rev.len().min(7)])))?;
            let blob = entry.to_object(&repo)?.peel_to_blob()?;
            Ok(blob.content().to_vec())
        }
    }
}

fn required<'a>(value: &'a Option<String>, name: &str) -> AppResult<&'a str> {
    value.as_deref().ok_or_else(|| AppError::Invalid(format!("source is missing '{name}'")))
}
