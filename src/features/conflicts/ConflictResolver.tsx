// The merge conflict resolver.
//
// Two situations, because Word files cannot be merged line by line:
//   * Plain text: each conflicting section is shown with both versions and settled on its own.
//   * Word documents and other binaries: keep one whole version, after looking at a redline of the two.

import { FileText, GitCompareArrows } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api, errorMessage } from "../../api/commands";
import type { ConflictInfo, ConflictPart, HunkChoice, MergeSide } from "../../api/gitTypes";
import { fileName, isWordFile } from "../../lib/format";
import { useConflicts } from "../../store/conflicts";
import { useGit } from "../../store/git";
import { useUi } from "../../store/ui";
import { useWorkspace } from "../../store/workspace";

export function ConflictResolver() {
  const path = useConflicts((s) => s.path);
  return path ? <Resolver key={path} path={path} /> : null;
}

function Resolver({ path }: { path: string }) {
  const root = useWorkspace((s) => s.repo?.root);
  const close = useConflicts((s) => s.close);
  const [info, setInfo] = useState<ConflictInfo | null>(null);
  const [parts, setParts] = useState<ConflictPart[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!root) return;
    let cancelled = false;
    (async () => {
      try {
        const loaded = await api.conflictInfo(root, path);
        const hunks = loaded.isText ? await api.conflictHunks(root, path) : [];
        if (!cancelled) {
          setInfo(loaded);
          setParts(hunks);
        }
      } catch (e) {
        if (!cancelled) setError(errorMessage(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [root, path]);

  return (
    <div className="scrim" onMouseDown={close}>
      <div
        className="resolver"
        role="dialog"
        aria-modal="true"
        aria-label={`Resolve conflict in ${fileName(path)}`}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === "Escape" && close()}
      >
        <header className="resolver-head">
          <FileText size={18} />
          <div>
            <h2>{fileName(path)}</h2>
            {info && (
              <p>
                Your branch <b>{info.oursLabel}</b> and <b>{info.theirsLabel}</b> both changed this file.
              </p>
            )}
          </div>
        </header>

        {error && <p className="resolver-error">{error}</p>}
        {!info && !error && <p className="muted resolver-loading">Reading both versions…</p>}
        {info && (info.isText ? <TextResolver info={info} parts={parts} path={path} /> : <FileResolver info={info} path={path} />)}
      </div>
    </div>
  );
}

// ------------------------------------------------------------ plain text: section by section

type Mode = "ours" | "theirs" | "both" | "custom";

function TextResolver({ info, parts, path }: { info: ConflictInfo; parts: ConflictPart[]; path: string }) {
  const close = useConflicts((s) => s.close);
  const git = useGit.getState();
  const hunkParts = useMemo(() => parts.filter((p): p is Extract<ConflictPart, { type: "conflict" }> => p.type === "conflict"), [parts]);
  const [modes, setModes] = useState<(Mode | null)[]>([]);
  const [edits, setEdits] = useState<string[]>([]);

  useEffect(() => {
    setModes(hunkParts.map(() => null));
    setEdits(hunkParts.map((h) => h.ours + h.theirs));
  }, [hunkParts]);

  const setMode = (i: number, mode: Mode) => setModes((m) => m.map((x, n) => (n === i ? mode : x)));
  const setAll = (mode: Mode) => setModes(hunkParts.map(() => mode));
  const decided = modes.length > 0 && modes.every(Boolean);

  async function save() {
    const choices: HunkChoice[] = modes.map((mode, i) =>
      mode === "custom" ? { kind: "custom", text: edits[i] } : { kind: mode as "ours" | "theirs" | "both" },
    );
    if (await git.resolveHunks(path, choices)) close();
  }

  // Nothing to choose between: the markers are gone, perhaps because the file was edited by hand.
  if (hunkParts.length === 0) {
    return (
      <>
        <div className="resolver-body">
          <p className="resolver-note">No conflict markers were found in this file. If you already edited it, accept it as it is now.</p>
        </div>
        <footer className="resolver-foot">
          <span className="spacer" />
          <button onClick={close}>Cancel</button>
          <button className="primary" onClick={() => void git.markResolved(path).then((ok) => ok && close())}>Use the file as it is</button>
        </footer>
      </>
    );
  }

  let hunkNumber = -1;
  return (
    <>
      <div className="resolver-body">
        {parts.map((part, index) => {
          if (part.type === "text") return <Context key={index} text={part.text} previous={parts[index - 1]} next={parts[index + 1]} />;
          const i = ++hunkNumber;
          return (
            <section className={`hunk${modes[i] ? " decided" : ""}`} key={index}>
              <header>
                <span>Conflict {i + 1} of {hunkParts.length}</span>
                <span className="segmented" role="group" aria-label="How to settle this conflict">
                  {(
                    [
                      ["ours", "Keep mine"],
                      ["theirs", "Take theirs"],
                      ["both", "Keep both"],
                      ["custom", "Edit…"],
                    ] as [Mode, string][]
                  ).map(([mode, label]) => (
                    <button key={mode} className={modes[i] === mode ? "active" : ""} onClick={() => setMode(i, mode)}>{label}</button>
                  ))}
                </span>
              </header>
              {modes[i] === "custom" ? (
                <textarea
                  className="hunk-edit"
                  rows={Math.min(14, Math.max(4, edits[i]?.split("\n").length ?? 4))}
                  value={edits[i] ?? ""}
                  spellCheck={false}
                  onChange={(e) => setEdits((all) => all.map((t, n) => (n === i ? e.target.value : t)))}
                />
              ) : (
                <div className="panes">
                  <Pane side="ours" label={`Mine · ${info.oursLabel}`} text={part.ours} chosen={modes[i] === "ours" || modes[i] === "both"} onPick={() => setMode(i, "ours")} />
                  <Pane side="theirs" label={`Theirs · ${info.theirsLabel}`} text={part.theirs} chosen={modes[i] === "theirs" || modes[i] === "both"} onPick={() => setMode(i, "theirs")} />
                </div>
              )}
            </section>
          );
        })}
      </div>

      <footer className="resolver-foot">
        <button className="quiet" onClick={() => setAll("ours")}>Keep all mine</button>
        <button className="quiet" onClick={() => setAll("theirs")}>Take all theirs</button>
        <span className="spacer" />
        <span className="muted">{modes.filter(Boolean).length} of {hunkParts.length} settled</span>
        <button onClick={close}>Cancel</button>
        <button className="primary" disabled={!decided} onClick={() => void save()}>Save resolution</button>
      </footer>
    </>
  );
}

function Pane(props: { side: "ours" | "theirs"; label: string; text: string; chosen: boolean; onPick: () => void }) {
  return (
    <button className={`pane ${props.side}${props.chosen ? " chosen" : ""}`} onClick={props.onPick} aria-pressed={props.chosen}>
      <span className="pane-label">{props.label}</span>
      <pre>{props.text || "(nothing: this side removed these lines)"}</pre>
    </button>
  );
}

/** A couple of unchanged lines around a conflict, so you can see where it sits in the file. */
function Context({ text, previous, next }: { text: string; previous?: ConflictPart; next?: ConflictPart }) {
  const lines = text.replace(/\r?\n$/, "").split(/\r?\n/);
  const shown = previous && next ? [...lines.slice(0, 2), ...(lines.length > 4 ? ["⋯"] : []), ...lines.slice(-2)] : previous ? lines.slice(0, 2) : lines.slice(-2);
  return <pre className="context">{[...new Set(shown.length ? shown : lines)].join("\n")}</pre>;
}

// ------------------------------------------------------------ Word documents and binaries: keep one version

function FileResolver({ info, path }: { info: ConflictInfo; path: string }) {
  const close = useConflicts((s) => s.close);
  const git = useGit.getState();
  const [side, setSide] = useState<MergeSide | null>(null);
  const isWord = isWordFile(path);
  const canCompare = isWord && info.oursExists && info.theirsExists;

  const options: { side: MergeSide; title: string; detail: string }[] = [
    {
      side: "ours",
      title: info.oursExists ? "Keep my version" : "Delete the file",
      detail: info.oursExists ? `The version on ${info.oursLabel}, the branch you are on.` : `You deleted it on ${info.oursLabel}.`,
    },
    {
      side: "theirs",
      title: info.theirsExists ? "Take their version" : "Delete the file",
      detail: info.theirsExists ? `The version from ${info.theirsLabel}, the branch being merged in.` : `It was deleted on ${info.theirsLabel}.`,
    },
  ];

  async function apply() {
    if (!side) return;
    const deleting = side === "ours" ? !info.oursExists : !info.theirsExists;
    if (deleting) {
      const ok = await useUi.getState().confirm({
        title: "Delete this file?",
        message: `“${fileName(path)}” will be removed from the merged result.`,
        confirmLabel: "Delete file",
        danger: true,
      });
      if (!ok) return;
    }
    if (await git.resolveSide(path, side)) close();
  }

  return (
    <>
      <div className="resolver-body">
        <p className="resolver-note">
          {isWord
            ? "Word documents cannot be merged line by line. Look at what differs, then keep one version."
            : "This is not a plain text file, so it cannot be merged line by line. Keep one version."}
        </p>

        {canCompare && (
          <button
            className="compare-sides"
            onClick={() => {
              void useWorkspace.getState().compareConflictSides(path);
              close();
            }}
          >
            <GitCompareArrows size={16} />
            <span>
              <b>See what differs</b>
              <small>Opens a redline: your version to theirs</small>
            </span>
          </button>
        )}

        <div className="side-options" role="radiogroup" aria-label="Which version to keep">
          {options.map((option) => (
            <button key={option.side} role="radio" aria-checked={side === option.side} className={`side-option${side === option.side ? " chosen" : ""}`} onClick={() => setSide(option.side)}>
              <b>{option.title}</b>
              <small>{option.detail}</small>
            </button>
          ))}
        </div>
      </div>

      <footer className="resolver-foot">
        <span className="spacer" />
        <button onClick={close}>Cancel</button>
        <button className="primary" disabled={!side} onClick={() => void apply()}>Use this version</button>
      </footer>
    </>
  );
}
