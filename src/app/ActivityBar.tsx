// The narrow icon strip on the far left. Click an icon to bring that panel forward
// (it re-opens the panel if you closed it).

import { FileText, GitBranch, History, ListChecks, MessageSquare, ScrollText, Settings2, Rows3 } from "lucide-react";
import type { ComponentType } from "react";
import { useGit } from "../store/git";
import { useUi } from "../store/ui";
import { resetLayout, togglePanel, useLayout, type PanelId } from "./layout";

interface Item {
  id: PanelId;
  label: string;
  Icon: ComponentType<{ size?: number }>;
}

const TOP: Item[] = [
  { id: "documents", label: "Documents", Icon: FileText },
  { id: "sourceControl", label: "Source control", Icon: GitBranch },
  { id: "graph", label: "History", Icon: History },
  { id: "reviewer", label: "Reviewer comments", Icon: ListChecks },
  { id: "changes", label: "Changes", Icon: Rows3 },
  { id: "wordComments", label: "Word comments", Icon: MessageSquare },
  { id: "output", label: "Output", Icon: ScrollText },
];

export function ActivityBar() {
  const visibleIds = useLayout((s) => s.visibleIds);
  const changedFiles = useGit((s) => s.status?.files.length ?? 0);
  const theme = useUi((s) => s.theme);
  const openMenuBelow = useUi((s) => s.openMenuBelow);
  const setTheme = useUi((s) => s.setTheme);

  return (
    <nav className="activity-bar" aria-label="Panels">
      {TOP.map(({ id, label, Icon }) => (
        <button
          key={id}
          className={`activity-item${visibleIds.includes(id) ? " active" : ""}`}
          title={`${label}${visibleIds.includes(id) ? " (click to close)" : ""}`}
          aria-pressed={visibleIds.includes(id)}
          aria-label={label}
          onClick={() => togglePanel(id)}
        >
          <Icon size={20} />
          {id === "sourceControl" && changedFiles > 0 && <span className="badge-dot">{changedFiles > 99 ? "99+" : changedFiles}</span>}
        </button>
      ))}
      <span className="spacer" />
      <button
        className="activity-item"
        title="Appearance and layout"
        aria-label="Appearance and layout"
        onClick={(e) =>
          openMenuBelow(e.currentTarget, [
            { label: `${theme === "system" ? "✓ " : "   "}Match system theme`, onSelect: () => setTheme("system") },
            { label: `${theme === "dark" ? "✓ " : "   "}Dark`, onSelect: () => setTheme("dark") },
            { label: `${theme === "light" ? "✓ " : "   "}Light`, onSelect: () => setTheme("light") },
            { label: "Reset panel layout", separator: true, onSelect: () => resetLayout() },
          ])
        }
      >
        <Settings2 size={20} />
      </button>
    </nav>
  );
}
