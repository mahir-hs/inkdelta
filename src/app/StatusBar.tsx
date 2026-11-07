// The bar at the bottom: branch, sync state, what Git is doing, and the size of the current comparison.

import { LoaderCircle, Minus, Plus, TriangleAlert } from "lucide-react";
import { BranchChip } from "../features/sourcecontrol/BranchChip";
import { S } from "../strings";
import { useGit } from "../store/git";
import { useWorkspace } from "../store/workspace";
import { useZoom } from "../store/zoom";

export function StatusBar() {
  const repo = useWorkspace((s) => s.repo);
  const diff = useWorkspace((s) => s.diff);
  const { status, busy, tool } = useGit();
  const zoom = useZoom();

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
      <span className="zoom-group" role="group" aria-label="Zoom">
        <button className="icon-button" title="Zoom out (Ctrl -)" aria-label="Zoom out" onClick={() => zoom.zoomOut()}><Minus size={13} /></button>
        <button className="quiet zoom-chip" title="Click to reset to 100% (Ctrl 0)" aria-label="Reset zoom" onClick={() => zoom.reset()}>
          {Math.round(zoom.level * 100)}%
        </button>
        <button className="icon-button" title="Zoom in (Ctrl +)" aria-label="Zoom in" onClick={() => zoom.zoomIn()}><Plus size={13} /></button>
      </span>
      {diff && <span className="status-item">{diff.changeCount} changes · {S.stats(diff.stats.wordsAdded, diff.stats.wordsRemoved)}</span>}
    </footer>
  );
}
