// Text edits made directly in the reading view, waiting to be saved into the .docx.
//
// Only the changed paragraphs are kept: position (to find it again), the text the user saw (the
// backend refuses the edit if the file no longer matches), and the new text.

import { create } from "zustand";
import { api, errorMessage } from "../api/commands";
import { useGit } from "./git";
import { useUi } from "./ui";
import { useWorkspace } from "./workspace";

export interface PendingEdit {
  oldText: string;
  newText: string;
}

interface DocEditsState {
  /** paragraph position -> edit */
  edits: Map<number, PendingEdit>;
  set: (position: number, oldText: string, newText: string) => void;
  discard: () => void;
  /** Write the edits into the working copy of the document. */
  save: () => Promise<boolean>;
  /** Save, then commit this file, and optionally push. */
  saveAndCommit: () => Promise<void>;
}

export const useDocEdits = create<DocEditsState>((set, get) => ({
  edits: new Map(),

  set: (position, oldText, newText) => {
    const clean = newText.replace(/\r?\n/g, " ");
    const edits = new Map(get().edits);
    if (clean === oldText) edits.delete(position);
    else edits.set(position, { oldText, newText: clean });
    set({ edits });
  },

  discard: () => set({ edits: new Map() }),

  save: async () => {
    const { repo, file } = useWorkspace.getState();
    const { edits } = get();
    if (!repo || !file || edits.size === 0) return false;
    const list = [...edits].map(([position, e]) => ({ position, oldText: e.oldText, newText: e.newText }));
    try {
      await api.saveDocumentEdits(repo.root, file, list);
      set({ edits: new Map() });
      useUi.getState().toast("success", `Saved ${list.length} edited paragraph${list.length === 1 ? "" : "s"}`);
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
    if (!file || get().edits.size === 0) return;
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
