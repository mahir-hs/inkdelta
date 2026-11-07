// The reviewer-comments checklist: status, notes, and links to the changes that address each comment.

import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, useMemo, useState } from "react";
import { api, errorMessage } from "../../api/commands";
import type { Outline, RepoInfo, Source } from "../../api/types";
import { fileName } from "../../lib/format";
import { S } from "../../strings";
import { groupComments } from "./groupItems";
import { emptyItem, isAddressed, type ItemState, type ReviewState, type ReviewStatus } from "./reviewState";

interface Props {
  repo: RepoInfo | null;
  /** The document being compared; it is not offered as a reviewer file. */
  currentFile: string | null;
  state: ReviewState;
  onReviewerFile: (path: string | null) => void;
  onUpdateItem: (id: string, patch: Partial<ItemState>) => void;
  /** Excerpt of the change currently selected in the redline, if any. */
  selectedExcerpt: string | null;
  onJumpToExcerpt: (excerpt: string) => void;
}

type Filter = "all" | "open" | "done";

const STATUS_LABELS: Record<ReviewStatus, string> = {
  open: S.statusOpen,
  progress: S.statusProgress,
  done: S.statusDone,
  skipped: S.statusSkipped,
};

export function ReviewerPanel(props: Props) {
  const { repo, currentFile, state, onReviewerFile, onUpdateItem, selectedExcerpt, onJumpToExcerpt } = props;
  const [outline, setOutline] = useState<Outline | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  // Load the reviewer document whenever the chosen file changes.
  useEffect(() => {
    setOutline(null);
    setError(null);
    if (!state.reviewerFile) return;
    const inRepo = repo?.docxFiles.includes(state.reviewerFile);
    const source: Source = inRepo
      ? { kind: "workdir", repo: repo!.root, path: state.reviewerFile }
      : { kind: "file", path: state.reviewerFile };
    let cancelled = false;
    api
      .loadOutline(source)
      .then((o) => !cancelled && setOutline(o))
      .catch((e) => !cancelled && setError(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [state.reviewerFile, repo]);

  const groups = useMemo(() => (outline ? groupComments(outline.items, S.tabReviewer) : []), [outline]);
  const all = groups.flatMap((g) => g.comments);
  const doneCount = all.filter((c) => isAddressed(state.items[c.id])).length;

  async function browse() {
    const chosen = await open({ multiple: false, filters: [{ name: "Word document", extensions: ["docx"] }] });
    if (typeof chosen === "string") onReviewerFile(chosen);
  }

  const candidates = (repo?.docxFiles ?? []).filter((f) => f !== currentFile);

  return (
    <div className="review-panel">
      <div className="reviewer-file">
        <label>
          {S.reviewerFile}
          <select value={state.reviewerFile ?? ""} onChange={(e) => onReviewerFile(e.target.value || null)}>
            <option value="">{S.chooseReviewerFile}</option>
            {candidates.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
            {state.reviewerFile && !candidates.includes(state.reviewerFile) && (
              <option value={state.reviewerFile}>{fileName(state.reviewerFile)}</option>
            )}
          </select>
        </label>
        <button onClick={browse}>{S.browse}</button>
      </div>

      {!state.reviewerFile && <p className="muted">{S.noReviewerFile}</p>}
      {error && <p className="error">{error}</p>}

      {all.length > 0 && (
        <>
          <div className="progress">
            <div className="bar"><div className="fill" style={{ width: `${(doneCount / all.length) * 100}%` }} /></div>
            <span>{S.progress(doneCount, all.length)}</span>
          </div>
          <div className="filters" role="tablist">
            {(["all", "open", "done"] as Filter[]).map((f) => (
              <button key={f} className={filter === f ? "active" : ""} onClick={() => setFilter(f)}>
                {f === "all" ? S.filterAll : f === "open" ? S.filterOpen : S.filterDone}
              </button>
            ))}
          </div>
        </>
      )}

      {groups.map((group) => {
        const visible = group.comments.filter((c) => {
          const addressed = isAddressed(state.items[c.id]);
          return filter === "all" || (filter === "done" ? addressed : !addressed);
        });
        if (visible.length === 0) return null;
        return (
          <section key={group.title}>
            <h3>{group.title}</h3>
            {visible.map((comment) => (
              <CommentCard
                key={comment.id}
                marker={comment.marker}
                text={comment.text}
                item={state.items[comment.id] ?? emptyItem()}
                onChange={(patch) => onUpdateItem(comment.id, patch)}
                selectedExcerpt={selectedExcerpt}
                onJumpToExcerpt={onJumpToExcerpt}
              />
            ))}
          </section>
        );
      })}
    </div>
  );
}

interface CardProps {
  marker?: string;
  text: string;
  item: ItemState;
  onChange: (patch: Partial<ItemState>) => void;
  selectedExcerpt: string | null;
  onJumpToExcerpt: (excerpt: string) => void;
}

function CommentCard({ marker, text, item, onChange, selectedExcerpt, onJumpToExcerpt }: CardProps) {
  const [showNote, setShowNote] = useState(item.note.length > 0);
  const canLink = selectedExcerpt !== null && !item.links.includes(selectedExcerpt);

  return (
    <div className={`comment-card status-${item.status}`}>
      <p className="comment-text">
        {marker && <span className="list-marker">{marker}</span>}
        {text}
      </p>

      <div className="status-row">
        {(Object.keys(STATUS_LABELS) as ReviewStatus[]).map((status) => (
          <button
            key={status}
            className={item.status === status ? `active ${status}` : ""}
            onClick={() => onChange({ status })}
          >
            {STATUS_LABELS[status]}
          </button>
        ))}
      </div>

      {item.links.map((link) => (
        <div className="link-chip" key={link}>
          <button className="link-text" onClick={() => onJumpToExcerpt(link)} title={link}>🔗 {link}</button>
          <button className="icon" aria-label={S.unlink} onClick={() => onChange({ links: item.links.filter((l) => l !== link) })}>×</button>
        </div>
      ))}

      <div className="card-actions">
        <button disabled={!canLink} title={canLink ? "" : S.linkHint} onClick={() => onChange({ links: [...item.links, selectedExcerpt!] })}>
          {S.linkChange}
        </button>
        {!showNote && <button onClick={() => setShowNote(true)}>{S.addNote}</button>}
      </div>

      {showNote && (
        <textarea
          value={item.note}
          placeholder={S.addNote}
          rows={3}
          onChange={(e) => onChange({ note: e.target.value })}
        />
      )}
    </div>
  );
}
