// Git types that mirror src-tauri/src/model/git.rs (camelCase).

export type ChangeStatus = "added" | "modified" | "deleted" | "renamed" | "untracked" | "conflicted" | "typechange";

export interface FileChange {
  path: string;
  status: ChangeStatus;
  staged: boolean;
}

export interface RepoStatus {
  branch: string;
  detached: boolean;
  hasCommits: boolean;
  upstream: string | null;
  ahead: number;
  behind: number;
  merging: boolean;
  /** The message Git prepared for the merge commit, while merging. */
  mergeMessage: string | null;
  files: FileChange[];
}

export interface BranchInfo {
  name: string;
  isCurrent: boolean;
  isRemote: boolean;
  upstream: string | null;
  ahead: number;
  behind: number;
  summary: string;
  time: number;
}

export interface StashInfo {
  index: number;
  message: string;
}

export interface RemoteInfo {
  name: string;
  url: string;
}

export type RefKind = "head" | "branch" | "remote" | "tag";

export interface RefLabel {
  name: string;
  kind: RefKind;
}

export interface LaneLink {
  from: number;
  to: number;
}

export interface GraphRow {
  id: string;
  shortId: string;
  parents: string[];
  summary: string;
  author: string;
  time: number;
  refs: RefLabel[];
  lane: number;
  top: LaneLink[];
  bottom: LaneLink[];
}

export interface Graph {
  rows: GraphRow[];
  laneCount: number;
  truncated: boolean;
}

export interface CommitFile {
  path: string;
  status: ChangeStatus;
}

export interface GitToolInfo {
  available: boolean;
  version: string;
}

export interface Identity {
  name: string;
  email: string;
}

// ---- merge conflicts

export type MergeSide = "ours" | "theirs";

export interface ConflictInfo {
  path: string;
  /** The branch you are on. */
  oursLabel: string;
  /** The branch being merged in. */
  theirsLabel: string;
  /** False when that side deleted the file. */
  oursExists: boolean;
  theirsExists: boolean;
  /** Plain text that can be merged hunk by hunk (not a Word file or other binary). */
  isText: boolean;
}

export type ConflictPart = { type: "text"; text: string } | { type: "conflict"; ours: string; theirs: string };

export type HunkChoice = { kind: "ours" } | { kind: "theirs" } | { kind: "both" } | { kind: "custom"; text: string };

// ---- line-level staging

export type LineKind = "context" | "added" | "removed";

export interface DiffLineInfo {
  kind: LineKind;
  oldNo: number | null;
  newNo: number | null;
  text: string;
}

export interface DiffHunkInfo {
  header: string;
  lines: DiffLineInfo[];
}

/** The changes of one text file, either not yet staged or already staged. */
export interface FileDiff {
  path: string;
  staged: boolean;
  binary: boolean;
  hunks: DiffHunkInfo[];
  /** Sent back with a staging request so a stale view is refused. */
  fingerprint: string;
  /** Lines can be picked one by one (text files that were added or modified, not deleted). */
  selectable: boolean;
}

/** Points at one line of a FileDiff: hunk number, then line number inside that hunk. */
export interface LineRef {
  hunk: number;
  line: number;
}
