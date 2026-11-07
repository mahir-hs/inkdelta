// App-wide UI state: toasts, confirm/prompt dialogs, theme, command palette.

import { create } from "zustand";

// ------------------------------------------------------------ toasts

export type ToastKind = "info" | "success" | "error";
export interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
}

// ------------------------------------------------------------ dialogs

export interface PromptField {
  name: string;
  label: string;
  placeholder?: string;
  initial?: string;
  /** "text" (default), "multiline" or "checkbox" (initial "true" = checked). */
  kind?: "text" | "multiline" | "checkbox";
  required?: boolean;
}

export type DialogRequest =
  | { type: "confirm"; title: string; message: string; confirmLabel: string; danger: boolean; resolve: (ok: boolean) => void }
  | { type: "prompt"; title: string; message?: string; fields: PromptField[]; confirmLabel: string; resolve: (values: Record<string, string> | null) => void };

// ------------------------------------------------------------ menus

export interface MenuItem {
  label: string;
  hint?: string;
  danger?: boolean;
  disabled?: boolean;
  /** Draw a divider above this item. */
  separator?: boolean;
  onSelect: () => void;
}

export interface MenuRequest {
  x: number;
  y: number;
  items: MenuItem[];
}

// ------------------------------------------------------------ theme

export type ThemeChoice = "system" | "dark" | "light";
const THEME_KEY = "inkdelta.theme";

function readTheme(): ThemeChoice {
  try {
    const value = localStorage.getItem(THEME_KEY);
    if (value === "dark" || value === "light" || value === "system") return value;
  } catch { /* storage unavailable: use the default */ }
  return "system";
}

function applyTheme(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);
}

// ------------------------------------------------------------ store

interface UiState {
  toasts: Toast[];
  dialog: DialogRequest | null;
  theme: ThemeChoice;
  paletteOpen: boolean;
  menu: MenuRequest | null;

  toast: (kind: ToastKind, text: string) => void;
  dismissToast: (id: number) => void;
  confirm: (opts: { title: string; message: string; confirmLabel?: string; danger?: boolean }) => Promise<boolean>;
  prompt: (opts: { title: string; message?: string; fields: PromptField[]; confirmLabel?: string }) => Promise<Record<string, string> | null>;
  closeDialog: () => void;
  setTheme: (choice: ThemeChoice) => void;
  setPaletteOpen: (open: boolean) => void;
  openMenu: (x: number, y: number, items: MenuItem[]) => void;
  /** Open a menu just below a button. */
  openMenuBelow: (element: Element, items: MenuItem[]) => void;
  closeMenu: () => void;
}

let nextToastId = 1;

export const useUi = create<UiState>((set, get) => ({
  toasts: [],
  dialog: null,
  theme: readTheme(),
  paletteOpen: false,
  menu: null,

  toast: (kind, text) => {
    const id = nextToastId++;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, kind, text }] }));
    // Errors stay until dismissed: the user must be able to read and copy them.
    if (kind !== "error") window.setTimeout(() => get().dismissToast(id), 4000);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  confirm: ({ title, message, confirmLabel = "Confirm", danger = false }) =>
    new Promise<boolean>((resolve) => set({ dialog: { type: "confirm", title, message, confirmLabel, danger, resolve } })),

  prompt: ({ title, message, fields, confirmLabel = "OK" }) =>
    new Promise<Record<string, string> | null>((resolve) =>
      set({ dialog: { type: "prompt", title, message, fields, confirmLabel, resolve } }),
    ),

  closeDialog: () => set({ dialog: null }),

  setTheme: (choice) => {
    try { localStorage.setItem(THEME_KEY, choice); } catch { /* ignore */ }
    applyTheme(choice);
    set({ theme: choice });
  },
  setPaletteOpen: (open) => set({ paletteOpen: open }),
  openMenu: (x, y, items) => set({ menu: { x, y, items } }),
  openMenuBelow: (element, items) => {
    const box = element.getBoundingClientRect();
    set({ menu: { x: box.left, y: box.bottom + 4, items } });
  },
  closeMenu: () => set({ menu: null }),
}));

applyTheme(useUi.getState().theme);
