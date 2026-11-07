// One changed file. Click a Word document to see exactly what changed in it.

import { GitCompareArrows, ListChecks, Minus, Plus, Undo2 } from "lucide-react";
import { showPanel } from "../../app/layout";
import { useConflicts } from "../../store/conflicts";
import { useTextDiff } from "../../store/textDiff";
import type { ChangeStatus, FileChange } from "../../api/gitTypes";
import { isWordFile, splitPath } from "../../lib/format";
import { useGit } from "../../store/git";
import { useWorkspace } from "../../store/workspace";

const LETTER: Record<ChangeStatus, string> = {
  added: "A", modified: "M", deleted: "D", renamed: "R", untracked: "U", conflicted: "!", typechange: "T",
};
const WORDS: Record<ChangeStatus, string> = {
  added: "Added", modified: "Modified", deleted: "Deleted", renamed: "Renamed", untracked: "New file (not tracked yet)",
  conflicted: "Conflict: both sides changed this file", typechange: "Type changed",
};

export function FileRow({ change }: { change: FileChange }) {
  const { name, dir } = splitPath(change.path);
  const git = useGit.getState;
  const isConflict = change.status === "conflicted";
  const isDoc = isWordFile(change.path) && change.status !== "deleted" && !isConflict;
  // Any other changed file can be looked at line by line (and staged that way).
  const isText = !isDoc && !isConflict;
  const openLines = () => {
    void useTextDiff.getState().open(change.path, change.staged);
    showPanel("textDiff");
  };

  return (
    <div
      className="row file-row"
      title={`${change.path}\n${WORDS[change.status]}`}
      onClick={() => (isConflict ? useConflicts.getState().open(change.path) : isText ? openLines() : isDoc && void useWorkspace.getState().compareWorkingCopy(change.path))}
    >
      <span className={`status-letter ${change.status}`}>{LETTER[change.status]}</span>
      <span className={`row-main${change.status === "deleted" ? " struck" : ""}`}>{name}</span>
      {dir && <span className="row-dim">{dir}</span>}
      {isConflict && (
        <button className="resolve-button" onClick={(e) => { e.stopPropagation(); useConflicts.getState().open(change.path); }}>Resolve…</button>
      )}
      <span className="row-actions" onClick={(e) => e.stopPropagation()}>
        {isText && change.status !== "deleted" && (
          <button className="icon-button" aria-label="Stage line by line" title="Stage line by line" onClick={openLines}>
            <ListChecks size={14} />
          </button>
        )}
        {isDoc && (
          <button className="icon-button" aria-label="Show what changed" title="Show what changed" onClick={() => void useWorkspace.getState().compareWorkingCopy(change.path)}>
            <GitCompareArrows size={14} />
          </button>
        )}
        {!change.staged && change.status !== "conflicted" && (
          <button className="icon-button danger" aria-label="Discard changes" title="Discard changes" onClick={() => void git().discard([change.path])}>
            <Undo2 size={14} />
          </button>
        )}
        {isConflict ? null : change.staged ? (
          <button className="icon-button" aria-label="Unstage" title="Unstage" onClick={() => void git().unstage([change.path])}><Minus size={14} /></button>
        ) : (
          <button className="icon-button" aria-label="Stage" title="Stage" onClick={() => void git().stage([change.path])}><Plus size={14} /></button>
        )}
      </span>
    </div>
  );
}
