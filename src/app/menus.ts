// The menu bar's menus. Each item runs a command from commands.ts, so there is one place that knows what an action does.

import { useAi } from "../store/ai";
import { useUi, type MenuItem } from "../store/ui";
import { getCommands } from "./commands";
import { PANEL_TITLES, resetLayout, togglePanel, useLayout, type PanelId } from "./layout";

/** Items for the listed command ids; "-" starts a new group. Commands that are not available right now are left out. */
function fromCommands(ids: string[]): MenuItem[] {
  const commands = new Map(getCommands().map((c) => [c.id, c]));
  const items: MenuItem[] = [];
  let separate = false;
  for (const id of ids) {
    if (id === "-") {
      separate = items.length > 0;
      continue;
    }
    const command = commands.get(id);
    if (!command) continue;
    items.push({ label: command.title, separator: separate, onSelect: () => void command.run() });
    separate = false;
  }
  return items;
}

export const fileMenu = () => fromCommands(["open", "clone", "compare", "-", "export", "print"]);

export const gitMenu = () =>
  fromCommands(["fetch", "pull", "push", "-", "branch", "stash", "tag", "stage-all", "-", "resolve", "abort-merge", "-", "remote", "identity"]);

export function viewMenu(): MenuItem[] {
  const visible = useLayout.getState().visibleIds;
  const panels: MenuItem[] = (Object.keys(PANEL_TITLES) as PanelId[])
    .filter((id) => id !== "redline" && id !== "textDiff")
    .map((id, i) => ({ label: `${visible.includes(id) ? "✓  " : "     "}${PANEL_TITLES[id]}`, separator: i === 0, onSelect: () => togglePanel(id) }));
  return [
    ...fromCommands(["only", "original", "previous"]),
    ...panels,
    { label: "Customize layout…", separator: true, onSelect: () => useLayout.getState().setCustomizeOpen(true) },
    { label: "Reset layout", onSelect: () => resetLayout() },
    ...fromCommands(["-", "zoom-in", "zoom-out", "zoom-reset", "-", "appearance"]),
  ];
}

export function aiMenu(): MenuItem[] {
  const ai = useAi.getState();
  return [
    { label: "Ask AI (chat)", onSelect: () => (ai.isConfigured() ? togglePanel("ask") : ai.openSettings(true)) },
    { label: ai.isConfigured() ? "Open the AI assistant" : "Set up the AI assistant…", onSelect: () => (ai.isConfigured() ? togglePanel("ai") : ai.openSettings(true)) },
    { label: "Suggest edits for the next open review comment", disabled: !ai.isConfigured(), onSelect: () => useAi.getState().startNext() },
    { label: "AI service and keys…", separator: true, onSelect: () => ai.openSettings(true) },
  ];
}

export function openMenuFor(element: Element, items: MenuItem[]) {
  useUi.getState().openMenuBelow(element, items);
}
