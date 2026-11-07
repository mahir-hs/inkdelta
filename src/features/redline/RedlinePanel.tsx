// The main panel: the document with every change marked, plus the version pickers.

import { ArrowDown, ArrowRight, ArrowUp, FileDown, ListFilter, Printer } from "lucide-react";
import { useEffect, useState } from "react";
import type { VersionInfo } from "../../api/types";
import { fileName, versionKey, versionLabel } from "../../lib/format";
import { S } from "../../strings";
import { useDocEdits } from "../../store/docEdits";
import { EMPTY_KEY, useWorkspace } from "../../store/workspace";
import { ChangeRuler } from "./ChangeRuler";
import { exportRedline } from "./exportRedline";
import { RedlineView } from "./RedlineView";
import { Welcome } from "./Welcome";

export function RedlinePanel() {
  const { repo, file, versions, oldKey, newKey, loose, diff, comparing, error, changesOnly, reading, selectedChange, scrollRequest } =
    useWorkspace();
  const ws = useWorkspace.getState;
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);

  // Scroll when something asked for it (ruler, change list, F3).
  useEffect(() => {
    if (!scrollRequest || !scroller) return;
    scroller
      .querySelector(`[data-change="${scrollRequest.change}"]`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [scrollRequest, scroller]);

  const pendingEdits = useDocEdits((s) => s.edits.size);
  // Editing happens on the working copy, the file on disk.
  const canEdit = reading && !loose && newKey === "workdir";
  const hasSources = !!loose || (!!repo && !!file && !!oldKey && !!newKey);
  const comparingSides = loose?.old.kind === "stage";
  const title = comparingSides
    ? `${fileName(loose!.old.path)} · mine → theirs`
    : loose
      ? `${fileName(loose.old.path)} → ${fileName(loose.new.path)}`
      : file ? fileName(file) : "";

  return (
    <div className="redline-panel">
      {hasSources && (
        <header className="doc-header">
          <div className="doc-row">
            <span className="doc-title" title={title}>{title}</span>
            <span className="spacer" />
            {diff && (
              <div className="doc-actions">
                <span className="segmented" role="group" aria-label="How to show the document">
                  <button className={reading ? "active" : ""} onClick={() => ws().setReading(true)}>Reading</button>
                  <button className={!reading ? "active" : ""} onClick={() => ws().setReading(false)}>Changes</button>
                </span>
                {!reading && (<>
                <span className="stats" title="Words added and removed">
                  <span className="stat ins">+{diff.stats.wordsAdded}</span>
                  <span className="stat del">−{diff.stats.wordsRemoved}</span>
                </span>
                <button
                  className={`toggle${changesOnly ? " on" : ""}`}
                  aria-pressed={changesOnly}
                  title="Hide paragraphs that did not change"
                  onClick={() => ws().setChangesOnly(!changesOnly)}
                >
                  <ListFilter size={14} /> {S.changesOnly}
                </button>
                <ChangeStepper />
                </>)}
                <button className="icon-button" title={S.exportHtml} aria-label={S.exportHtml} onClick={() => void exportRedline(diff, file)}>
                  <FileDown size={16} />
                </button>
                <button className="icon-button" title={S.print} aria-label={S.print} onClick={() => window.print()}>
                  <Printer size={16} />
                </button>
              </div>
            )}
          </div>

          {!loose && versions.length > 0 && reading && (
            <div className="range">
              <VersionSelect label="Viewing" versions={versions} value={newKey} onChange={(k) => ws().setNewKey(k)} />
              <span className="muted">{canEdit ? "Click any text to edit it" : "Read-only. Pick the working copy to edit."}</span>
            </div>
          )}

          {!loose && versions.length > 0 && !reading && (
            <div className="range">
              <VersionSelect label={S.from} versions={versions} value={oldKey} onChange={(k) => ws().setOldKey(k)} allowEmpty={oldKey === EMPTY_KEY} />
              <span className="range-arrow" aria-hidden="true"><ArrowRight size={14} /></span>
              <VersionSelect label={S.to} versions={versions} value={newKey} onChange={(k) => ws().setNewKey(k)} />
              <span className="spacer" />
              <button className="quiet" onClick={() => ws().compareWithOriginal()}>{S.original}</button>
              <button className="quiet" onClick={() => ws().compareWithPrevious()}>{S.previous}</button>
            </div>
          )}
        </header>
      )}

      <div className="doc-stage">
        <div className="doc-scroll" ref={setScroller}>
          {error && <p className="banner error">{error}</p>}
          {comparing && !diff && <p className="banner muted">{S.loading}</p>}
          {!hasSources && !error && <Welcome />}
          {repo && versions.length === 1 && !error && <p className="banner muted">{S.noHistory}</p>}
          {diff && (
            <RedlineView
              diff={diff}
              changesOnly={changesOnly && !reading}
              reading={reading}
              editable={canEdit}
              selectedChange={selectedChange}
              onSelectChange={(c) => ws().selectChange(c)}
            />
          )}
        </div>
        {pendingEdits > 0 && <EditBar count={pendingEdits} />}
        {diff && !reading && (
          <ChangeRuler
            scroller={scroller}
            diff={diff}
            layoutKey={String(changesOnly)}
            selectedChange={selectedChange}
            onJump={(c) => ws().jumpToChange(c)}
          />
        )}
      </div>
    </div>
  );
}

/** ↑ 3 / 11 ↓ */
export function ChangeStepper() {
  const diff = useWorkspace((s) => s.diff);
  const selected = useWorkspace((s) => s.selectedChange);
  const total = diff?.changeCount ?? 0;

  const step = (direction: 1 | -1) => {
    if (!total) return;
    const current = selected ?? (direction === 1 ? 0 : total + 1);
    useWorkspace.getState().jumpToChange(Math.min(Math.max(current + direction, 1), total));
  };

  return (
    <div className="stepper">
      <button className="icon-button" aria-label={S.previousChange} title={`${S.previousChange} (Shift+F3)`} disabled={!total} onClick={() => step(-1)}>
        <ArrowUp size={16} />
      </button>
      <span className="counter">{total ? S.changeCounter(selected ?? 0, total) : "–"}</span>
      <button className="icon-button" aria-label={S.nextChange} title={`${S.nextChange} (F3)`} disabled={!total} onClick={() => step(1)}>
        <ArrowDown size={16} />
      </button>
    </div>
  );
}

function VersionSelect(props: { label: string; versions: VersionInfo[]; value: string | null; onChange: (key: string) => void; allowEmpty?: boolean }) {
  return (
    <label className="version-select">
      <span>{props.label}</span>
      <select value={props.value ?? ""} onChange={(e) => props.onChange(e.target.value)}>
        {props.allowEmpty && <option value={EMPTY_KEY}>Before this document existed</option>}
        {props.versions.map((v) => (
          <option key={versionKey(v)} value={versionKey(v)}>{versionLabel(v)}</option>
        ))}
      </select>
    </label>
  );
}

/** Floating bar shown while edits are waiting: save them, or save, commit and push in one go. */
function EditBar({ count }: { count: number }) {
  const { discard, save, saveAndCommit } = useDocEdits.getState();
  return (
    <div className="editbar" role="status">
      <span>{count} paragraph{count === 1 ? "" : "s"} edited</span>
      <button className="quiet" onClick={() => discard()}>Discard</button>
      <button onClick={() => void save()}>Save</button>
      <button className="primary" onClick={() => void saveAndCommit()}>Save &amp; commit…</button>
    </div>
  );
}
