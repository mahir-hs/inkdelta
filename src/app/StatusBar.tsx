// The bar at the bottom: branch, sync state, what Git is doing, and the size of the current comparison.

import { LoaderCircle, TriangleAlert } from "lucide-react";
import { BranchChip } from "../features/sourcecontrol/BranchChip";
import { S } from "../strings";
import { useGit } from "../store/git";
import { useWorkspace } from "../store/workspace";

export function StatusBar() {
  const repo = useWorkspace((s) => s.repo);
  const diff = useWorkspace((s) => s.diff);
  const { status, busy, tool } = useGit();

  return (
    <footer className="statusbar">
      {repo && <BranchChip compact />}
      {repo && status && status.upstream && (
        <span className="status-item" title={`Tracking ${status.upstream}`}>↓ {status.behind}  ↑ {status.ahead}</span>
      )}
      {repo && status && status.files.length > 0 && <span className="status-item">{status.files.length} uncommitted</span>}
      {busy && (
        <span className="status-item busy"><LoaderCircle size={13} className="spin" /> {busy}…</span>
      )}
      <span className="spacer" />
      {tool && !tool.available && repo && (
        <span className="status-item warn" title="Pull and push need Git installed (git-scm.com)">
          <TriangleAlert size={13} /> Git not installed
        </span>
      )}
      {diff && <span className="status-item">{diff.changeCount} changes · {S.stats(diff.stats.wordsAdded, diff.stats.wordsRemoved)}</span>}
    </footer>
  );
}
