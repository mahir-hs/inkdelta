// The text diff being viewed, and which of its lines are picked.
//
// A file can have changes on two sides: not yet staged, and already staged. `target`
// says which side is shown. The selection is only kept while the diff stays the same.

import { create } from "zustand";
import { api, errorMessage } from "../api/commands";
import type { FileDiff, LineRef } from "../api/gitTypes";
import { useWorkspace } from "./workspace";

export const lineKey = (hunk: number, line: number) => `${hunk}:${line}`;

interface TextDiffState {
  target: { path: string; staged: boolean } | null;
  diff: FileDiff | null;
  selected: Set<string>;
  /** The line last clicked, for shift+click range selection. */
  anchor: string | null;
  loading: boolean;
  error: string | null;

  open: (path: string, staged: boolean) => Promise<void>;
  switchSide: (staged: boolean) => Promise<void>;
  close: () => void;
  reload: () => Promise<void>;
  toggle: (hunk: number, line: number, range: boolean) => void;
  setHunk: (hunk: number, on: boolean) => void;
  setAll: (on: boolean) => void;
  /** The picked lines as the backend wants them. */
  picks: () => LineRef[];
}

/** Every line of the diff that can be picked, in reading order. */
function changeable(diff: FileDiff): string[] {
  const out: string[] = [];
  diff.hunks.forEach((hunk, h) => hunk.lines.forEach((line, l) => line.kind !== "context" && out.push(lineKey(h, l))));
  return out;
}

export const useTextDiff = create<TextDiffState>((set, get) => ({
  target: null,
  diff: null,
  selected: new Set(),
  anchor: null,
  loading: false,
  error: null,

  open: async (path, staged) => {
    set({ target: { path, staged }, diff: null, selected: new Set(), anchor: null, error: null });
    await get().reload();
  },

  switchSide: async (staged) => {
    const target = get().target;
    if (!target || target.staged === staged) return;
    set({ target: { ...target, staged }, selected: new Set(), anchor: null });
    await get().reload();
  },

  close: () => set({ target: null, diff: null, selected: new Set(), anchor: null, error: null }),

  reload: async () => {
    const { target } = get();
    const root = useWorkspace.getState().repo?.root;
    if (!target || !root) return;
    set({ loading: true });
    try {
      let side = target.staged;
      let diff = await api.fileDiff(root, target.path, side);
      // Everything on this side was just staged or unstaged: show the side that still has changes.
      if (diff.hunks.length === 0 && !diff.binary) {
        const other = await api.fileDiff(root, target.path, !side);
        if (other.hunks.length > 0 || other.binary) {
          side = !side;
          diff = other;
        }
      }
      const previous = get().diff;
      const sameDiff = previous?.fingerprint === diff.fingerprint && get().target?.staged === side;
      set({
        target: { path: target.path, staged: side },
        diff,
        loading: false,
        error: null,
        selected: sameDiff ? get().selected : new Set(),
        anchor: sameDiff ? get().anchor : null,
      });
    } catch (e) {
      set({ loading: false, error: errorMessage(e) });
    }
  },

  toggle: (hunk, line, range) => {
    const { diff, selected, anchor } = get();
    if (!diff) return;
    const clicked = lineKey(hunk, line);
    const next = new Set(selected);
    if (range && anchor) {
      const order = changeable(diff);
      const a = order.indexOf(anchor);
      const b = order.indexOf(clicked);
      if (a >= 0 && b >= 0) {
        const turnOn = !selected.has(clicked);
        for (const k of order.slice(Math.min(a, b), Math.max(a, b) + 1)) {
          if (turnOn) next.add(k);
          else next.delete(k);
        }
        set({ selected: next, anchor: clicked });
        return;
      }
    }
    if (next.has(clicked)) next.delete(clicked);
    else next.add(clicked);
    set({ selected: next, anchor: clicked });
  },

  setHunk: (hunk, on) => {
    const { diff, selected } = get();
    if (!diff) return;
    const next = new Set(selected);
    diff.hunks[hunk]?.lines.forEach((line, l) => {
      if (line.kind === "context") return;
      if (on) next.add(lineKey(hunk, l));
      else next.delete(lineKey(hunk, l));
    });
    set({ selected: next });
  },

  setAll: (on) => {
    const diff = get().diff;
    set({ selected: on && diff ? new Set(changeable(diff)) : new Set(), anchor: null });
  },

  picks: () =>
    [...get().selected].map((k) => {
      const [hunk, line] = k.split(":").map(Number);
      return { hunk, line };
    }),
}));
