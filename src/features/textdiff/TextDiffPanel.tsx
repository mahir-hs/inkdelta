// The changes of one text file, line by line. Pick lines or whole hunks and stage (or unstage) just those.
//
//   click a line .......... pick / unpick it
//   shift+click ........... pick a whole range
//   "Stage hunk" .......... stage every changed line of that hunk at once

import { FileDiff as FileDiffIcon } from "lucide-react";
import { splitPath } from "../../lib/format";
import { useGit } from "../../store/git";
import { lineKey, useTextDiff } from "../../store/textDiff";
import type { DiffHunkInfo } from "../../api/gitTypes";

export function TextDiffPanel() {
  const { target, diff, selected, error, loading } = useTextDiff();
  const busy = useGit((s) => s.busy);
  const ds = useTextDiff.getState;

  if (!target) {
    return (
      <div className="empty-panel">
        <FileDiffIcon size={22} />
        <p>Pick a changed text file in Source control to stage it line by line.</p>
      </div>
    );
  }

  const { name, dir } = splitPath(target.path);
  const added = diff ? diff.hunks.reduce((n, h) => n + h.lines.filter((l) => l.kind === "added").length, 0) : 0;
  const removed = diff ? diff.hunks.reduce((n, h) => n + h.lines.filter((l) => l.kind === "removed").length, 0) : 0;
  const count = selected.size;

  async function apply(picks = ds().picks()) {
    if (!diff || picks.length === 0) return;
    const git = useGit.getState();
    const ok = target!.staged ? await git.unstageLines(target!.path, picks, diff.fingerprint) : await git.stageLines(target!.path, picks, diff.fingerprint);
    if (ok) ds().setAll(false);
  }

  /** Stage or unstage every changed line of one hunk. */
  function applyHunk(hunk: number) {
    const picks = diff!.hunks[hunk].lines.flatMap((line, l) => (line.kind === "context" ? [] : [{ hunk, line: l }]));
    void apply(picks);
  }

  return (
    <div className="textdiff">
      <header className="textdiff-head">
        <div className="textdiff-title">
          <span className="textdiff-name">{name}</span>
          {dir && <span className="muted">{dir}</span>}
        </div>
        <span className="segmented" role="group" aria-label="Which changes to show">
          <button className={!target.staged ? "active" : ""} onClick={() => void ds().switchSide(false)}>Not staged</button>
          <button className={target.staged ? "active" : ""} onClick={() => void ds().switchSide(true)}>Staged</button>
        </span>
        <span className="spacer" />
        {diff && diff.hunks.length > 0 && (
          <span className="stats">
            <span className="stat ins">+{added}</span>
            <span className="stat del">−{removed}</span>
          </span>
        )}
      </header>

      {diff?.selectable && (
        <div className="textdiff-bar">
          <button className="quiet" onClick={() => ds().setAll(true)}>Select all</button>
          <button className="quiet" disabled={count === 0} onClick={() => ds().setAll(false)}>Clear</button>
          <span className="muted textdiff-hint">Click lines to pick them. Shift+click picks a range.</span>
          <span className="spacer" />
          <button className="primary" disabled={count === 0 || !!busy} onClick={() => void apply()}>
            {target.staged ? "Unstage" : "Stage"} {count > 0 ? `${count} line${count === 1 ? "" : "s"}` : "selected lines"}
          </button>
        </div>
      )}

      <div className="textdiff-body">
        {error && <p className="banner error">{error}</p>}
        {loading && !diff && <p className="banner muted">Reading changes…</p>}
        {diff && diff.binary && <p className="textdiff-note">This is not a plain text file, so it cannot be staged line by line. Stage the whole file from Source control.</p>}
        {diff && !diff.binary && diff.hunks.length === 0 && <p className="textdiff-note">No {target.staged ? "staged" : "unstaged"} changes in this file.</p>}
        {diff && !diff.binary && diff.hunks.length > 0 && !diff.selectable && (
          <p className="textdiff-note">This file was deleted, so it can only be staged as a whole from Source control.</p>
        )}

        {diff?.hunks.map((hunk, h) => (
          <Hunk key={h} index={h} hunk={hunk} selectable={diff.selectable} staged={target.staged} onWhole={() => applyHunk(h)} />
        ))}
      </div>
    </div>
  );
}

function Hunk(props: { index: number; hunk: DiffHunkInfo; selectable: boolean; staged: boolean; onWhole: () => void }) {
  const { index, hunk, selectable, staged } = props;
  const selected = useTextDiff((s) => s.selected);
  const ds = useTextDiff.getState;
  const changeable = hunk.lines.filter((l) => l.kind !== "context").length;
  const picked = hunk.lines.filter((line, l) => line.kind !== "context" && selected.has(lineKey(index, l))).length;
  const busy = useGit((s) => s.busy);

  return (
    <section className="dhunk">
      <header>
        <code>{hunk.header}</code>
        <span className="spacer" />
        {selectable && (
          <>
            <button className="quiet" onClick={() => ds().setHunk(index, picked < changeable)}>
              {picked < changeable ? "Pick hunk" : "Unpick hunk"}
            </button>
            <button className="quiet" disabled={!!busy} onClick={props.onWhole}>{staged ? "Unstage hunk" : "Stage hunk"}</button>
          </>
        )}
      </header>

      <div className="dlines">
        {hunk.lines.map((line, l) => {
          const pickable = selectable && line.kind !== "context";
          const on = selected.has(lineKey(index, l));
          return (
            <div
              key={l}
              className={`dline ${line.kind}${on ? " picked" : ""}${pickable ? " pickable" : ""}`}
              onClick={(e) => pickable && ds().toggle(index, l, e.shiftKey)}
            >
              <span className="dcheck">{pickable && <input type="checkbox" tabIndex={-1} checked={on} readOnly aria-label="Pick this line" />}</span>
              <span className="dno">{line.oldNo ?? ""}</span>
              <span className="dno">{line.newNo ?? ""}</span>
              <span className="dsign">{line.kind === "added" ? "+" : line.kind === "removed" ? "−" : ""}</span>
              <span className="dtext">{line.text || " "}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
