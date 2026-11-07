//! Inkdelta backend.
//!
//! Layers, from the UI downwards:
//!
//! ```text
//! commands  - the functions the UI may call (thin)
//!   |
//!   +-- git      version history, status, branches, stash, graph, sync
//!   +-- docx     reads Word files into `model::Document`
//!   +-- diff     compares two Documents into `model::DiffDocument`
//!   +-- storage  saves review state and exports
//!
//! model - plain data types used by all of the above
//! error - the one error type
//! ```
//!
//! See ARCHITECTURE.md at the project root for the bigger picture.

mod ai;
mod commands;
mod diff;
mod docx;
mod error;
mod git;
mod model;
mod storage;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::startup_path,
            commands::open_repository,
            commands::list_versions,
            commands::compare_documents,
            commands::load_outline,
            commands::load_review_state,
            commands::save_review_state,
            commands::save_document_edits,
            commands::ai_complete,
            commands::save_text_file,
            commands::git_tool_info,
            commands::repo_status,
            commands::commit_graph,
            commands::commit_files,
            commands::list_branches,
            commands::list_stashes,
            commands::list_remotes,
            commands::get_identity,
            commands::stage_files,
            commands::unstage_files,
            commands::discard_files,
            commands::commit_changes,
            commands::create_branch,
            commands::checkout_branch,
            commands::delete_branch,
            commands::create_tag,
            commands::delete_tag,
            commands::stash_save,
            commands::stash_apply,
            commands::stash_pop,
            commands::stash_drop,
            commands::add_remote,
            commands::init_repository,
            commands::set_identity,
            commands::file_diff,
            commands::stage_lines,
            commands::unstage_lines,
            commands::conflict_info,
            commands::conflict_hunks,
            commands::resolve_conflict_side,
            commands::resolve_conflict_hunks,
            commands::mark_conflict_resolved,
            commands::git_fetch,
            commands::git_pull,
            commands::git_push,
            commands::git_merge,
            commands::git_abort_merge,
            commands::git_clone,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Inkdelta");
}
