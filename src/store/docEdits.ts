// Text edits made directly in the reading view, waiting to be saved into the .docx.
//
// Three kinds of change wait here: reworded paragraphs (position, the text the user saw so the backend
// can refuse a stale edit, and the new text), new paragraphs placed after an existing one, and deleted paragraphs.

import { create } from "zustand";
import { api, errorMessage } from "../api/commands";
import { useGit } from "./git";
import { useUi } from "./ui";
import { useWorkspace } from "./workspace";

export interface PendingEdit {
  oldText: string;
  newText: string;
}

export interface PendingInsert {
  id: number;
  /** Position of the paragraph it goes after. */
  after: number;
  /** Position of a paragraph whose look it copies (default: the one it goes after). */
  like?: number;
  text: string;
}

let nextInsertId = 1;

/** How many separate changes are waiting. */
export const pendingCount = (s: { edits: Map<number, PendingEdit>; inserts: PendingInsert[]; deletes: Map<number, string> }) =>
  s.edits.size + s.inserts.length + s.deletes.size;

interface DocEditsState {
  /** paragraph position -> edit */
  edits: Map<number, PendingEdit>;
  inserts: PendingInsert[];
  /** paragraph position -> the text it had when the user saw it */
  deletes: Map<number, string>;
  set: (position: number, oldText: string, newText: string) => void;
  addInsert: (after: number, text: string, like?: number) => void;
  removeInsert: (id: number) => void;
  markDelete: (position: number, oldText: string) => void;
  unmarkDelete: (position: number) => void;
  discard: () => void;
  /** Write the edits into the working copy of the document. */
  save: () => Promise<boolean>;
  /** Save, then commit this file, and optionally push. */
  saveAndCommit: () => Promise<void>;
}

export const useDocEdits = create<DocEditsState>((set, get) => ({
  edits: new Map(),
  inserts: [],
  deletes: new Map(),

  set: (position, oldText, newText) => {
    const clean = newText.replace(/\r?\n/g, " ");
    const edits = new Map(get().edits);
    if (clean === oldText) edits.delete(position);
    else edits.set(position, { oldText, newText: clean });
    set({ edits });
  },

  addInsert: (after, text, like) => set({ inserts: [...get().inserts, { id: nextInsertId++, after, like, text: text.replace(/\r?\n/g, " ").trim() }] }),
  removeInsert: (id) => set({ inserts: get().inserts.filter((i) => i.id !== id) }),
  markDelete: (position, oldText) => {
    const deletes = new Map(get().deletes);
    deletes.set(position, oldText);
    const edits = new Map(get().edits);
    edits.delete(position); // a deleted paragraph needs no edit
    set({ deletes, edits });
  },
  unmarkDelete: (position) => {
    const deletes = new Map(get().deletes);
    deletes.delete(position);
    set({ deletes });
  },

  discard: () => set({ edits: new Map(), inserts: [], deletes: new Map() }),

  save: async () => {
    const { repo, file } = useWorkspace.getState();
    const { edits, inserts, deletes } = get();
    const count = pendingCount(get());
    if (!repo || !file || count === 0) return false;
    const changes = {
      edits: [...edits].map(([position, e]) => ({ position, oldText: e.oldText, newText: e.newText })),
      inserts: inserts.map((i) => ({ after: i.after, like: i.like ?? null, text: i.text })),
      deletes: [...deletes].map(([position, oldText]) => ({ position, oldText })),
    };
    try {
      await api.saveDocumentEdits(repo.root, file, changes);
      set({ edits: new Map(), inserts: [], deletes: new Map() });
      useUi.getState().toast("success", `Saved ${count} change${count === 1 ? "" : "s"} to the document`);
      await useGit.getState().refresh();
      await useWorkspace.getState().refreshVersions(); // the page reloads from the saved file
      return true;
    } catch (e) {
      useUi.getState().toast("error", errorMessage(e)); // the edits stay, so nothing is lost
      return false;
    }
  },

  saveAndCommit: async () => {
    const { file } = useWorkspace.getState();
    if (!file || pendingCount(get()) === 0) return;
    const git = useGit.getState();
    const canPush = !!git.tool?.available && !!git.status?.upstream;
    const values = await useUi.getState().prompt({
      title: "Save and commit",
      message: "Your edits are written into the Word file, then committed.",
      fields: [
        { name: "message", label: "Commit message", initial: `Edit ${file.split("/").pop()}`, required: true },
        ...(canPush ? [{ name: "push", label: "Push to the server afterwards", kind: "checkbox" as const, initial: "true" }] : []),
      ],
      confirmLabel: "Save and commit",
    });
    if (!values) return;
    if (!(await get().save())) return;
    await useGit.getState().stage([file]);
    if (!(await useGit.getState().commit(values.message, false))) return;
    if (canPush && values.push === "true") await useGit.getState().push();
  },
}));
