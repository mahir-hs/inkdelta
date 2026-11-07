// What the user is looking at: the project, the document, the two versions, and the comparison.

import { open } from "@tauri-apps/plugin-dialog";
import { create } from "zustand";
import { api, errorMessage } from "../api/commands";
import type { DiffDocument, RepoInfo, Source, VersionInfo } from "../api/types";
import { versionKey } from "../lib/format";
import { showPanel } from "../app/layout";
import { rememberProject } from "./recent";
import { useUi } from "./ui";

interface LooseFiles {
  old: Source;
  new: Source;
}

interface WorkspaceState {
  repo: RepoInfo | null;
  /** Repo-relative path of the document being compared. */
  file: string | null;
  versions: VersionInfo[];
  oldKey: string | null;
  newKey: string | null;
  loose: LooseFiles | null;

  diff: DiffDocument | null;
  comparing: boolean;
  error: string | null;

  changesOnly: boolean;
  /** Reading mode: show the newer version as a clean document, without the change marks. */
  reading: boolean;
  selectedChange: number | null;
  /** Asks the document to scroll to a change (nonce makes repeated requests to the same change work). */
  scrollRequest: { change: number; nonce: number } | null;

  openPath: (path: string) => Promise<void>;
  openFolder: () => Promise<void>;
  chooseFile: (file: string) => Promise<void>;
  compareTwoFiles: () => Promise<void>;
  setOldKey: (key: string) => void;
  setNewKey: (key: string) => void;
  compareWithOriginal: () => void;
  compareWithPrevious: () => void;
  /** Show `file` changing from commit `oldId` (null = nothing earlier) to `newId` ("workdir" for the working copy). */
  compareVersions: (file: string, oldId: string | null, newId: string) => Promise<void>;
  /** Re-read the version list (after commits) and keep the current choice where possible. */
  refreshVersions: () => Promise<void>;
  setChangesOnly: (value: boolean) => void;
  setReading: (value: boolean) => void;
  /** Open a document for reading (its newest version, no change marks). */
  readDocument: (file: string) => Promise<void>;
  /** Open one version of the current document for reading. */
  readVersion: (key: string) => void;
  selectChange: (change: number | null) => void;
  /** Select a change and scroll the document to it. */
  jumpToChange: (change: number) => void;
  /** Show what changed in a document since its last commit. */
  compareWorkingCopy: (file: string) => Promise<void>;
  cloneRepository: () => Promise<void>;
  /** Show the redline between the two sides of a conflicted Word file (mine -> theirs). */
  compareConflictSides: (path: string) => Promise<void>;
}

/** Stands for "no earlier version": the document is shown as entirely new. */
export const EMPTY_KEY = "empty";

/** The two Source objects the backend needs, from the current choice. */
export function currentSources(s: Pick<WorkspaceState, "repo" | "file" | "oldKey" | "newKey" | "loose">): [Source, Source] | null {
  if (s.loose) return [s.loose.old, s.loose.new];
  if (!s.repo || !s.file || !s.oldKey || !s.newKey) return null;
  const toSource = (key: string): Source =>
    key === EMPTY_KEY
      ? { kind: "empty", path: s.file! }
      : key === "workdir"
        ? { kind: "workdir", repo: s.repo!.root, path: s.file! }
        : { kind: "git", repo: s.repo!.root, rev: key, path: s.file! };
  return [toSource(s.oldKey), toSource(s.newKey)];
}

/** The document with the longest history is almost always the one being written. */
async function pickMostEditedFile(info: RepoInfo): Promise<string | null> {
  const candidates = info.docxFiles.slice(0, 25);
  const counts = await Promise.all(
    candidates.map((file) => api.listVersions(info.root, file).then((v) => v.length).catch(() => 0)),
  );
  let best = 0;
  counts.forEach((count, i) => {
    if (count > counts[best]) best = i;
  });
  return candidates[best] ?? null;
}

let compareToken = 0; // ignore results of an outdated comparison

export const useWorkspace = create<WorkspaceState>((set, get) => {
  /** Run the comparison for the current choice. */
  async function recompare() {
    const sources = currentSources(get());
    const token = ++compareToken;
    if (!sources) {
      set({ diff: null, comparing: false, selectedChange: null });
      return;
    }
    set({ comparing: true });
    try {
      const diff = await api.compareDocuments(sources[0], sources[1]);
      if (token !== compareToken) return;
      set({ diff, comparing: false, error: null, selectedChange: null });
    } catch (e) {
      if (token !== compareToken) return;
      set({ diff: null, comparing: false, error: errorMessage(e) });
    }
  }

  /** Load the history of a document and default to "original -> newest". */
  async function loadVersions(root: string, file: string) {
    const versions = await api.listVersions(root, file);
    set({
      versions,
      newKey: versions.length ? versionKey(versions[0]) : null,
      oldKey: versions.length > 1 ? versionKey(versions[versions.length - 1]) : null,
      error: null,
    });
  }

  return {
    repo: null,
    file: null,
    versions: [],
    oldKey: null,
    newKey: null,
    loose: null,
    diff: null,
    comparing: false,
    error: null,
    changesOnly: false,
    reading: true,
    selectedChange: null,
    scrollRequest: null,

    openPath: async (path) => {
      try {
        const info = await api.openRepository(path);
        const file = await pickMostEditedFile(info);
        rememberProject(info.root, info.name);
        set({ repo: info, loose: null, file, versions: [], oldKey: null, newKey: null, diff: null, error: null, reading: true });
        if (file) await loadVersions(info.root, file);
        else set({ error: "No .docx files found in this repository." });
        await recompare();
      } catch (e) {
        const message = errorMessage(e);
        // A plain folder: offer to turn it into a repository.
        if (message.includes("not inside a Git repository")) {
          const ok = await useUi.getState().confirm({
            title: "This folder is not a Git repository",
            message: "Create a repository here so Inkdelta can track versions of your documents?",
            confirmLabel: "Create repository",
          });
          if (ok) {
            try {
              await api.initRepository(path);
              await get().openPath(path);
            } catch (inner) {
              useUi.getState().toast("error", errorMessage(inner));
            }
          }
          return;
        }
        set({ error: message });
      }
    },

    openFolder: async () => {
      const chosen = await open({ directory: true, multiple: false, title: "Open project folder" });
      if (typeof chosen === "string") await get().openPath(chosen);
    },

    chooseFile: async (file) => {
      const repo = get().repo;
      if (!repo) return;
      set({ file, loose: null, versions: [], oldKey: null, newKey: null });
      try {
        await loadVersions(repo.root, file);
        await recompare();
      } catch (e) {
        set({ error: errorMessage(e) });
      }
    },

    compareTwoFiles: async () => {
      const filters = [{ name: "Word document", extensions: ["docx"] }];
      const older = await open({ multiple: false, filters, title: "Choose the OLDER .docx" });
      if (typeof older !== "string") return;
      const newer = await open({ multiple: false, filters, title: "Choose the NEWER .docx" });
      if (typeof newer !== "string") return;
      set({
        repo: null, file: null, versions: [], oldKey: null, newKey: null, error: null, reading: false,
        loose: { old: { kind: "file", path: older }, new: { kind: "file", path: newer } },
      });
      await recompare();
    },

    setOldKey: (key) => {
      set({ oldKey: key });
      void recompare();
    },
    setNewKey: (key) => {
      set({ newKey: key });
      void recompare();
    },
    compareWithOriginal: () => {
      const { versions } = get();
      if (versions.length > 1) get().setOldKey(versionKey(versions[versions.length - 1]));
    },
    compareWithPrevious: () => {
      const { versions } = get();
      if (versions.length > 1) get().setOldKey(versionKey(versions[1]));
    },

    compareVersions: async (file, oldId, newId) => {
      const repo = get().repo;
      if (!repo) return;
      if (get().file !== file || get().loose) {
        set({ file, loose: null });
        const versions = await api.listVersions(repo.root, file);
        set({ versions });
      }
      // Compare with the file's own previous version. (The commit before this one may not have
      // touched the file, so it would not be in the version list.) A brand-new file has none.
      const { versions } = get();
      const at = versions.findIndex((v) => versionKey(v) === newId);
      const previous = at >= 0 ? versions[at + 1] : undefined;
      const oldKey = previous ? versionKey(previous) : oldId && versions.some((v) => versionKey(v) === oldId) ? oldId : EMPTY_KEY;
      set({ file, loose: null, oldKey, newKey: newId, reading: false });
      showPanel("redline");
      await recompare();
    },

    refreshVersions: async () => {
      const { repo, file, oldKey, newKey } = get();
      if (!repo || !file) return;
      try {
        const versions = await api.listVersions(repo.root, file);
        const keys = new Set(versions.map(versionKey));
        const sameChoice = !!oldKey && !!newKey && keys.has(oldKey) && keys.has(newKey);
        set({ versions });
        if (!sameChoice) {
          set({
            newKey: versions.length ? versionKey(versions[0]) : null,
            oldKey: versions.length > 1 ? versionKey(versions[versions.length - 1]) : null,
          });
        }
        // The working copy may have changed on disk even though the choice did not.
        if (newKey === "workdir" || oldKey === "workdir" || !sameChoice) await recompare();
      } catch {
        /* the next explicit action will show the error */
      }
    },

    setChangesOnly: (value) => set({ changesOnly: value }),
    setReading: (value) => set({ reading: value }),
    readDocument: async (file) => {
      if (get().file !== file || get().loose) await get().chooseFile(file);
      set({ reading: true });
      showPanel("redline");
    },
    readVersion: (key) => {
      get().setNewKey(key);
      set({ reading: true });
      showPanel("redline");
    },
    selectChange: (change) => set({ selectedChange: change }),
    jumpToChange: (change) =>
      set((s) => ({ selectedChange: change, scrollRequest: { change, nonce: (s.scrollRequest?.nonce ?? 0) + 1 } })),

    compareWorkingCopy: async (file) => {
      const repo = get().repo;
      if (!repo) return;
      const versions = await api.listVersions(repo.root, file);
      const lastCommit = versions.find((v) => v.kind === "commit");
      set({ file, loose: null, versions });
      // A file with no commit yet has nothing to compare against: show it as all new.
      await get().compareVersions(file, lastCommit ? lastCommit.id : null, "workdir");
    },

    compareConflictSides: async (path) => {
      const repo = get().repo;
      if (!repo) return;
      set({
        file: path, oldKey: null, newKey: null, error: null, reading: false,
        loose: {
          old: { kind: "stage", repo: repo.root, rev: "ours", path },
          new: { kind: "stage", repo: repo.root, rev: "theirs", path },
        },
      });
      showPanel("redline");
      await recompare();
    },

    cloneRepository: async () => {
      const ui = useUi.getState();
      const values = await ui.prompt({
        title: "Clone a repository",
        message: "Download a project from GitHub, GitLab or any Git server.",
        fields: [{ name: "url", label: "Repository address", placeholder: "https://github.com/you/paper.git", required: true }],
        confirmLabel: "Choose folder…",
      });
      if (!values) return;
      const parent = await open({ directory: true, multiple: false, title: "Where should the project be saved?" });
      if (typeof parent !== "string") return;
      const name = values.url.trim().replace(/\/+$/, "").split(/[/:]/).pop()?.replace(/\.git$/, "") || "project";
      const destination = `${parent.replace(/[\\/]+$/, "")}/${name}`;
      ui.toast("info", `Cloning ${name}…`);
      try {
        await api.gitClone(values.url, destination);
        await get().openPath(destination);
        ui.toast("success", `Cloned ${name}`);
      } catch (e) {
        ui.toast("error", errorMessage(e));
      }
    },
  };
});
