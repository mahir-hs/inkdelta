//! The only functions the UI can call.
//!
//! Each command is deliberately thin: it unpacks arguments, calls one
//! module (`git`, `docx`, `diff`, `storage`) and returns the result.
//! Keep logic out of this file.
//!
//! Commands are `async` so Tauri runs them off the UI thread, and the work is
//! wrapped in `blocking` so a slow Git call or a big comparison never freezes the window.

use crate::error::{AppError, AppResult};
use crate::git::{self, branches, cli, conflicts, graph, identity, lines, stash, status};
use crate::model::*;
use crate::{diff, docx, storage};

/// Run CPU/IO-heavy work on a worker thread.
async fn blocking<T, F>(work: F) -> AppResult<T>
where
    T: Send + 'static,
    F: FnOnce() -> AppResult<T> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|e| AppError::Invalid(format!("background task failed: {e}")))?
}

fn load_document(source: &Source) -> AppResult<Document> {
    if source.kind == SourceKind::Empty {
        return Ok(Document::default());
    }
    docx::parse(git::read_source(source)?)
}

// ============================================================ startup

/// A folder or file passed on the command line (`inkdelta <path>`), if any.
#[tauri::command]
pub fn startup_path() -> Option<String> {
    std::env::args().nth(1).filter(|arg| !arg.starts_with('-'))
}

// ============================================================ documents and comparison

#[tauri::command]
pub async fn open_repository(path: String) -> AppResult<RepoInfo> {
    blocking(move || git::open_repository(&path)).await
}

#[tauri::command]
pub async fn list_versions(repo: String, file: String) -> AppResult<Vec<VersionInfo>> {
    blocking(move || git::file_versions(&repo, &file)).await
}

#[tauri::command]
pub async fn compare_documents(old: Source, new: Source) -> AppResult<DiffDocument> {
    blocking(move || Ok(diff::compare(&load_document(&old)?, &load_document(&new)?))).await
}

#[tauri::command]
pub async fn load_outline(source: Source) -> AppResult<Outline> {
    blocking(move || Ok(docx::outline(&load_document(&source)?))).await
}

/// Save text edits into the working copy of a Word document (the file on disk).
#[tauri::command]
pub async fn save_document_edits(repo: String, path: String, edits: Vec<ParagraphEdit>) -> AppResult<()> {
    blocking(move || {
        let file = git::working_file(&repo, &path)?;
        let edited = docx::edit::apply_edits(&std::fs::read(&file)?, &edits)?;
        storage::replace_file(&file, &edited)
    })
    .await
}

/// Ask an AI service or tool. The UI shows the user what is sent and gets confirmation first.
#[tauri::command]
pub async fn ai_complete(config: crate::ai::AiConfig, system: String, user: String) -> AppResult<String> {
    blocking(move || crate::ai::complete(&config, &system, &user)).await
}

// ============================================================ review progress and export

#[tauri::command]
pub async fn load_review_state(repo: String) -> AppResult<Option<String>> {
    blocking(move || storage::load_review_state(&repo)).await
}

#[tauri::command]
pub async fn save_review_state(repo: String, json: String) -> AppResult<()> {
    blocking(move || storage::save_review_state(&repo, &json)).await
}

#[tauri::command]
pub async fn save_text_file(path: String, content: String) -> AppResult<()> {
    blocking(move || storage::save_text_file(&path, &content)).await
}

// ============================================================ Git: reading

#[tauri::command]
pub async fn git_tool_info() -> AppResult<GitToolInfo> {
    blocking(|| Ok(cli::git_tool_info())).await
}

#[tauri::command]
pub async fn repo_status(repo: String) -> AppResult<RepoStatus> {
    blocking(move || status::repo_status(&repo)).await
}

#[tauri::command]
pub async fn commit_graph(repo: String, limit: usize) -> AppResult<Graph> {
    blocking(move || graph::commit_graph(&repo, limit)).await
}

#[tauri::command]
pub async fn commit_files(repo: String, id: String) -> AppResult<Vec<CommitFile>> {
    blocking(move || graph::commit_files(&repo, &id)).await
}

#[tauri::command]
pub async fn list_branches(repo: String) -> AppResult<Vec<BranchInfo>> {
    blocking(move || branches::list_branches(&repo)).await
}

#[tauri::command]
pub async fn list_stashes(repo: String) -> AppResult<Vec<StashInfo>> {
    blocking(move || stash::list_stashes(&repo)).await
}

#[tauri::command]
pub async fn list_remotes(repo: String) -> AppResult<Vec<RemoteInfo>> {
    blocking(move || cli::list_remotes(&repo)).await
}

#[tauri::command]
pub async fn get_identity(repo: String) -> AppResult<Option<identity::Identity>> {
    blocking(move || identity::get_identity(&repo)).await
}

// ============================================================ Git: changing the repository (built-in engine)

#[tauri::command]
pub async fn stage_files(repo: String, paths: Vec<String>) -> AppResult<()> {
    blocking(move || status::stage(&repo, &paths)).await
}

#[tauri::command]
pub async fn unstage_files(repo: String, paths: Vec<String>) -> AppResult<()> {
    blocking(move || status::unstage(&repo, &paths)).await
}

/// DESTRUCTIVE. The UI asks the user to confirm before calling this.
#[tauri::command]
pub async fn discard_files(repo: String, paths: Vec<String>) -> AppResult<()> {
    blocking(move || status::discard(&repo, &paths)).await
}

#[tauri::command]
pub async fn commit_changes(repo: String, message: String, amend: bool) -> AppResult<String> {
    blocking(move || status::commit(&repo, &message, amend)).await
}

#[tauri::command]
pub async fn create_branch(repo: String, name: String, start: Option<String>, checkout: bool) -> AppResult<()> {
    blocking(move || branches::create_branch(&repo, &name, start.as_deref(), checkout)).await
}

#[tauri::command]
pub async fn checkout_branch(repo: String, name: String) -> AppResult<()> {
    blocking(move || branches::checkout_branch(&repo, &name)).await
}

/// DESTRUCTIVE when `force` is true. The UI confirms first.
#[tauri::command]
pub async fn delete_branch(repo: String, name: String, force: bool) -> AppResult<()> {
    blocking(move || branches::delete_branch(&repo, &name, force)).await
}

#[tauri::command]
pub async fn create_tag(repo: String, name: String, message: Option<String>) -> AppResult<()> {
    blocking(move || branches::create_tag(&repo, &name, message.as_deref())).await
}

#[tauri::command]
pub async fn delete_tag(repo: String, name: String) -> AppResult<()> {
    blocking(move || branches::delete_tag(&repo, &name)).await
}

#[tauri::command]
pub async fn stash_save(repo: String, message: String, include_untracked: bool) -> AppResult<()> {
    blocking(move || stash::stash_save(&repo, &message, include_untracked)).await
}

#[tauri::command]
pub async fn stash_apply(repo: String, index: usize) -> AppResult<()> {
    blocking(move || stash::stash_apply(&repo, index)).await
}

#[tauri::command]
pub async fn stash_pop(repo: String, index: usize) -> AppResult<()> {
    blocking(move || stash::stash_pop(&repo, index)).await
}

/// DESTRUCTIVE. The UI confirms first.
#[tauri::command]
pub async fn stash_drop(repo: String, index: usize) -> AppResult<()> {
    blocking(move || stash::stash_drop(&repo, index)).await
}

#[tauri::command]
pub async fn add_remote(repo: String, name: String, url: String) -> AppResult<()> {
    blocking(move || cli::add_remote(&repo, &name, &url)).await
}

#[tauri::command]
pub async fn init_repository(folder: String) -> AppResult<()> {
    blocking(move || cli::init_repository(&folder)).await
}

#[tauri::command]
pub async fn set_identity(repo: String, name: String, email: String, global: bool) -> AppResult<()> {
    blocking(move || identity::set_identity(&repo, &name, &email, global)).await
}

// ============================================================ Git: line-level staging

#[tauri::command]
pub async fn file_diff(repo: String, path: String, staged: bool) -> AppResult<FileDiff> {
    blocking(move || lines::file_diff(&repo, &path, staged)).await
}

#[tauri::command]
pub async fn stage_lines(repo: String, path: String, picks: Vec<LineRef>, fingerprint: String) -> AppResult<()> {
    blocking(move || lines::stage_lines(&repo, &path, &picks, &fingerprint)).await
}

#[tauri::command]
pub async fn unstage_lines(repo: String, path: String, picks: Vec<LineRef>, fingerprint: String) -> AppResult<()> {
    blocking(move || lines::unstage_lines(&repo, &path, &picks, &fingerprint)).await
}

// ============================================================ Git: merge conflicts

#[tauri::command]
pub async fn conflict_info(repo: String, path: String) -> AppResult<ConflictInfo> {
    blocking(move || conflicts::conflict_info(&repo, &path)).await
}

#[tauri::command]
pub async fn conflict_hunks(repo: String, path: String) -> AppResult<Vec<ConflictPart>> {
    blocking(move || conflicts::conflict_hunks(&repo, &path)).await
}

/// Keep one whole side of a conflicted file. The UI confirms before using the side that deletes a file.
#[tauri::command]
pub async fn resolve_conflict_side(repo: String, path: String, side: MergeSide) -> AppResult<()> {
    blocking(move || conflicts::resolve_side(&repo, &path, side)).await
}

#[tauri::command]
pub async fn resolve_conflict_hunks(repo: String, path: String, choices: Vec<HunkChoice>) -> AppResult<()> {
    blocking(move || conflicts::resolve_hunks(&repo, &path, &choices)).await
}

#[tauri::command]
pub async fn mark_conflict_resolved(repo: String, path: String) -> AppResult<()> {
    blocking(move || conflicts::mark_resolved(&repo, &path)).await
}

// ============================================================ Git: talking to servers (installed Git)

#[tauri::command]
pub async fn git_fetch(repo: String) -> AppResult<String> {
    blocking(move || cli::fetch(&repo)).await
}

#[tauri::command]
pub async fn git_pull(repo: String, strategy: String) -> AppResult<String> {
    blocking(move || cli::pull(&repo, &strategy)).await
}

#[tauri::command]
pub async fn git_push(repo: String, publish: bool, force_with_lease: bool) -> AppResult<String> {
    blocking(move || cli::push(&repo, publish, force_with_lease)).await
}

#[tauri::command]
pub async fn git_merge(repo: String, branch: String) -> AppResult<String> {
    blocking(move || cli::merge(&repo, &branch)).await
}

#[tauri::command]
pub async fn git_abort_merge(repo: String) -> AppResult<String> {
    blocking(move || cli::abort_merge(&repo)).await
}

#[tauri::command]
pub async fn git_clone(url: String, destination: String) -> AppResult<String> {
    blocking(move || cli::clone_repository(&url, &destination)).await
}
