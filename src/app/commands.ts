// Every action the command palette (Ctrl+K) offers.
// Add a command here and it appears in the palette automatically.

import { exportRedline } from "../features/redline/exportRedline";
import { addRemotePrompt, createTagPrompt, identityPrompt, newBranchPrompt, stashPrompt } from "../features/sourcecontrol/prompts";
import { useConflicts } from "../store/conflicts";
import { useAi } from "../store/ai";
import { useGit } from "../store/git";
import { THEMES, useUi } from "../store/ui";
import { useUpdater } from "../store/updater";
import { useWorkspace } from "../store/workspace";
import { useZoom } from "../store/zoom";
import { PANEL_TITLES, resetLayout, showPanel, type PanelId } from "./layout";

export interface Command {
  id: string;
  title: string;
  /** Group name shown to the right, e.g. "Git". */
  group: string;
  /** Only offered when this returns true. */
  available?: () => boolean;
  run: () => void | Promise<void>;
}

export function getCommands(): Command[] {
  const ws = useWorkspace.getState();
  const git = useGit.getState();
  const ui = useUi.getState();
  const hasRepo = !!ws.repo;
  const hasDiff = !!ws.diff;
  const canSync = !!git.tool?.available && hasRepo;

  const commands: Command[] = [
    { id: "open", title: "Open project folder…", group: "File", run: () => ws.openFolder() },
    { id: "compare", title: "Compare two files…", group: "File", run: () => ws.compareTwoFiles() },
    { id: "clone", title: "Clone a repository…", group: "File", run: () => ws.cloneRepository() },
    { id: "export", title: "Export redline as HTML…", group: "File", available: () => hasDiff, run: () => exportRedline(ws.diff!, ws.file) },
    { id: "print", title: "Print or save redline as PDF", group: "File", available: () => hasDiff, run: () => window.print() },
    { id: "check-updates", title: "Check for updates…", group: "File", run: () => useUpdater.getState().checkNow() },

    { id: "next", title: "Next change", group: "Redline", available: () => hasDiff, run: () => stepChange(1) },
    { id: "prev", title: "Previous change", group: "Redline", available: () => hasDiff, run: () => stepChange(-1) },
    { id: "only", title: ws.changesOnly ? "Show all paragraphs" : "Show changed paragraphs only", group: "Redline", available: () => hasDiff, run: () => ws.setChangesOnly(!ws.changesOnly) },
    { id: "original", title: "Compare with the original version", group: "Redline", available: () => hasRepo, run: () => ws.compareWithOriginal() },
    { id: "previous", title: "Compare with the previous version", group: "Redline", available: () => hasRepo, run: () => ws.compareWithPrevious() },

    { id: "fetch", title: "Fetch from server", group: "Git", available: () => canSync, run: () => git.fetch() },
    { id: "pull", title: "Pull", group: "Git", available: () => canSync, run: () => git.pull("merge") },
    { id: "pull-rebase", title: "Pull (rebase)", group: "Git", available: () => canSync, run: () => git.pull("rebase") },
    { id: "push", title: "Push", group: "Git", available: () => canSync, run: () => git.push() },
    { id: "branch", title: "New branch…", group: "Git", available: () => hasRepo && !!git.status?.hasCommits, run: () => newBranchPrompt() },
    { id: "stash", title: "Stash changes…", group: "Git", available: () => hasRepo, run: () => stashPrompt() },
    { id: "tag", title: "Tag this version…", group: "Git", available: () => hasRepo && !!git.status?.hasCommits, run: () => createTagPrompt() },
    { id: "remote", title: "Connect to a server…", group: "Git", available: () => hasRepo, run: () => addRemotePrompt() },
    { id: "identity", title: "Set your name and email…", group: "Git", available: () => hasRepo, run: () => identityPrompt() },
    { id: "stage-all", title: "Stage all changes", group: "Git", available: () => hasRepo, run: () => git.stage([]) },
    {
      id: "resolve",
      title: "Resolve merge conflicts…",
      group: "Git",
      available: () => !!git.status?.files.some((f) => f.status === "conflicted"),
      run: () => useConflicts.getState().open(git.status!.files.find((f) => f.status === "conflicted")!.path),
    },
    { id: "abort-merge", title: "Abort the merge in progress", group: "Git", available: () => !!git.status?.merging, run: () => git.abortMerge() },
  ];

  // One "Switch to" command per local branch.
  git.branches
    .filter((b) => !b.isRemote && !b.isCurrent)
    .forEach((b) =>
      commands.push({ id: `switch-${b.name}`, title: `Switch to branch ${b.name}`, group: "Git", run: () => git.checkout(b.name) }),
    );

  (Object.keys(PANEL_TITLES) as PanelId[]).forEach((id) =>
    commands.push({ id: `show-${id}`, title: `Show ${PANEL_TITLES[id]}`, group: "View", run: () => showPanel(id) }),
  );
  commands.push(
    { id: "reset-layout", title: "Reset panel layout", group: "View", run: () => resetLayout() },
    { id: "ai-settings", title: "AI assistant: choose a service…", group: "View", run: () => useAi.getState().openSettings(true) },
    { id: "zoom-in", title: "Zoom in", group: "View", run: () => useZoom.getState().zoomIn() },
    { id: "zoom-out", title: "Zoom out", group: "View", run: () => useZoom.getState().zoomOut() },
    { id: "zoom-reset", title: "Reset zoom to 100%", group: "View", run: () => useZoom.getState().reset() },
    { id: "appearance", title: "Appearance: themes, colours and text…", group: "View", run: () => ui.setAppearanceOpen(true) },
    { id: "theme-system", title: "Theme: match the system", group: "View", run: () => ui.setAppearance({ theme: "system" }) },
    ...THEMES.map((t) => ({ id: `theme-${t.id}`, title: `Theme: ${t.label}`, group: "View", run: () => ui.setAppearance({ theme: t.id }) })),
  );

  return commands.filter((c) => !c.available || c.available());
}

/** Move to the next or previous change, wrapping at the ends is not wanted: it stops at the first/last. */
export function stepChange(direction: 1 | -1) {
  const { diff, selectedChange, jumpToChange } = useWorkspace.getState();
  const total = diff?.changeCount ?? 0;
  if (!total) return;
  const current = selectedChange ?? (direction === 1 ? 0 : total + 1);
  jumpToChange(Math.min(Math.max(current + direction, 1), total));
}
