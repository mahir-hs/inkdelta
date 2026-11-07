// The status-bar item that keeps an update visible without getting in the way:
// download progress (percentage and speed) while it downloads, and a reminder when it waits for an answer.

import { ArrowDownToLine, Download } from "lucide-react";
import { formatSpeed, percentOf, useUpdater } from "../../store/updater";

export function UpdateChip() {
  const { phase, info, progress, openDialog } = useUpdater();
  if (!info) return null;

  if (phase === "downloading") {
    const percent = percentOf(progress);
    return (
      <button className="status-item update-chip busy" onClick={() => openDialog(true)} title={`Downloading Inkdelta ${info.version}. Click for details.`}>
        <ArrowDownToLine size={13} />
        <span className="chip-bar"><i style={{ width: `${percent ?? 8}%` }} /></span>
        {percent !== null ? `${percent}%` : "…"} · {formatSpeed(progress.speed)}
      </button>
    );
  }
  if (phase === "ready") {
    return <button className="status-item update-chip ready" onClick={() => openDialog(true)} title="Click to install and restart"><Download size={13} /> Update ready</button>;
  }
  if (phase === "available") {
    return <button className="status-item update-chip" onClick={() => openDialog(true)} title="Click for details"><Download size={13} /> Update available</button>;
  }
  return null;
}
