// The commit graph: every commit once, with branch lanes, labels and a details pane.

import { Copy, GitCompareArrows } from "lucide-react";
import type { GraphRow, RefLabel } from "../../api/gitTypes";
import { formatDate, isWordFile, relativeTime, splitPath } from "../../lib/format";
import { useGit } from "../../store/git";
import { useUi, type MenuItem } from "../../store/ui";
import { useWorkspace } from "../../store/workspace";
import { graphWidth, LaneSvg } from "./LaneSvg";

const STATUS_LETTER = { added: "A", modified: "M", deleted: "D", renamed: "R", untracked: "U", conflicted: "!", typechange: "T" } as const;

export function GraphPanel() {
  const repo = useWorkspace((s) => s.repo);
  const { graph, selectedCommit } = useGit();
  const git = useGit.getState;

  if (!repo) return <div className="empty-panel"><p>Open a project to see its history.</p></div>;
  if (!graph) return <div className="empty-panel"><p className="muted">Reading history…</p></div>;
  if (graph.rows.length === 0) return <div className="empty-panel"><p>No commits yet. Make your first commit from Source control.</p></div>;

  const selected = graph.rows.find((r) => r.id === selectedCommit) ?? null;
  const headId = graph.rows.find((r) => r.refs.some((l) => l.kind === "head"))?.id;

  const rowMenu = (row: GraphRow): MenuItem[] => {
    const switchable = row.refs.filter((l) => l.kind === "branch");
    return [
      ...switchable.map((l) => ({ label: `Switch to ${l.name}`, onSelect: () => void git().checkout(l.name) })),
      { label: "New branch here…", separator: switchable.length > 0, onSelect: () => void branchHere(row) },
      { label: "Copy commit id", onSelect: () => void navigator.clipboard?.writeText(row.id) },
    ];
  };

  return (
    <div className="graph-panel">
      <div className="graph-list" role="list" style={{ "--graph-w": `${graphWidth(graph.laneCount)}px` } as React.CSSProperties}>
        <div className="graph-head" aria-hidden="true">
          <span className="graph-col-graph" />
          <span>Message</span>
          <span>Author</span>
          <span>Date</span>
          <span>Commit</span>
        </div>
        {graph.rows.map((row) => (
          <div
            key={row.id}
            role="listitem"
            className={`graph-row${row.id === selectedCommit ? " selected" : ""}`}
            onClick={() => void git().selectCommit(row.id === selectedCommit ? null : row.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              useUi.getState().openMenu(e.clientX, e.clientY, rowMenu(row));
            }}
          >
            <LaneSvg row={row} laneCount={graph.laneCount} isHead={row.id === headId} />
            <span className="graph-message">
              {row.refs.map((label) => <RefChip key={`${label.kind}-${label.name}`} label={label} />)}
              <span className="graph-summary" title={row.summary}>{row.summary}</span>
            </span>
            <span className="graph-author">{row.author}</span>
            <span className="graph-date" title={formatDate(row.time)}>{relativeTime(row.time)}</span>
            <code className="graph-hash">{row.shortId}</code>
          </div>
        ))}
        {graph.truncated && (
          <button className="quiet load-more" onClick={() => void git().loadMoreGraph()}>Show older commits</button>
        )}
      </div>

      {selected && <CommitDetails row={selected} />}
    </div>
  );
}

async function branchHere(row: GraphRow) {
  const values = await useUi.getState().prompt({
    title: "New branch here",
    message: `Start a branch at “${row.summary}”.`,
    fields: [{ name: "name", label: "Branch name", required: true }],
    confirmLabel: "Create and switch",
  });
  if (values) await useGit.getState().createBranch(values.name.trim(), row.id, true);
}

function RefChip({ label }: { label: RefLabel }) {
  return <span className={`chip ref-${label.kind}`}>{label.name}</span>;
}

function CommitDetails({ row }: { row: GraphRow }) {
  const files = useGit((s) => s.selectedCommitFiles);
  const compare = useWorkspace.getState().compareVersions;

  return (
    <aside className="commit-details">
      <h3>{row.summary}</h3>
      <p className="muted">{row.author} · {formatDate(row.time)}</p>
      <p className="hash-line">
        <code>{row.id}</code>
        <button className="icon-button" aria-label="Copy commit id" title="Copy commit id" onClick={() => void navigator.clipboard?.writeText(row.id)}>
          <Copy size={13} />
        </button>
      </p>

      <div className="list-heading">{files.length} changed file{files.length === 1 ? "" : "s"}</div>
      <ul className="plain-list">
        {files.map((file) => {
          const { name, dir } = splitPath(file.path);
          const isDoc = isWordFile(file.path) && file.status !== "deleted";
          return (
            <li key={file.path} className="row static">
              <span className={`status-letter ${file.status}`}>{STATUS_LETTER[file.status]}</span>
              <span className="row-main" title={file.path}>{name}</span>
              {dir && <span className="row-dim">{dir}</span>}
              {isDoc && (
                <button
                  className="icon-button"
                  aria-label="Show what changed in this commit"
                  title="Show what changed in this commit"
                  onClick={() => void compare(file.path, row.parents[0] ?? null, row.id)}
                >
                  <GitCompareArrows size={14} />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
