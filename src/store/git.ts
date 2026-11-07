// Git client state: status, branches, stashes, the commit graph, and every Git action.
//
// All actions go through `run()`, which shows what is happening, reports errors
// as toasts, writes the activity log, and refreshes everything afterwards.

import { create } from "zustand";
import { api, errorMessage } from "../api/commands";
import type { BranchInfo, CommitFile, Graph, GitToolInfo, HunkChoice, Identity, LineRef, MergeSide, RemoteInfo, RepoStatus, StashInfo } from "../api/gitTypes";
import { useTextDiff } from "./textDiff";
import { useUi } from "./ui";
import { useWorkspace } from "./workspace";

export interface LogEntry {
  id: number;
  time: number;
  label: string;
  ok: boolean;
  output: string;
}

const GRAPH_PAGE = 300;

interface GitState {
  tool: GitToolInfo | null;
  status: RepoStatus | null;
  branches: BranchInfo[];
  stashes: StashInfo[];
  remotes: RemoteInfo[];
  identity: Identity | null;
  graph: Graph | null;
  graphLimit: number;
  selectedCommit: string | null;
  selectedCommitFiles: CommitFile[];
  /** Name of the action in progress, or null. */
  busy: string | null;
  log: LogEntry[];

  refresh: () => Promise<void>;
  loadMoreGraph: () => Promise<void>;
  selectCommit: (id: string | null) => Promise<void>;
  clear: () => void;

  stage: (paths: string[]) => Promise<void>;
  unstage: (paths: string[]) => Promise<void>;
  discard: (paths: string[]) => Promise<void>;
  /** Stage or unstage individual lines of a text file (`fingerprint` comes from the diff being viewed). */
  stageLines: (path: string, picks: LineRef[], fingerprint: string) => Promise<boolean>;
  unstageLines: (path: string, picks: LineRef[], fingerprint: string) => Promise<boolean>;
  commit: (message: string, amend: boolean) => Promise<boolean>;

  createBranch: (name: string, start: string | null, checkout: boolean) => Promise<void>;
  checkout: (name: string) => Promise<void>;
  deleteBranch: (name: string) => Promise<void>;
  createTag: (name: string, message: string | null) => Promise<void>;
  merge: (branch: string) => Promise<void>;
  abortMerge: () => Promise<void>;
  resolveSide: (path: string, side: MergeSide) => Promise<boolean>;
  resolveHunks: (path: string, choices: HunkChoice[]) => Promise<boolean>;
  markResolved: (path: string) => Promise<boolean>;

  stashSave: (message: string, includeUntracked: boolean) => Promise<void>;
  stashApply: (index: number) => Promise<void>;
  stashPop: (index: number) => Promise<void>;
  stashDrop: (index: number) => Promise<void>;

  fetch: () => Promise<void>;
  pull: (strategy: "merge" | "rebase" | "ff-only") => Promise<void>;
  push: () => Promise<void>;
  addRemote: (name: string, url: string) => Promise<void>;
  setIdentity: (name: string, email: string, global: boolean) => Promise<void>;
}

const repoRoot = () => useWorkspace.getState().repo?.root ?? null;
let nextLogId = 1;

export const useGit = create<GitState>((set, get) => {
  /**
   * Run one Git action: show it as busy, log it, report errors, then refresh.
   * Returns true when it succeeded.
   */
  async function run(label: string, task: (root: string) => Promise<string | void>, opts: { toastSuccess?: boolean } = {}): Promise<boolean> {
    const root = repoRoot();
    if (!root) return false;
    set({ busy: label });
    try {
      const output = (await task(root)) ?? "";
      set((s) => ({ log: [...s.log.slice(-199), { id: nextLogId++, time: Date.now(), label, ok: true, output }] }));
      if (opts.toastSuccess) useUi.getState().toast("success", label);
      await get().refresh();
      void useWorkspace.getState().refreshVersions();
      return true;
    } catch (e) {
      const message = errorMessage(e);
      set((s) => ({ log: [...s.log.slice(-199), { id: nextLogId++, time: Date.now(), label, ok: false, output: message }] }));
      useUi.getState().toast("error", message);
      // A failed action can still change the repository (a merge conflict leaves a merge open): show it.
      void get().refresh();
      return false;
    } finally {
      set({ busy: null });
    }
  }

  async function confirmDestructive(title: string, message: string, confirmLabel: string) {
    return useUi.getState().confirm({ title, message, confirmLabel, danger: true });
  }

  return {
    tool: null,
    status: null,
    branches: [],
    stashes: [],
    remotes: [],
    identity: null,
    graph: null,
    graphLimit: GRAPH_PAGE,
    selectedCommit: null,
    selectedCommitFiles: [],
    busy: null,
    log: [],

    refresh: async () => {
      const root = repoRoot();
      if (!root) return;
      try {
        const [status, branches, stashes, remotes, graph, identity] = await Promise.all([
          api.repoStatus(root),
          api.listBranches(root),
          api.listStashes(root),
          api.listRemotes(root),
          api.commitGraph(root, get().graphLimit),
          api.getIdentity(root),
        ]);
        set({ status, branches, stashes, remotes, graph, identity });
        void useTextDiff.getState().reload(); // the open diff may have changed
        if (!get().tool) set({ tool: await api.gitToolInfo() });
      } catch (e) {
        useUi.getState().toast("error", errorMessage(e));
      }
    },

    loadMoreGraph: async () => {
      set((s) => ({ graphLimit: s.graphLimit + GRAPH_PAGE }));
      await get().refresh();
    },

    selectCommit: async (id) => {
      set({ selectedCommit: id, selectedCommitFiles: [] });
      const root = repoRoot();
      if (!id || !root) return;
      try {
        const files = await api.commitFiles(root, id);
        if (get().selectedCommit === id) set({ selectedCommitFiles: files });
      } catch (e) {
        useUi.getState().toast("error", errorMessage(e));
      }
    },

    clear: () =>
      set({ status: null, branches: [], stashes: [], remotes: [], graph: null, graphLimit: GRAPH_PAGE, selectedCommit: null, selectedCommitFiles: [] }),

    // ---- everyday changes
    stage: async (paths) => void (await run(paths.length ? "Stage" : "Stage all", (r) => api.stageFiles(r, paths))),
    unstage: async (paths) => void (await run(paths.length ? "Unstage" : "Unstage all", (r) => api.unstageFiles(r, paths))),

    stageLines: (path, picks, fingerprint) =>
      run(`Stage ${picks.length} line${picks.length === 1 ? "" : "s"}`, (r) => api.stageLines(r, path, picks, fingerprint)),
    unstageLines: (path, picks, fingerprint) =>
      run(`Unstage ${picks.length} line${picks.length === 1 ? "" : "s"}`, (r) => api.unstageLines(r, path, picks, fingerprint)),

    discard: async (paths) => {
      const what = paths.length === 1 ? `“${paths[0]}”` : `${paths.length} files`;
      const ok = await confirmDestructive("Discard changes?", `This permanently throws away your uncommitted changes in ${what}. This cannot be undone.`, "Discard changes");
      if (ok) await run("Discard changes", (r) => api.discardFiles(r, paths));
    },

    commit: async (message, amend) => {
      const root = repoRoot();
      if (!root) return false;
      // Commits need a name and email: ask once, then retry.
      if (!get().identity) {
        const values = await useUi.getState().prompt({
          title: "Who are you?",
          message: "Git records a name and email on every commit. This is saved on this computer.",
          fields: [
            { name: "name", label: "Name", required: true },
            { name: "email", label: "Email", required: true },
          ],
          confirmLabel: "Save and continue",
        });
        if (!values) return false;
        const saved = await run("Save identity", (r) => api.setIdentity(r, values.name, values.email, true));
        if (!saved) return false;
      }
      return run(amend ? "Amend commit" : "Commit", (r) => api.commitChanges(r, message, amend).then((id) => `Committed ${id.slice(0, 7)}`), { toastSuccess: true });
    },

    // ---- branches and tags
    createBranch: async (name, start, checkout) => void (await run(`Create branch ${name}`, (r) => api.createBranch(r, name, start, checkout))),
    checkout: async (name) => void (await run(`Switch to ${name}`, (r) => api.checkoutBranch(r, name))),

    deleteBranch: async (name) => {
      const root = repoRoot();
      if (!root) return;
      // First try the safe delete; only if Git says it is unmerged do we ask about forcing it.
      try {
        await api.deleteBranch(root, name, false);
        await get().refresh();
        useUi.getState().toast("success", `Deleted branch ${name}`);
      } catch (e) {
        const message = errorMessage(e);
        if (!message.includes("not merged")) {
          useUi.getState().toast("error", message);
          return;
        }
        const ok = await confirmDestructive("Delete unmerged branch?", `${message}`, "Delete anyway");
        if (ok) await run(`Delete branch ${name}`, (r) => api.deleteBranch(r, name, true));
      }
    },

    createTag: async (name, message) => void (await run(`Create tag ${name}`, (r) => api.createTag(r, name, message))),
    merge: async (branch) => void (await run(`Merge ${branch}`, (r) => api.gitMerge(r, branch), { toastSuccess: true })),
    abortMerge: async () => void (await run("Abort merge", (r) => api.gitAbortMerge(r))),
    resolveSide: (path, side) => run(`Resolve ${path}`, (r) => api.resolveConflictSide(r, path, side)),
    resolveHunks: (path, choices) => run(`Resolve ${path}`, (r) => api.resolveConflictHunks(r, path, choices)),
    markResolved: (path) => run(`Resolve ${path}`, (r) => api.markConflictResolved(r, path)),

    // ---- stash
    stashSave: async (message, includeUntracked) => void (await run("Stash changes", (r) => api.stashSave(r, message, includeUntracked), { toastSuccess: true })),
    stashApply: async (index) => void (await run("Apply stash", (r) => api.stashApply(r, index))),
    stashPop: async (index) => void (await run("Pop stash", (r) => api.stashPop(r, index))),
    stashDrop: async (index) => {
      const ok = await confirmDestructive("Delete this stash?", "The stashed changes will be lost for good.", "Delete stash");
      if (ok) await run("Delete stash", (r) => api.stashDrop(r, index));
    },

    // ---- servers
    fetch: async () => void (await run("Fetch", (r) => api.gitFetch(r).then((o) => o || "Already up to date."))),
    pull: async (strategy) => void (await run("Pull", (r) => api.gitPull(r, strategy), { toastSuccess: true })),
    push: async () => {
      const status = get().status;
      const publish = !!status && !status.upstream;
      if (publish && get().remotes.length === 0) {
        const values = await useUi.getState().prompt({
          title: "Connect to a server",
          message: "Paste the address of the empty repository you created on GitHub, GitLab or similar.",
          fields: [{ name: "url", label: "Repository address", placeholder: "https://github.com/you/paper.git", required: true }],
          confirmLabel: "Connect and publish",
        });
        if (!values) return;
        if (!(await run("Add remote origin", (r) => api.addRemote(r, "origin", values.url)))) return;
      }
      await run(publish ? "Publish branch" : "Push", (r) => api.gitPush(r, publish, false), { toastSuccess: true });
    },
    addRemote: async (name, url) => void (await run(`Add remote ${name}`, (r) => api.addRemote(r, name, url))),
    setIdentity: async (name, email, global) => void (await run("Save identity", (r) => api.setIdentity(r, name, email, global))),
  };
});
