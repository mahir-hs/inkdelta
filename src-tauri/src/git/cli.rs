//! Actions that talk to remote servers, run through the Git program installed on the computer.
//!
//! Why not the built-in engine? Pull and push need the user's logins (Git
//! Credential Manager, SSH keys, tokens). The installed Git already knows
//! them, so this "just works" with GitHub, GitLab, Azure DevOps and so on.
//! Everything that only touches the local repository uses the built-in
//! engine and does not need Git installed.

use super::common::find_repository;
use crate::error::{AppError, AppResult};
use crate::model::{GitToolInfo, RemoteInfo};
use std::process::Command;

/// Run `git <args>` in `folder` and return its output. Fails with Git's own message.
fn run_git(folder: &str, args: &[&str]) -> AppResult<String> {
    let mut command = Command::new("git");
    command
        .args(args)
        .current_dir(folder)
        // Never wait for a typed password in a hidden console: fail with a clear message instead.
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("LC_ALL", "C");
    hide_console_window(&mut command);

    let output = command.output().map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            AppError::Git("Git is not installed. Install it from git-scm.com to pull and push.".into())
        } else {
            AppError::Io(e.to_string())
        }
    })?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if output.status.success() {
        // Git writes progress to stderr even on success; keep it for the activity log.
        Ok([stdout, stderr].into_iter().filter(|s| !s.is_empty()).collect::<Vec<_>>().join("\n"))
    } else {
        Err(AppError::Git(friendly_error(if stderr.is_empty() { &stdout } else { &stderr })))
    }
}

/// Windows would flash a black console window for every Git call without this.
#[cfg(windows)]
fn hide_console_window(command: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
fn hide_console_window(_command: &mut Command) {}

/// Turn the most common Git failures into advice.
fn friendly_error(message: &str) -> String {
    let lower = message.to_lowercase();
    if lower.contains("authentication failed") || lower.contains("could not read username") || lower.contains("permission denied (publickey)") {
        return format!("Git could not sign in to the server. Sign in once with Git Credential Manager or add your SSH key, then try again.\n{message}");
    }
    if lower.contains("non-fast-forward") || lower.contains("fetch first") || lower.contains("rejected") && lower.contains("behind") {
        return format!("The server has newer commits than yours. Pull first, then push again.\n{message}");
    }
    if lower.contains("no upstream") || lower.contains("has no upstream branch") {
        return format!("This branch is not connected to a remote branch yet. Use Publish branch.\n{message}");
    }
    if lower.contains("not possible to fast-forward") || lower.contains("diverging") {
        return format!("Your branch and the remote have both changed. Choose merge or rebase when pulling.\n{message}");
    }
    message.to_string()
}

pub fn git_tool_info() -> GitToolInfo {
    match run_git(".", &["--version"]) {
        Ok(version) => GitToolInfo { available: true, version },
        Err(_) => GitToolInfo { available: false, version: String::new() },
    }
}

pub fn fetch(repo_path: &str) -> AppResult<String> {
    run_git(&root(repo_path)?, &["fetch", "--all", "--prune"])
}

/// `strategy`: "merge" (default), "rebase" or "ff-only".
pub fn pull(repo_path: &str, strategy: &str) -> AppResult<String> {
    let flag = match strategy {
        "rebase" => "--rebase",
        "ff-only" => "--ff-only",
        _ => "--no-rebase",
    };
    run_git(&root(repo_path)?, &["pull", flag, "--no-edit"])
}

/// Push the current branch. `publish` connects it to `origin/<branch>` on the first push.
pub fn push(repo_path: &str, publish: bool, force_with_lease: bool) -> AppResult<String> {
    let folder = root(repo_path)?;
    let mut args = vec!["push"];
    if force_with_lease {
        args.push("--force-with-lease");
    }
    if publish {
        args.extend(["-u", "origin", "HEAD"]);
    }
    run_git(&folder, &args)
}

pub fn merge(repo_path: &str, branch: &str) -> AppResult<String> {
    run_git(&root(repo_path)?, &["merge", "--no-edit", branch])
}

pub fn abort_merge(repo_path: &str) -> AppResult<String> {
    run_git(&root(repo_path)?, &["merge", "--abort"])
}

pub fn clone_repository(url: &str, destination: &str) -> AppResult<String> {
    if url.trim().is_empty() || destination.trim().is_empty() {
        return Err(AppError::Invalid("enter the repository address and a folder".into()));
    }
    run_git(".", &["clone", "--", url.trim(), destination.trim()])
}

// ------------------------------------------------------------ remotes (built-in engine)

pub fn list_remotes(repo_path: &str) -> AppResult<Vec<RemoteInfo>> {
    let repo = find_repository(repo_path)?;
    let names = repo.remotes()?;
    Ok(names
        .iter()
        .flatten()
        .flatten()
        .filter_map(|name| repo.find_remote(name).ok().map(|r| RemoteInfo { name: name.to_string(), url: r.url().unwrap_or("").to_string() }))
        .collect())
}

pub fn add_remote(repo_path: &str, name: &str, url: &str) -> AppResult<()> {
    let repo = find_repository(repo_path)?;
    repo.remote(name.trim(), url.trim())
        .map_err(|e| AppError::Git(format!("Could not add the remote: {}", e.message())))?;
    Ok(())
}

pub fn init_repository(folder: &str) -> AppResult<()> {
    git2::Repository::init(folder)?;
    Ok(())
}

/// Working folder of the repository containing `path`.
fn root(repo_path: &str) -> AppResult<String> {
    let repo = find_repository(repo_path)?;
    let folder = super::common::working_directory(&repo)?;
    Ok(folder.to_string_lossy().to_string())
}
