// The dock layout: which panels exist, where they start, and how the arrangement is remembered.
//
// Dockview does the dragging, splitting, tabbing and floating. We only decide the
// starting arrangement and save/restore whatever the user made of it.

import type { DockviewApi, DockviewTheme } from "dockview-react";
import { create } from "zustand";

export type PanelId = "redline" | "documents" | "sourceControl" | "reviewer" | "changes" | "wordComments" | "graph" | "output" | "textDiff" | "ai" | "ask" | "terminal";

export const PANEL_TITLES: Record<PanelId, string> = {
  redline: "Redline",
  documents: "Documents",
  sourceControl: "Source control",
  reviewer: "Review",
  changes: "Changes",
  wordComments: "Word comments",
  graph: "History",
  output: "Output",
  textDiff: "Diff",
  ai: "AI assistant",
  ask: "Ask AI",
  terminal: "Terminal",
};

const LAYOUT_KEY = "inkdelta.layout.v4";

/** Panels float as separate rounded cards with a gap between them; the look is in styles/dock.css. */
export const DOCK_THEME: DockviewTheme = {
  name: "inkdelta",
  className: "dockview-theme-inkdelta",
  gap: 10,
  dndOverlayMounting: "absolute",
  dndPanelOverlay: "group",
  dndTabIndicator: "line",
  tabAnimation: "smooth",
};

/** Where each panel opens. The user chooses these in "Customize layout". */
export type Side = "left" | "right" | "bottom" | "off";
export const DEFAULT_SIDES: Record<PanelId, Side> = {
  redline: "off", textDiff: "off", documents: "left", sourceControl: "left",
  reviewer: "right", changes: "right", wordComments: "right", ai: "right", ask: "right", terminal: "bottom", graph: "bottom", output: "bottom",
};
const SIDES_KEY = "inkdelta.sides";

function readSides(): Record<PanelId, Side> {
  try {
    return { ...DEFAULT_SIDES, ...JSON.parse(localStorage.getItem(SIDES_KEY) ?? "{}") };
  } catch {
    return DEFAULT_SIDES;
  }
}

/** The dock API and which panel the user is looking at, shared with the activity bar and palette. */
interface LayoutStore {
  api: DockviewApi | null;
  activeId: string | null;
  /** Panels currently showing (the front tab of each group). */
  visibleIds: string[];
  sides: Record<PanelId, Side>;
  customizeOpen: boolean;
  setCustomizeOpen: (open: boolean) => void;
  setApi: (api: DockviewApi) => void;
  setActive: (id: string | null) => void;
  refreshVisible: () => void;
}

export const useLayout = create<LayoutStore>((set) => ({
  api: null,
  activeId: null,
  visibleIds: [],
  sides: readSides(),
  customizeOpen: false,
  setCustomizeOpen: (customizeOpen) => set({ customizeOpen }),
  setApi: (api) => set({ api }),
  refreshVisible: () =>
    set((s) => ({ visibleIds: s.api ? s.api.groups.map((g) => g.activePanel?.id).filter((id): id is string => !!id) : [] })),
  setActive: (activeId) => set({ activeId }),
}));

function add(api: DockviewApi, id: PanelId, options: Record<string, unknown> = {}) {
  return api.addPanel({ id, component: id, title: PANEL_TITLES[id], ...options } as never);
}

/** Focus layout: just the page. Documents, Git, review and history open from the activity bar. */
export function buildDefaultLayout(api: DockviewApi) {
  api.clear();
  add(api, "redline");
  add(api, "textDiff", { position: { referencePanel: "redline", direction: "within" } });
  api.getPanel("redline")?.api.setActive();
}

export function saveLayout(api: DockviewApi) {
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(api.toJSON()));
  } catch { /* storage unavailable: the layout simply is not remembered */ }
}

/** Restore the saved arrangement. Returns false when there is none, or it no longer fits. */
export function restoreLayout(api: DockviewApi): boolean {
  try {
    const saved = localStorage.getItem(LAYOUT_KEY);
    if (!saved) return false;
    api.fromJSON(JSON.parse(saved));
    return true;
  } catch {
    return false;
  }
}

export function resetLayout() {
  const api = useLayout.getState().api;
  if (!api) return;
  try { localStorage.removeItem(LAYOUT_KEY); } catch { /* ignore */ }
  buildDefaultLayout(api);
}

/** Like VS Code's side bar icons: open the panel, or close it when it is already showing. */
export function togglePanel(id: PanelId) {
  const { api, visibleIds } = useLayout.getState();
  const panel = api?.getPanel(id);
  if (api && panel && visibleIds.includes(id)) api.removePanel(panel);
  else showPanel(id);
}

/** Bring a panel to the front, opening it on the side the user chose if it is closed. */
export function showPanel(id: PanelId) {
  const { api, sides } = useLayout.getState();
  if (!api) return;
  const existing = api.getPanel(id);
  if (existing) {
    existing.api.setActive();
    return;
  }
  if (id === "redline") return void add(api, id);
  if (id === "textDiff") return void add(api, id, { position: { referencePanel: "redline", direction: "within" } });

  const sideOf = (panel: PanelId): Exclude<Side, "off"> => (sides[panel] === "off" ? (DEFAULT_SIDES[panel] as Exclude<Side, "off">) : (sides[panel] as Exclude<Side, "off">));
  const side = sideOf(id);
  const sibling = (Object.keys(PANEL_TITLES) as PanelId[]).find((other) => other !== id && other !== "redline" && other !== "textDiff" && sideOf(other) === side && api.getPanel(other));
  let position: Record<string, unknown>;
  if (sibling) position = { referencePanel: sibling, direction: "within" };
  else if (side === "bottom") position = { direction: "below" };
  else position = api.getPanel("redline") ? { referencePanel: "redline", direction: side } : { direction: side };
  // The terminal opens taller: full-screen tools like Claude Code need room.
  const size = side === "bottom" ? { initialHeight: id === "terminal" ? 400 : 250 } : { initialWidth: side === "left" ? 290 : 360 };
  add(api, id, { position, ...size });
  api.getPanel(id)?.api.setActive();
}

/** Move a panel to another side (or hide it). Takes effect immediately and is remembered. */
export function setPanelSide(id: PanelId, side: Side) {
  const { api, sides } = useLayout.getState();
  const next = { ...sides, [id]: side };
  try { localStorage.setItem(SIDES_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  useLayout.setState({ sides: next });
  if (!api) return;
  const panel = api.getPanel(id);
  if (panel) api.removePanel(panel);
  if (side !== "off") showPanel(id);
}
