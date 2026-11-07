// The update screens: a small card that ASKS (bottom right, does not block anything) and the details window
// (File > Check for updates) with the release notes, the download's percentage and speed, and the automatic-check switch.

import { CircleCheck, Download, LoaderCircle, RefreshCw } from "lucide-react";
import { formatBytes, formatEta, formatSpeed, percentOf, useUpdater } from "../../store/updater";

export function UpdateHost() {
  const { cardOpen, dialogOpen, phase } = useUpdater();
  return (
    <>
      {cardOpen && (phase === "available" || phase === "ready") && <UpdateCard />}
      {dialogOpen && <UpdateDialog />}
    </>
  );
}

/** Asks first, and asks again before installing. */
function UpdateCard() {
  const { phase, info, currentVersion, download, install, later, skipVersion } = useUpdater();
  if (!info) return null;
  const ready = phase === "ready";
  return (
    <div className="update-card" role="alertdialog" aria-label="Update">
      <strong>{ready ? `Inkdelta ${info.version} is ready to install` : `Inkdelta ${info.version} is available`}</strong>
      <p>
        {ready
          ? "Inkdelta will close and open again. Unsaved edits and the terminal session will be lost."
          : `You have ${currentVersion}. It downloads in the background while you keep working.`}
      </p>
      <div className="update-actions">
        {ready ? (
          <button className="primary" onClick={() => void install()}>Install and restart</button>
        ) : (
          <button className="primary" onClick={() => void download()}><Download size={14} /> Download</button>
        )}
        <button onClick={later}>Later</button>
        {!ready && <button className="quiet" onClick={skipVersion}>Skip this version</button>}
      </div>
    </div>
  );
}

function UpdateDialog() {
  const u = useUpdater();
  const close = () => u.openDialog(false);
  const percent = percentOf(u.progress);
  const busy = u.phase === "checking" || u.phase === "downloading" || u.phase === "installing";

  return (
    <div className="scrim" onMouseDown={close}>
      <div className="dialog update-dialog" role="dialog" aria-modal="true" aria-label="Updates" onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === "Escape" && close()}>
        <h2><RefreshCw size={16} /> Updates</h2>
        <p className="update-version">Inkdelta {u.currentVersion || "…"}{u.lastChecked ? `  ·  checked ${new Date(u.lastChecked).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}</p>

        {u.phase === "checking" && <p className="update-line"><LoaderCircle size={15} className="spin" /> Checking for updates…</p>}
        {u.phase === "upToDate" && <p className="update-line ok"><CircleCheck size={15} /> You have the latest version.</p>}
        {u.phase === "idle" && <p className="update-line">Press “Check for updates” to look for a new version.</p>}
        {u.error && <p className="update-line bad">{u.error}</p>}

        {u.info && (u.phase === "available" || u.phase === "downloading" || u.phase === "ready" || u.phase === "installing") && (
          <>
            <p className="update-line"><strong>Version {u.info.version}</strong>{u.info.date ? ` · ${new Date(u.info.date).toLocaleDateString()}` : ""}</p>
            <div className="update-notes">{u.info.notes.trim() || "No release notes."}</div>
          </>
        )}

        {u.phase === "downloading" && (
          <div className="update-progress" aria-live="polite">
            <div className="bar"><div style={{ width: `${percent ?? 8}%` }} className={percent === null ? "indeterminate" : ""} /></div>
            <div className="update-numbers">
              <span>{percent !== null ? `${percent}%` : "Downloading…"}</span>
              <span>{formatSpeed(u.progress.speed)}</span>
              <span>{formatBytes(u.progress.downloaded)}{u.progress.total ? ` of ${formatBytes(u.progress.total)}` : ""}</span>
              <span>{formatEta(u.progress)}</span>
            </div>
            <p className="ask-note">You can close this window: the download continues in the background.</p>
          </div>
        )}
        {u.phase === "ready" && <p className="update-line ok"><CircleCheck size={15} /> Downloaded. Installing closes Inkdelta and opens it again.</p>}
        {u.phase === "installing" && <p className="update-line"><LoaderCircle size={15} className="spin" /> Installing…</p>}

        <label className="update-auto">
          <input type="checkbox" checked={u.autoCheck} onChange={(e) => u.setAutoCheck(e.target.checked)} />
          Check for updates automatically (you are always asked before anything is downloaded)
        </label>

        <div className="dialog-actions">
          {u.phase === "available" && (
            <>
              <button className="quiet" onClick={u.skipVersion}>Skip this version</button>
              <button className="primary" onClick={() => void u.download()}><Download size={14} /> Download update</button>
            </>
          )}
          {u.phase === "ready" && <button className="primary" onClick={() => void u.install()}>Install and restart</button>}
          <button disabled={busy} onClick={() => void u.check(false)}>Check for updates</button>
          <button onClick={close}>Close</button>
        </div>
      </div>
    </div>
  );
}
