// The only place the UI talks to the Rust backend.
// One function per backend command (src-tauri/src/commands.rs).

import { Channel, invoke } from "@tauri-apps/api/core";
import type {
  BranchInfo, CommitFile, ConflictInfo, ConflictPart, FileChange, FileDiff, Graph, GitToolInfo, HunkChoice, Identity,
  LineRef, MergeSide, RemoteInfo, RepoStatus, StashInfo,
} from "./gitTypes";
import type { DiffDocument, Outline, RepoInfo, Source, VersionInfo } from "./types";

/** Raw bytes the shell printed (the backend sends them as base64). */
const fromBase64 = (text: string): Uint8Array => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

export const api = {
  /** Start a shell in `cwd`. Returns its id. `onData` gets everything the shell prints. */
  terminalStart: (cwd: string, cols: number, rows: number, onData: (bytes: Uint8Array) => void, onExit: () => void) => {
    const data = new Channel<string>();
    data.onmessage = (text) => onData(fromBase64(text));
    const exit = new Channel<void>();
    exit.onmessage = onExit;
    return invoke<number>("terminal_start", { cwd, cols, rows, onData: data, onExit: exit });
  },
  terminalWrite: (id: number, data: string) => invoke<void>("terminal_write", { id, data }),
  terminalResize: (id: number, cols: number, rows: number) => invoke<void>("terminal_resize", { id, cols, rows }),
  terminalClose: (id: number) => invoke<void>("terminal_close", { id }),

  startupPath: () => invoke<string | null>("startup_path"),

  // ---- documents and comparison
  openRepository: (path: string) => invoke<RepoInfo>("open_repository", { path }),
  listVersions: (repo: string, file: string) => invoke<VersionInfo[]>("list_versions", { repo, file }),
  compareDocuments: (oldSource: Source, newSource: Source) =>
    invoke<DiffDocument>("compare_documents", { old: oldSource, new: newSource }),
  loadOutline: (source: Source) => invoke<Outline>("load_outline", { source }),

  // ---- review progress and export
  loadReviewState: (repo: string) => invoke<string | null>("load_review_state", { repo }),
  saveReviewState: (repo: string, json: string) => invoke<void>("save_review_state", { repo, json }),
  saveTextFile: (path: string, content: string) => invoke<void>("save_text_file", { path, content }),
  aiComplete: (config: { kind: string; model: string; baseUrl: string; apiKey: string; command: string }, system: string, user: string) =>
    invoke<string>("ai_complete", { config, system, user }),
  saveDocumentEdits: (
    repo: string,
    path: string,
    changes: {
      edits: { position: number; oldText: string; newText: string }[];
      inserts: { after: number; like: number | null; text: string }[];
      deletes: { position: number; oldText: string }[];
    },
  ) => invoke<void>("save_document_edits", { repo, path, changes }),

  // ---- Git: reading
  gitToolInfo: () => invoke<GitToolInfo>("git_tool_info"),
  repoStatus: (repo: string) => invoke<RepoStatus>("repo_status", { repo }),
  commitGraph: (repo: string, limit: number) => invoke<Graph>("commit_graph", { repo, limit }),
  commitFiles: (repo: string, id: string) => invoke<CommitFile[]>("commit_files", { repo, id }),
  listBranches: (repo: string) => invoke<BranchInfo[]>("list_branches", { repo }),
  listStashes: (repo: string) => invoke<StashInfo[]>("list_stashes", { repo }),
  listRemotes: (repo: string) => invoke<RemoteInfo[]>("list_remotes", { repo }),
  getIdentity: (repo: string) => invoke<Identity | null>("get_identity", { repo }),

  // ---- Git: changing the repository (built-in engine)
  stageFiles: (repo: string, paths: string[]) => invoke<void>("stage_files", { repo, paths }),
  unstageFiles: (repo: string, paths: string[]) => invoke<void>("unstage_files", { repo, paths }),
  discardFiles: (repo: string, paths: string[]) => invoke<void>("discard_files", { repo, paths }),
  commitChanges: (repo: string, message: string, amend: boolean) =>
    invoke<string>("commit_changes", { repo, message, amend }),
  createBranch: (repo: string, name: string, start: string | null, checkout: boolean) =>
    invoke<void>("create_branch", { repo, name, start, checkout }),
  checkoutBranch: (repo: string, name: string) => invoke<void>("checkout_branch", { repo, name }),
  deleteBranch: (repo: string, name: string, force: boolean) => invoke<void>("delete_branch", { repo, name, force }),
  createTag: (repo: string, name: string, message: string | null) => invoke<void>("create_tag", { repo, name, message }),
  deleteTag: (repo: string, name: string) => invoke<void>("delete_tag", { repo, name }),
  stashSave: (repo: string, message: string, includeUntracked: boolean) =>
    invoke<void>("stash_save", { repo, message, includeUntracked }),
  stashApply: (repo: string, index: number) => invoke<void>("stash_apply", { repo, index }),
  stashPop: (repo: string, index: number) => invoke<void>("stash_pop", { repo, index }),
  stashDrop: (repo: string, index: number) => invoke<void>("stash_drop", { repo, index }),
  addRemote: (repo: string, name: string, url: string) => invoke<void>("add_remote", { repo, name, url }),
  initRepository: (folder: string) => invoke<void>("init_repository", { folder }),
  setIdentity: (repo: string, name: string, email: string, global: boolean) =>
    invoke<void>("set_identity", { repo, name, email, global }),

  // ---- Git: line-level staging
  fileDiff: (repo: string, path: string, staged: boolean) => invoke<FileDiff>("file_diff", { repo, path, staged }),
  stageLines: (repo: string, path: string, picks: LineRef[], fingerprint: string) =>
    invoke<void>("stage_lines", { repo, path, picks, fingerprint }),
  unstageLines: (repo: string, path: string, picks: LineRef[], fingerprint: string) =>
    invoke<void>("unstage_lines", { repo, path, picks, fingerprint }),

  // ---- Git: merge conflicts
  conflictInfo: (repo: string, path: string) => invoke<ConflictInfo>("conflict_info", { repo, path }),
  conflictHunks: (repo: string, path: string) => invoke<ConflictPart[]>("conflict_hunks", { repo, path }),
  resolveConflictSide: (repo: string, path: string, side: MergeSide) =>
    invoke<void>("resolve_conflict_side", { repo, path, side }),
  resolveConflictHunks: (repo: string, path: string, choices: HunkChoice[]) =>
    invoke<void>("resolve_conflict_hunks", { repo, path, choices }),
  markConflictResolved: (repo: string, path: string) => invoke<void>("mark_conflict_resolved", { repo, path }),

  // ---- Git: talking to servers (installed Git)
  gitFetch: (repo: string) => invoke<string>("git_fetch", { repo }),
  gitPull: (repo: string, strategy: "merge" | "rebase" | "ff-only") => invoke<string>("git_pull", { repo, strategy }),
  gitPush: (repo: string, publish: boolean, forceWithLease: boolean) =>
    invoke<string>("git_push", { repo, publish, forceWithLease }),
  gitMerge: (repo: string, branch: string) => invoke<string>("git_merge", { repo, branch }),
  gitAbortMerge: (repo: string) => invoke<string>("git_abort_merge", { repo }),
  gitClone: (url: string, destination: string) => invoke<string>("git_clone", { url, destination }),
};

export type { FileChange };

/** Errors from the backend arrive as plain strings. */
export function errorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}
