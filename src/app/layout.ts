// The dock layout: which panels exist, where they start, and how the arrangement is remembered.
//
// Dockview does the dragging, splitting, tabbing and floating. We only decide the
// starting arrangement and save/restore whatever the user made of it.

import type { DockviewApi, DockviewTheme } from "dockview-react";
import { create } from "zustand";

export type PanelId = "redline" | "documents" | "sourceControl" | "reviewer" | "changes" | "wordComments" | "graph" | "output" | "textDiff";

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
};

const LAYOUT_KEY = "inkdelta.layout.v3";

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

/** The dock API and which panel the user is looking at, shared with the activity bar and palette. */
interface LayoutStore {
  api: DockviewApi | null;
  activeId: string | null;
  /** Panels currently showing (the front tab of each group). */
  visibleIds: string[];
  setApi: (api: DockviewApi) => void;
  setActive: (id: string | null) => void;
  refreshVisible: () => void;
}

export const useLayout = create<LayoutStore>((set) => ({
  api: null,
  activeId: null,
  visibleIds: [],
  setApi: (api) => set({ api }),
  refreshVisible: () =>
    set((s) => ({ visibleIds: s.api ? s.api.groups.map((g) => g.activePanel?.id).filter((id): id is string => !!id) : [] })),
  setActive: (activeId) => set({ activeId }),
}));

function add(api: DockviewApi, id: PanelId, options: Record<string, unknown> = {}) {
  return api.addPanel({ id, component: id, title: PANEL_TITLES[id], ...options } as never);
}

/** Documents + source control on the left, the redline in the middle, review on the right, history below. */
export function buildDefaultLayout(api: DockviewApi) {
  api.clear();
  add(api, "redline");
  add(api, "textDiff", { position: { referencePanel: "redline", direction: "within" } });
  add(api, "documents", { position: { referencePanel: "redline", direction: "left" }, initialWidth: 290 });
  add(api, "sourceControl", { position: { referencePanel: "documents", direction: "within" } });
  add(api, "reviewer", { position: { referencePanel: "redline", direction: "right" }, initialWidth: 360 });
  add(api, "changes", { position: { referencePanel: "reviewer", direction: "within" } });
  add(api, "wordComments", { position: { referencePanel: "reviewer", direction: "within" } });
  add(api, "graph", { position: { direction: "below" }, initialHeight: 250 });
  add(api, "output", { position: { referencePanel: "graph", direction: "within" } });

  // Each tab group shows its first panel.
  api.getPanel("documents")?.api.setActive();
  api.getPanel("reviewer")?.api.setActive();
  api.getPanel("graph")?.api.setActive();
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

/** Bring a panel to the front, re-opening it if the user had closed it. */
export function showPanel(id: PanelId) {
  const api = useLayout.getState().api;
  if (!api) return;
  const existing = api.getPanel(id);
  if (existing) {
    existing.api.setActive();
    return;
  }
  const near: Record<PanelId, { referencePanel?: string; direction: string }> = {
    redline: { direction: "right" },
    documents: { referencePanel: "redline", direction: "left" },
    sourceControl: { referencePanel: "redline", direction: "left" },
    reviewer: { referencePanel: "redline", direction: "right" },
    changes: { referencePanel: "redline", direction: "right" },
    wordComments: { referencePanel: "redline", direction: "right" },
    graph: { direction: "below" },
    output: { direction: "below" },
    textDiff: { referencePanel: "redline", direction: "within" },
  };
  const target = near[id];
  const position = target.referencePanel && api.getPanel(target.referencePanel)
    ? { referencePanel: target.referencePanel, direction: target.direction }
    : { direction: target.direction };
  add(api, id, { position });
  api.getPanel(id)?.api.setActive();
}
