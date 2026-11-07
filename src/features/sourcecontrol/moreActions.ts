// The "..." menu of the Source Control panel (and the command palette share these actions).

import { useGit } from "../../store/git";
import type { MenuItem } from "../../store/ui";
import { addRemotePrompt, createTagPrompt, identityPrompt, stashPrompt } from "./prompts";

export function moreActions(): MenuItem[] {
  const git = useGit.getState();
  return [
    { label: "Pull (rebase)", onSelect: () => void git.pull("rebase") },
    { label: "Pull (fast-forward only)", onSelect: () => void git.pull("ff-only") },
    { label: "Stash changes…", separator: true, onSelect: () => void stashPrompt() },
    { label: "Tag this version…", onSelect: () => void createTagPrompt() },
    { label: "Connect to a server…", separator: true, onSelect: () => void addRemotePrompt() },
    { label: "Set your name and email…", onSelect: () => void identityPrompt() },
  ];
}
