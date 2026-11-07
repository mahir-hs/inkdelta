// Which conflicted file the resolver dialog is open on (null = closed).

import { create } from "zustand";

interface ConflictStore {
  path: string | null;
  open: (path: string) => void;
  close: () => void;
}

export const useConflicts = create<ConflictStore>((set) => ({
  path: null,
  open: (path) => set({ path }),
  close: () => set({ path: null }),
}));
