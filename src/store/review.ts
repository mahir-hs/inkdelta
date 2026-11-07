// Review progress for the reviewer's comments (see features/review/reviewState.ts).
//
// Nothing is written to disk until the user changes something, so merely
// opening a project never adds files to it.

import { create } from "zustand";
import { api } from "../api/commands";
import { emptyItem, emptyReviewState, parseReviewState, type ItemState, type ReviewState } from "../features/review/reviewState";

const LOCAL_KEY = "inkdelta.review.no-project";
const SAVE_DELAY_MS = 400;

interface ReviewStore {
  state: ReviewState;
  loaded: boolean;
  /** The reviewer's comments as read by the Review panel (the AI panel lists them too). */
  comments: { id: string; text: string }[];
  setComments: (comments: { id: string; text: string }[]) => void;
  /** Load the saved progress for a project (null = loose files, kept in the browser). */
  load: (repoRoot: string | null) => Promise<void>;
  setReviewerFile: (path: string | null) => void;
  updateItem: (id: string, patch: Partial<ItemState>) => void;
}

let currentRoot: string | null = null;
let userEdited = false;
let saveTimer: number | undefined;

function scheduleSave(state: ReviewState) {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    const json = JSON.stringify(state, null, 2);
    if (currentRoot) void api.saveReviewState(currentRoot, json).catch(() => undefined);
    else {
      try { localStorage.setItem(LOCAL_KEY, json); } catch { /* ignore */ }
    }
  }, SAVE_DELAY_MS);
}

export const useReview = create<ReviewStore>((set, get) => ({
  state: emptyReviewState(),
  loaded: false,
  comments: [],
  setComments: (comments) => set({ comments }),

  load: async (repoRoot) => {
    currentRoot = repoRoot;
    userEdited = false;
    window.clearTimeout(saveTimer);
    set({ loaded: false });
    try {
      const json = repoRoot ? await api.loadReviewState(repoRoot) : localStorage.getItem(LOCAL_KEY);
      if (currentRoot === repoRoot) set({ state: parseReviewState(json), loaded: true });
    } catch {
      if (currentRoot === repoRoot) set({ state: emptyReviewState(), loaded: true });
    }
  },

  setReviewerFile: (path) => {
    userEdited = true;
    const state = { ...get().state, reviewerFile: path };
    set({ state });
    scheduleSave(state);
  },

  updateItem: (id, patch) => {
    userEdited = true;
    const current = get().state;
    const state = { ...current, items: { ...current.items, [id]: { ...(current.items[id] ?? emptyItem()), ...patch } } };
    set({ state });
    if (userEdited) scheduleSave(state);
  },
}));
