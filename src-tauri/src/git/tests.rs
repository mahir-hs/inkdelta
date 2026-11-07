//! Tests for the Git features, run against throwaway repositories.
//! Repositories are created under `target/test-repos` (inside the project, not in the system temp folder).

use super::*;
use crate::model::*;
use std::fs;
use std::path::PathBuf;

fn fresh_dir(name: &str) -> PathBuf {
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("target").join("test-repos").join(name);
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    dir
}

fn s(path: &PathBuf) -> String {
    path.to_string_lossy().to_string()
}

/// A repository with an identity and one commit.
fn repo_with_commit(name: &str) -> PathBuf {
    let dir = fresh_dir(name);
    cli::init_repository(&s(&dir)).unwrap();
    identity::set_identity(&s(&dir), "Test Author", "test@example.com", false).unwrap();
    fs::write(dir.join("a.txt"), "one\n").unwrap();
    status::stage(&s(&dir), &[]).unwrap();
    status::commit(&s(&dir), "first", false).unwrap();
    dir
}

fn commit_file(dir: &PathBuf, file: &str, text: &str, message: &str) {
    fs::write(dir.join(file), text).unwrap();
    status::stage(&s(dir), &[file.to_string()]).unwrap();
    status::commit(&s(dir), message, false).unwrap();
}

#[test]
fn status_shows_untracked_then_staged_then_clean() {
    let dir = fresh_dir("status");
    cli::init_repository(&s(&dir)).unwrap();
    identity::set_identity(&s(&dir), "T", "t@example.com", false).unwrap();
    fs::write(dir.join("new.txt"), "x").unwrap();

    let st = status::repo_status(&s(&dir)).unwrap();
    assert!(!st.has_commits);
    assert_eq!(st.files.len(), 1);
    assert_eq!(st.files[0].status, ChangeStatus::Untracked);
    assert!(!st.files[0].staged);

    status::stage(&s(&dir), &["new.txt".into()]).unwrap();
    let st = status::repo_status(&s(&dir)).unwrap();
    assert_eq!(st.files[0].status, ChangeStatus::Added);
    assert!(st.files[0].staged);

    status::unstage(&s(&dir), &["new.txt".into()]).unwrap();
    assert_eq!(status::repo_status(&s(&dir)).unwrap().files[0].status, ChangeStatus::Untracked);

    status::stage(&s(&dir), &[]).unwrap();
    status::commit(&s(&dir), "add new", false).unwrap();
    let st = status::repo_status(&s(&dir)).unwrap();
    assert!(st.has_commits);
    assert!(st.files.is_empty());
}

#[test]
fn commit_needs_a_message() {
    let dir = repo_with_commit("empty-message");
    assert!(status::commit(&s(&dir), "   ", false).is_err());
}

#[test]
fn discard_restores_modified_and_deletes_untracked() {
    let dir = repo_with_commit("discard");
    fs::write(dir.join("a.txt"), "changed\n").unwrap();
    fs::write(dir.join("junk.txt"), "junk").unwrap();
    status::discard(&s(&dir), &["a.txt".into(), "junk.txt".into()]).unwrap();
    assert_eq!(fs::read_to_string(dir.join("a.txt")).unwrap().replace("\r\n", "\n"), "one\n");
    assert!(!dir.join("junk.txt").exists());
}

#[test]
fn branches_create_switch_and_protect_unmerged_work() {
    let dir = repo_with_commit("branches");
    let r = s(&dir);
    let main = status::repo_status(&r).unwrap().branch;

    branches::create_branch(&r, "feature", None, true).unwrap();
    assert_eq!(status::repo_status(&r).unwrap().branch, "feature");
    commit_file(&dir, "b.txt", "feature work\n", "feature commit");

    branches::checkout_branch(&r, &main).unwrap();
    assert!(!dir.join("b.txt").exists(), "feature file must disappear on the other branch");

    // unmerged branch: refuses without force
    assert!(branches::delete_branch(&r, "feature", false).is_err());
    cli::merge(&r, "feature").unwrap();
    assert!(dir.join("b.txt").exists());
    branches::delete_branch(&r, "feature", false).unwrap(); // merged now

    // cannot delete the current branch
    assert!(branches::delete_branch(&r, &main, true).is_err());
    // invalid names are rejected
    assert!(branches::create_branch(&r, "bad name", None, false).is_err());
}

#[test]
fn switching_branches_never_overwrites_uncommitted_work() {
    let dir = repo_with_commit("safe-checkout");
    let r = s(&dir);
    let main = status::repo_status(&r).unwrap().branch;
    branches::create_branch(&r, "other", None, true).unwrap();
    commit_file(&dir, "a.txt", "other version\n", "other edit");
    branches::checkout_branch(&r, &main).unwrap();

    fs::write(dir.join("a.txt"), "my unsaved work\n").unwrap();
    assert!(branches::checkout_branch(&r, "other").is_err());
    assert_eq!(fs::read_to_string(dir.join("a.txt")).unwrap().replace("\r\n", "\n"), "my unsaved work\n");
}

#[test]
fn stash_save_list_pop() {
    let dir = repo_with_commit("stash");
    let r = s(&dir);
    assert!(stash::stash_save(&r, "nothing", false).is_err());

    fs::write(dir.join("a.txt"), "work in progress\n").unwrap();
    stash::stash_save(&r, "my wip", false).unwrap();
    assert_eq!(fs::read_to_string(dir.join("a.txt")).unwrap().replace("\r\n", "\n"), "one\n");

    let list = stash::list_stashes(&r).unwrap();
    assert_eq!(list.len(), 1);
    assert!(list[0].message.contains("my wip"));

    stash::stash_pop(&r, 0).unwrap();
    assert_eq!(fs::read_to_string(dir.join("a.txt")).unwrap().replace("\r\n", "\n"), "work in progress\n");
    assert!(stash::list_stashes(&r).unwrap().is_empty());
}

#[test]
fn graph_lays_out_a_merge() {
    let dir = repo_with_commit("graph");
    let r = s(&dir);
    let main = status::repo_status(&r).unwrap().branch;
    branches::create_branch(&r, "topic", None, true).unwrap();
    commit_file(&dir, "t.txt", "t\n", "topic work");
    branches::checkout_branch(&r, &main).unwrap();
    commit_file(&dir, "m.txt", "m\n", "main work");
    cli::merge(&r, "topic").unwrap();
    branches::create_tag(&r, "v1", None).unwrap();

    let graph = graph::commit_graph(&r, 100).unwrap();
    assert_eq!(graph.rows.len(), 4, "first, topic, main, merge");
    let merge = &graph.rows[0];
    assert_eq!(merge.parents.len(), 2);
    assert!(graph.lane_count >= 2, "a merge needs two lanes");
    assert!(merge.refs.iter().any(|l| l.kind == RefKind::Head));
    assert!(merge.refs.iter().any(|l| l.kind == RefKind::Tag && l.name == "v1"));
    // every commit but the last must have a line leaving towards its parent
    for row in &graph.rows[..3] {
        assert!(!row.bottom.is_empty());
    }
    assert!(graph.rows[3].bottom.is_empty(), "the root commit has no parent line");

    let files = graph::commit_files(&r, &merge.id).unwrap();
    assert!(files.iter().any(|f| f.path == "t.txt"));
}

#[test]
fn push_pull_and_ahead_behind_with_a_local_server() {
    let root = fresh_dir("sync");
    let server = root.join("server.git");
    fs::create_dir_all(&server).unwrap();
    git2::Repository::init_bare(&server).unwrap();

    // Alice publishes.
    let alice = root.join("alice");
    fs::create_dir_all(&alice).unwrap();
    cli::init_repository(&s(&alice)).unwrap();
    identity::set_identity(&s(&alice), "Alice", "alice@example.com", false).unwrap();
    commit_file(&alice, "a.txt", "one\n", "first");
    cli::add_remote(&s(&alice), "origin", &s(&server)).unwrap();
    assert_eq!(cli::list_remotes(&s(&alice)).unwrap().len(), 1);
    cli::push(&s(&alice), true, false).unwrap();
    let st = status::repo_status(&s(&alice)).unwrap();
    assert!(st.upstream.is_some());
    assert_eq!((st.ahead, st.behind), (0, 0));

    // Bob clones, commits, pushes.
    let bob = root.join("bob");
    cli::clone_repository(&s(&server), &s(&bob)).unwrap();
    identity::set_identity(&s(&bob), "Bob", "bob@example.com", false).unwrap();
    commit_file(&bob, "b.txt", "from bob\n", "bob commit");
    assert_eq!(status::repo_status(&s(&bob)).unwrap().ahead, 1);
    cli::push(&s(&bob), false, false).unwrap();

    // Alice fetches (behind 1), then pulls.
    cli::fetch(&s(&alice)).unwrap();
    assert_eq!(status::repo_status(&s(&alice)).unwrap().behind, 1);
    cli::pull(&s(&alice), "merge").unwrap();
    assert!(alice.join("b.txt").exists());
    let st = status::repo_status(&s(&alice)).unwrap();
    assert_eq!((st.ahead, st.behind), (0, 0));

    // A rejected push explains what to do.
    commit_file(&alice, "a.txt", "alice 2\n", "alice again");
    commit_file(&bob, "b.txt", "bob 2\n", "bob again");
    cli::push(&s(&bob), false, false).unwrap();
    let error = cli::push(&s(&alice), false, false).unwrap_err().to_string();
    assert!(error.contains("Pull first") || error.contains("newer commits"), "got: {error}");
}

#[test]
fn identity_round_trip() {
    let dir = fresh_dir("identity");
    cli::init_repository(&s(&dir)).unwrap();
    assert!(identity::set_identity(&s(&dir), "", "x", false).is_err());
    identity::set_identity(&s(&dir), "Ada", "ada@example.com", false).unwrap();
    let id = identity::get_identity(&s(&dir)).unwrap().unwrap();
    assert_eq!(id.name, "Ada");
}

#[test]
fn merge_conflict_is_reported_and_can_be_aborted() {
    let dir = repo_with_commit("conflict");
    let r = s(&dir);
    let main = status::repo_status(&r).unwrap().branch;

    branches::create_branch(&r, "other", None, true).unwrap();
    commit_file(&dir, "a.txt", "other side
", "other edit");
    branches::checkout_branch(&r, &main).unwrap();
    commit_file(&dir, "a.txt", "main side
", "main edit");

    let error = cli::merge(&r, "other").unwrap_err().to_string();
    assert!(error.to_lowercase().contains("conflict"), "got: {error}");

    let st = status::repo_status(&r).unwrap();
    assert!(st.merging, "a merge should be open");
    assert!(st.files.iter().any(|f| f.status == ChangeStatus::Conflicted), "the file should be marked as a conflict");
    assert!(status::commit(&r, "try to commit", false).is_err(), "committing with conflicts must be refused");

    cli::abort_merge(&r).unwrap();
    let st = status::repo_status(&r).unwrap();
    assert!(!st.merging);
    assert!(st.files.is_empty());
    // Windows may store the file with CRLF line endings; compare the text only.
    let text = fs::read_to_string(dir.join("a.txt")).unwrap();
    assert_eq!(text.replace("\r\n", "\n"), "main side\n");
}

// ---------------------------------------------------------------- resolving conflicts

/// Two branches that edit a.txt differently; returns the repo, with the merge stopped on a conflict.
fn conflicted_repo(name: &str) -> (PathBuf, String, String) {
    let dir = repo_with_commit(name);
    let r = s(&dir);
    let main = status::repo_status(&r).unwrap().branch;
    branches::create_branch(&r, "other", None, true).unwrap();
    commit_file(&dir, "a.txt", "other side\n", "other edit");
    branches::checkout_branch(&r, &main).unwrap();
    commit_file(&dir, "a.txt", "main side\n", "main edit");
    assert!(cli::merge(&r, "other").is_err());
    (dir, r, main)
}

fn normalized(path: PathBuf) -> String {
    fs::read_to_string(path).unwrap().replace("\r\n", "\n")
}

#[test]
fn conflict_info_names_both_sides() {
    let (_dir, r, main) = conflicted_repo("conflict-info");
    let info = conflicts::conflict_info(&r, "a.txt").unwrap();
    assert_eq!(info.ours_label, main);
    assert_eq!(info.theirs_label, "other");
    assert!(info.is_text && info.ours_exists && info.theirs_exists);
    let message = status::repo_status(&r).unwrap().merge_message.unwrap();
    assert!(message.contains("other"));
    assert!(!message.contains('#'), "Git's comment lines must not leak into the commit message: {message}");
}

#[test]
fn resolving_hunks_then_committing_makes_a_merge_commit() {
    let (dir, r, _main) = conflicted_repo("conflict-hunks");

    // Line endings are preserved as Git wrote them (CRLF on Windows), so compare the text only.
    let parts = conflicts::conflict_hunks(&r, "a.txt").unwrap();
    assert_eq!(parts.len(), 1);
    match &parts[0] {
        ConflictPart::Conflict { ours, theirs } => {
            assert_eq!(ours.replace("\r\n", "\n"), "main side\n");
            assert_eq!(theirs.replace("\r\n", "\n"), "other side\n");
        }
        other => panic!("expected a conflict, got {other:?}"),
    }

    // committing before resolving is refused
    assert!(status::commit(&r, "too early", false).is_err());

    conflicts::resolve_hunks(&r, "a.txt", &[HunkChoice::Both]).unwrap();
    assert_eq!(normalized(dir.join("a.txt")), "main side\nother side\n");
    let st = status::repo_status(&r).unwrap();
    assert!(!st.files.iter().any(|f| f.status == ChangeStatus::Conflicted), "no conflict should remain");

    status::commit(&r, &st.merge_message.clone().unwrap(), false).unwrap();
    let st = status::repo_status(&r).unwrap();
    assert!(!st.merging);
    let graph = graph::commit_graph(&r, 10).unwrap();
    assert_eq!(graph.rows[0].parents.len(), 2, "the commit that finishes a merge has two parents");
}

#[test]
fn keeping_one_whole_side() {
    let (dir, r, _main) = conflicted_repo("conflict-side-theirs");
    conflicts::resolve_side(&r, "a.txt", MergeSide::Theirs).unwrap();
    assert_eq!(normalized(dir.join("a.txt")), "other side\n");
    assert!(status::commit(&r, "merge", false).is_ok());

    let (dir, r, _main) = conflicted_repo("conflict-side-ours");
    conflicts::resolve_side(&r, "a.txt", MergeSide::Ours).unwrap();
    assert_eq!(normalized(dir.join("a.txt")), "main side\n");
}

#[test]
fn binary_files_cannot_be_split_but_either_side_can_be_read_and_kept() {
    let dir = repo_with_commit("conflict-binary");
    let r = s(&dir);
    let main = status::repo_status(&r).unwrap().branch;
    let bytes = |tag: u8| vec![0u8, 1, 2, tag, 0, 255, tag];

    fs::write(dir.join("doc.bin"), bytes(0)).unwrap();
    status::stage(&r, &[]).unwrap();
    status::commit(&r, "add binary", false).unwrap();
    branches::create_branch(&r, "other", None, true).unwrap();
    fs::write(dir.join("doc.bin"), bytes(2)).unwrap();
    status::stage(&r, &[]).unwrap();
    status::commit(&r, "other binary", false).unwrap();
    branches::checkout_branch(&r, &main).unwrap();
    fs::write(dir.join("doc.bin"), bytes(1)).unwrap();
    status::stage(&r, &[]).unwrap();
    status::commit(&r, "main binary", false).unwrap();
    assert!(cli::merge(&r, "other").is_err());

    let info = conflicts::conflict_info(&r, "doc.bin").unwrap();
    assert!(!info.is_text);
    assert_eq!(conflicts::read_conflict_side(&r, "doc.bin", "ours").unwrap(), bytes(1));
    assert_eq!(conflicts::read_conflict_side(&r, "doc.bin", "theirs").unwrap(), bytes(2));

    // the same bytes are reachable as a comparison source
    let source = Source { kind: SourceKind::Stage, repo: Some(r.clone()), rev: Some("theirs".into()), path: "doc.bin".into() };
    assert_eq!(read_source(&source).unwrap(), bytes(2));

    conflicts::resolve_side(&r, "doc.bin", MergeSide::Theirs).unwrap();
    assert_eq!(fs::read(dir.join("doc.bin")).unwrap(), bytes(2));
}

#[test]
fn a_file_deleted_on_one_side_can_be_kept_or_removed() {
    let dir = repo_with_commit("conflict-delete");
    let r = s(&dir);
    let main = status::repo_status(&r).unwrap().branch;
    branches::create_branch(&r, "other", None, true).unwrap();
    fs::remove_file(dir.join("a.txt")).unwrap();
    status::stage(&r, &["a.txt".into()]).unwrap();
    status::commit(&r, "other deletes it", false).unwrap();
    branches::checkout_branch(&r, &main).unwrap();
    commit_file(&dir, "a.txt", "main kept editing\n", "main edits it");
    assert!(cli::merge(&r, "other").is_err());

    let info = conflicts::conflict_info(&r, "a.txt").unwrap();
    assert!(info.ours_exists && !info.theirs_exists);
    assert!(conflicts::read_conflict_side(&r, "a.txt", "theirs").is_err(), "a deleted side has no content");

    conflicts::resolve_side(&r, "a.txt", MergeSide::Theirs).unwrap(); // accept the deletion
    assert!(!dir.join("a.txt").exists());
    assert!(status::commit(&r, "merge", false).is_ok());
}

#[test]
fn a_file_edited_by_hand_can_be_marked_resolved() {
    let (dir, r, _main) = conflicted_repo("conflict-by-hand");
    fs::write(dir.join("a.txt"), "written by hand\n").unwrap();
    conflicts::mark_resolved(&r, "a.txt").unwrap();
    assert!(status::commit(&r, "merge", false).is_ok());
    assert_eq!(normalized(dir.join("a.txt")), "written by hand\n");
}

// ---------------------------------------------------------------- line-level staging

fn numbered(n: usize) -> String {
    (1..=n).map(|i| format!("line{i}\n")).collect()
}

/// The text Git has in its index for `path`.
fn index_text(repo_path: &str, path: &str) -> String {
    let repo = git2::Repository::open(repo_path).unwrap();
    let index = repo.index().unwrap();
    let entry = index.get_path(std::path::Path::new(path), 0).expect("path is in the index");
    let blob = repo.find_blob(entry.id).unwrap();
    let text = String::from_utf8(blob.content().to_vec()).unwrap();
    text
}

/// A line of the diff, found by kind and text.
fn pick(diff: &FileDiff, kind: LineKind, text: &str) -> LineRef {
    for (h, hunk) in diff.hunks.iter().enumerate() {
        for (l, line) in hunk.lines.iter().enumerate() {
            if line.kind == kind && line.text == text {
                return LineRef { hunk: h, line: l };
            }
        }
    }
    panic!("no {kind:?} line '{text}' in the diff");
}

/// A committed 12-line file named a.txt.
fn repo_with_numbered_file(name: &str) -> (PathBuf, String) {
    let dir = repo_with_commit(name);
    let r = s(&dir);
    fs::write(dir.join("a.txt"), numbered(12)).unwrap();
    status::stage(&r, &[]).unwrap();
    status::commit(&r, "twelve lines", false).unwrap();
    (dir, r)
}

#[test]
fn staging_one_of_two_changes_leaves_the_other_unstaged() {
    let (dir, r) = repo_with_numbered_file("lines-one-of-two");
    let edited = numbered(12).replace("line2\n", "line2 CHANGED\n").replace("line11\n", "line11 CHANGED\n");
    fs::write(dir.join("a.txt"), &edited).unwrap();

    let diff = lines::file_diff(&r, "a.txt", false).unwrap();
    assert_eq!(diff.hunks.len(), 2, "two edits far apart are two hunks");
    assert!(diff.selectable);

    let picks = [pick(&diff, LineKind::Removed, "line2"), pick(&diff, LineKind::Added, "line2 CHANGED")];
    lines::stage_lines(&r, "a.txt", &picks, &diff.fingerprint).unwrap();

    assert_eq!(index_text(&r, "a.txt"), numbered(12).replace("line2\n", "line2 CHANGED\n"));
    assert_eq!(fs::read_to_string(dir.join("a.txt")).unwrap(), edited, "the working file is never touched");

    let st = status::repo_status(&r).unwrap();
    assert!(st.files.iter().any(|f| f.path == "a.txt" && f.staged));
    assert!(st.files.iter().any(|f| f.path == "a.txt" && !f.staged), "the other edit is still unstaged");
    assert_eq!(lines::file_diff(&r, "a.txt", true).unwrap().hunks.len(), 1);
    assert_eq!(lines::file_diff(&r, "a.txt", false).unwrap().hunks.len(), 1);
}

#[test]
fn staging_only_the_added_half_of_a_replacement_keeps_the_old_line() {
    let (dir, r) = repo_with_numbered_file("lines-half-replacement");
    fs::write(dir.join("a.txt"), numbered(12).replace("line5\n", "line5 NEW\n")).unwrap();

    let diff = lines::file_diff(&r, "a.txt", false).unwrap();
    lines::stage_lines(&r, "a.txt", &[pick(&diff, LineKind::Added, "line5 NEW")], &diff.fingerprint).unwrap();

    assert_eq!(index_text(&r, "a.txt"), numbered(12).replace("line5\n", "line5\nline5 NEW\n"));
}

#[test]
fn unstaging_one_change_keeps_the_other_staged() {
    let (dir, r) = repo_with_numbered_file("lines-unstage");
    let edited = numbered(12).replace("line2\n", "line2 CHANGED\n").replace("line11\n", "line11 CHANGED\n");
    fs::write(dir.join("a.txt"), &edited).unwrap();
    status::stage(&r, &["a.txt".into()]).unwrap();

    let diff = lines::file_diff(&r, "a.txt", true).unwrap();
    assert_eq!(diff.hunks.len(), 2);
    let picks = [pick(&diff, LineKind::Removed, "line11"), pick(&diff, LineKind::Added, "line11 CHANGED")];
    lines::unstage_lines(&r, "a.txt", &picks, &diff.fingerprint).unwrap();

    assert_eq!(index_text(&r, "a.txt"), numbered(12).replace("line2\n", "line2 CHANGED\n"));
    assert_eq!(fs::read_to_string(dir.join("a.txt")).unwrap(), edited);
    let unstaged = lines::file_diff(&r, "a.txt", false).unwrap();
    assert_eq!(unstaged.hunks.len(), 1);
    assert!(unstaged.hunks[0].lines.iter().any(|l| l.text == "line11 CHANGED"));
}

#[test]
fn a_new_file_can_be_staged_in_part_and_unstaged_again() {
    let dir = repo_with_commit("lines-new-file");
    let r = s(&dir);
    fs::write(dir.join("new.txt"), "a\nb\nc\nd\n").unwrap();

    let diff = lines::file_diff(&r, "new.txt", false).unwrap();
    assert_eq!(diff.hunks.len(), 1);
    assert!(diff.selectable);
    let first_two = [pick(&diff, LineKind::Added, "a"), pick(&diff, LineKind::Added, "b")];
    lines::stage_lines(&r, "new.txt", &first_two, &diff.fingerprint).unwrap();
    assert_eq!(index_text(&r, "new.txt"), "a\nb\n");

    let st = status::repo_status(&r).unwrap();
    assert!(st.files.iter().any(|f| f.path == "new.txt" && f.staged && f.status == ChangeStatus::Added));
    assert!(st.files.iter().any(|f| f.path == "new.txt" && !f.staged && f.status == ChangeStatus::Modified));

    // take both staged lines back out: the file is no longer in the index at all
    let staged = lines::file_diff(&r, "new.txt", true).unwrap();
    let both = [pick(&staged, LineKind::Added, "a"), pick(&staged, LineKind::Added, "b")];
    lines::unstage_lines(&r, "new.txt", &both, &staged.fingerprint).unwrap();
    let st = status::repo_status(&r).unwrap();
    assert!(st.files.iter().all(|f| !f.staged), "nothing should remain staged");
    assert!(st.files.iter().any(|f| f.path == "new.txt" && f.status == ChangeStatus::Untracked));
}

#[test]
fn insertions_at_the_very_start_and_end_of_a_file() {
    let (dir, r) = repo_with_numbered_file("lines-edges");
    fs::write(dir.join("a.txt"), format!("line0\n{}line13\n", numbered(12))).unwrap();

    let diff = lines::file_diff(&r, "a.txt", false).unwrap();
    assert_eq!(diff.hunks.len(), 2);
    lines::stage_lines(&r, "a.txt", &[pick(&diff, LineKind::Added, "line0")], &diff.fingerprint).unwrap();
    assert_eq!(index_text(&r, "a.txt"), format!("line0\n{}", numbered(12)));

    let diff = lines::file_diff(&r, "a.txt", false).unwrap();
    lines::stage_lines(&r, "a.txt", &[pick(&diff, LineKind::Added, "line13")], &diff.fingerprint).unwrap();
    assert_eq!(index_text(&r, "a.txt"), format!("line0\n{}line13\n", numbered(12)));
}

#[test]
fn a_view_that_is_out_of_date_is_refused() {
    let (dir, r) = repo_with_numbered_file("lines-stale");
    fs::write(dir.join("a.txt"), numbered(12).replace("line3\n", "line3 v1\n")).unwrap();
    let diff = lines::file_diff(&r, "a.txt", false).unwrap();
    let picks = [pick(&diff, LineKind::Added, "line3 v1")];

    fs::write(dir.join("a.txt"), numbered(12).replace("line3\n", "line3 v2\n")).unwrap(); // edited again meanwhile
    let error = lines::stage_lines(&r, "a.txt", &picks, &diff.fingerprint).unwrap_err().to_string();
    assert!(error.contains("changed"), "got: {error}");
    assert!(lines::stage_lines(&r, "a.txt", &[], &diff.fingerprint).is_err(), "an empty selection is refused");
}

#[test]
fn binary_and_deleted_files_cannot_be_picked_line_by_line() {
    let dir = repo_with_commit("lines-binary");
    let r = s(&dir);
    fs::write(dir.join("data.bin"), [0u8, 1, 2, 3, 0, 255]).unwrap();
    status::stage(&r, &[]).unwrap();
    status::commit(&r, "binary", false).unwrap();

    fs::write(dir.join("data.bin"), [0u8, 9, 9, 9, 0, 254]).unwrap();
    let diff = lines::file_diff(&r, "data.bin", false).unwrap();
    assert!(diff.binary && !diff.selectable);

    fs::remove_file(dir.join("a.txt")).unwrap();
    let diff = lines::file_diff(&r, "a.txt", false).unwrap();
    assert!(!diff.selectable, "a deleted file can only be staged whole");
}
