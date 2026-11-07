// The current branch as a button. Click to switch branches or create one.

import { GitBranch } from "lucide-react";
import { useGit } from "../../store/git";
import { useUi, type MenuItem } from "../../store/ui";
import { newBranchPrompt } from "./prompts";

export function branchMenuItems(): MenuItem[] {
  const { branches, status } = useGit.getState();
  const items: MenuItem[] = [{ label: "Create new branch…", onSelect: () => void newBranchPrompt() }];
  const local = branches.filter((b) => !b.isRemote);
  const remote = branches.filter((b) => b.isRemote && !local.some((l) => `origin/${l.name}` === b.name));

  local.forEach((b, i) =>
    items.push({
      label: `${b.isCurrent ? "✓ " : "   "}${b.name}`,
      separator: i === 0,
      disabled: b.isCurrent,
      onSelect: () => void useGit.getState().checkout(b.name),
    }),
  );
  remote.forEach((b, i) =>
    items.push({ label: `   ${b.name}`, hint: "remote", separator: i === 0, onSelect: () => void useGit.getState().checkout(b.name) }),
  );
  if (!status?.hasCommits) items.length = 1; // no branches to list before the first commit
  return items;
}

export function BranchChip({ compact = false }: { compact?: boolean }) {
  const status = useGit((s) => s.status);
  const openMenuBelow = useUi((s) => s.openMenuBelow);
  if (!status) return null;

  return (
    <button
      className={compact ? "branch-chip compact" : "branch-chip"}
      title={status.detached ? "You are not on a branch (detached)" : "Switch or create a branch"}
      onClick={(e) => openMenuBelow(e.currentTarget, branchMenuItems())}
    >
      <GitBranch size={compact ? 13 : 15} />
      <span>{status.detached ? `detached at ${status.branch}` : status.branch}</span>
    </button>
  );
}
