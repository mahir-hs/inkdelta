// Every small question the Git features ask the user (branch name, tag, identity, ...).
// They live together so panels, menus and the command palette can all reuse them.

import { useGit } from "../../store/git";
import { useUi } from "../../store/ui";

/** Ask for a name, then create and switch to a new branch. */
export async function newBranchPrompt() {
  const values = await useUi.getState().prompt({
    title: "New branch",
    message: "The new branch starts from where you are now.",
    fields: [{ name: "name", label: "Branch name", placeholder: "revision-2", required: true }],
    confirmLabel: "Create and switch",
  });
  if (values) await useGit.getState().createBranch(values.name.trim(), null, true);
}

export async function stashPrompt() {
  const values = await useUi.getState().prompt({
    title: "Stash changes",
    message: "Put your uncommitted work aside. You can bring it back later.",
    fields: [
      { name: "message", label: "Note (optional)", placeholder: "half-finished discussion section" },
      { name: "untracked", label: "Include new files that are not tracked yet", kind: "checkbox", initial: "true" },
    ],
    confirmLabel: "Stash",
  });
  if (values) await useGit.getState().stashSave(values.message, values.untracked === "true");
}

export async function createTagPrompt() {
  const values = await useUi.getState().prompt({
    title: "Tag this version",
    message: "A tag is a permanent label on the current commit, for example “submitted-v1”.",
    fields: [
      { name: "name", label: "Tag name", placeholder: "submitted-v1", required: true },
      { name: "message", label: "Note (optional)", kind: "multiline" },
    ],
    confirmLabel: "Create tag",
  });
  if (values) await useGit.getState().createTag(values.name.trim(), values.message.trim() || null);
}

export async function identityPrompt() {
  const git = useGit.getState();
  const values = await useUi.getState().prompt({
    title: "Your name on commits",
    fields: [
      { name: "name", label: "Name", initial: git.identity?.name ?? "", required: true },
      { name: "email", label: "Email", initial: git.identity?.email ?? "", required: true },
    ],
    confirmLabel: "Save",
  });
  if (values) await git.setIdentity(values.name.trim(), values.email.trim(), true);
}

export async function addRemotePrompt() {
  const values = await useUi.getState().prompt({
    title: "Connect to a server",
    fields: [
      { name: "name", label: "Name", initial: "origin", required: true },
      { name: "url", label: "Repository address", placeholder: "https://github.com/you/paper.git", required: true },
    ],
    confirmLabel: "Add",
  });
  if (values) await useGit.getState().addRemote(values.name.trim(), values.url.trim());
}

