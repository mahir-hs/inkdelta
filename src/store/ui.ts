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

// ------------------------------------------------------------ appearance
// Theme (surfaces and text), accent colour, and how the document is set. Colours live in styles/themes.css.

export type ThemeId = "graphite" | "midnight" | "nord" | "forest" | "dusk" | "paper" | "sepia" | "mist";
export type ThemeChoice = ThemeId | "system";
export type DocFont = "serif" | "sans" | "classic";
export type DocSize = "s" | "m" | "l" | "xl";

export interface ThemeInfo {
  id: ThemeId;
  label: string;
  mode: "dark" | "light";
  /** Window, panel and accent-free text colour, for the preview card. */
  swatch: [string, string, string];
}

export const THEMES: ThemeInfo[] = [
  { id: "graphite", label: "Graphite", mode: "dark", swatch: ["#0a0b0e", "#121318", "#ededf0"] },
  { id: "midnight", label: "Midnight", mode: "dark", swatch: ["#070914", "#0d1020", "#e8ecff"] },
  { id: "nord", label: "Nord", mode: "dark", swatch: ["#232831", "#2b303b", "#e5e9f0"] },
  { id: "forest", label: "Forest", mode: "dark", swatch: ["#0b100d", "#121915", "#e6efe8"] },
  { id: "dusk", label: "Dusk", mode: "dark", swatch: ["#0f0b14", "#171120", "#efe9f5"] },
  { id: "paper", label: "Paper", mode: "light", swatch: ["#e7e9ef", "#fbfbfd", "#16181f"] },
  { id: "sepia", label: "Sepia", mode: "light", swatch: ["#e9dfcf", "#f6efe2", "#3b2f22"] },
  { id: "mist", label: "Mist", mode: "light", swatch: ["#dfe6ee", "#f3f6fa", "#14202e"] },
];

export const ACCENTS = [
  { id: "default", label: "Indigo", color: "#5b69f0" },
  { id: "blue", label: "Blue", color: "#2d7ff0" },
  { id: "teal", label: "Teal", color: "#0e9f8e" },
  { id: "green", label: "Green", color: "#2f9e5f" },
  { id: "orange", label: "Orange", color: "#e0622c" },
  { id: "rose", label: "Rose", color: "#e0457b" },
  { id: "violet", label: "Violet", color: "#8b5cf6" },
  { id: "crimson", label: "Crimson", color: "#d6403f" },
] as const;

export interface Appearance {
  theme: ThemeChoice;
  accent: string;
  docFont: DocFont;
  docSize: DocSize;
}

const APPEARANCE_KEY = "inkdelta.appearance";
const DEFAULT_APPEARANCE: Appearance = { theme: "system", accent: "default", docFont: "serif", docSize: "m" };

function readAppearance(): Appearance {
  try {
    const saved = JSON.parse(localStorage.getItem(APPEARANCE_KEY) ?? "null");
    if (saved && typeof saved === "object") return { ...DEFAULT_APPEARANCE, ...saved };
    // The earlier version stored just "dark" or "light".
    const old = localStorage.getItem("inkdelta.theme");
    if (old === "dark") return { ...DEFAULT_APPEARANCE, theme: "graphite" };
    if (old === "light") return { ...DEFAULT_APPEARANCE, theme: "paper" };
  } catch { /* storage unavailable: use the defaults */ }
  return DEFAULT_APPEARANCE;
}

/** Write the choices onto <html>, where the CSS picks them up. "system" follows the operating system. */
function applyAppearance(appearance: Appearance) {
  const root = document.documentElement;
  const prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
  const id: ThemeId = appearance.theme === "system" ? (prefersLight ? "paper" : "graphite") : appearance.theme;
  const info = THEMES.find((t) => t.id === id) ?? THEMES[0];
  root.setAttribute("data-theme", info.id);
  root.setAttribute("data-mode", info.mode);
  root.setAttribute("data-accent", appearance.accent);
  root.setAttribute("data-doc-font", appearance.docFont);
  root.setAttribute("data-doc-size", appearance.docSize);
}

// ------------------------------------------------------------ store

interface UiState {
  toasts: Toast[];
  dialog: DialogRequest | null;
  appearance: Appearance;
  appearanceOpen: boolean;
  paletteOpen: boolean;
  menu: MenuRequest | null;

  toast: (kind: ToastKind, text: string) => void;
  dismissToast: (id: number) => void;
  confirm: (opts: { title: string; message: string; confirmLabel?: string; danger?: boolean }) => Promise<boolean>;
  prompt: (opts: { title: string; message?: string; fields: PromptField[]; confirmLabel?: string }) => Promise<Record<string, string> | null>;
  closeDialog: () => void;
  setAppearance: (patch: Partial<Appearance>) => void;
  setAppearanceOpen: (open: boolean) => void;
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
  appearance: readAppearance(),
  appearanceOpen: false,
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

  setAppearance: (patch) => {
    const appearance = { ...get().appearance, ...patch };
    try { localStorage.setItem(APPEARANCE_KEY, JSON.stringify(appearance)); } catch { /* ignore */ }
    applyAppearance(appearance);
    set({ appearance });
  },
  setAppearanceOpen: (open) => set({ appearanceOpen: open }),
  setPaletteOpen: (open) => set({ paletteOpen: open }),
  openMenu: (x, y, items) => set({ menu: { x, y, items } }),
  openMenuBelow: (element, items) => {
    const box = element.getBoundingClientRect();
    set({ menu: { x: box.left, y: box.bottom + 4, items } });
  },
  closeMenu: () => set({ menu: null }),
}));

applyAppearance(useUi.getState().appearance);
window.matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => {
  if (useUi.getState().appearance.theme === "system") applyAppearance(useUi.getState().appearance);
});
