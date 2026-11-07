// Source control: branch and sync, commit box, changed files, stashes, branches.
// Works like the Source Control view in VS Code.

import { ChevronDown, ChevronRight, CloudUpload, Ellipsis, GitBranch, GitMerge, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { BranchInfo } from "../../api/gitTypes";
import { relativeTime } from "../../lib/format";
import { useGit } from "../../store/git";
import { useUi, type MenuItem } from "../../store/ui";
import { useWorkspace } from "../../store/workspace";
import { BranchChip } from "./BranchChip";
import { CommitBox } from "./CommitBox";
import { FileRow } from "./FileRow";
import { moreActions } from "./moreActions";
import { newBranchPrompt, stashPrompt } from "./prompts";

export function SourceControlPanel() {
  const repo = useWorkspace((s) => s.repo);
  const { status, branches, stashes, busy, tool } = useGit();
  const git = useGit.getState;
  const openMenuBelow = useUi((s) => s.openMenuBelow);

  if (!repo) return <div className="empty-panel"><p>Open a project to use Git.</p></div>;
  if (!status) return <div className="empty-panel"><p className="muted">Reading repository…</p></div>;

  const conflicts = status.files.filter((f) => f.status === "conflicted");
  const staged = status.files.filter((f) => f.staged);
  const changes = status.files.filter((f) => !f.staged && f.status !== "conflicted");
  const canSync = !!tool?.available;
  const needsPublish = !status.upstream && status.hasCommits;

  return (
    <div className="panel-scroll scm">
      <div className="scm-bar">
        <BranchChip />
        <span className="spacer" />
        <button className="icon-button" title="Fetch" aria-label="Fetch" disabled={!!busy || !canSync} onClick={() => void git().fetch()}>
          <RefreshCw size={15} className={busy === "Fetch" ? "spin" : ""} />
        </button>
        {needsPublish ? (
          <button className="quiet" disabled={!!busy || !canSync} onClick={() => void git().push()} title="Publish this branch to the server">
            <CloudUpload size={15} /> Publish
          </button>
        ) : (
          <>
            <button className="quiet sync" disabled={!!busy || !canSync || !status.upstream} onClick={() => void git().pull("merge")} title={`Pull ${status.behind} commit${status.behind === 1 ? "" : "s"}`}>
              ↓ {status.behind}
            </button>
            <button className="quiet sync" disabled={!!busy || !canSync || !status.upstream} onClick={() => void git().push()} title={`Push ${status.ahead} commit${status.ahead === 1 ? "" : "s"}`}>
              ↑ {status.ahead}
            </button>
          </>
        )}
        <button className="icon-button" aria-label="More actions" onClick={(e) => openMenuBelow(e.currentTarget, moreActions())}>
          <Ellipsis size={16} />
        </button>
      </div>

      {tool && !tool.available && (
        <p className="notice-inline">Git is not installed, so pull and push are off. Install it from git-scm.com. Everything else works.</p>
      )}

      {status.merging && (
        <div className="notice-inline warn">
          <span>
            <strong>Merge in progress.</strong>{" "}
            {conflicts.length > 0
              ? `${conflicts.length} file${conflicts.length === 1 ? " has" : "s have"} conflicts to resolve.`
              : "All conflicts are resolved. Commit to finish the merge."}
          </span>
          <button className="quiet" onClick={() => void git().abortMerge()}>Abort merge</button>
        </div>
      )}

      <CommitBox stagedCount={staged.length} hasChanges={status.files.length > 0} merging={status.merging} mergeMessage={status.mergeMessage} blocked={conflicts.length > 0} />

      {conflicts.length > 0 && (
        <Section title="Merge conflicts" count={conflicts.length}>
          {conflicts.map((c) => <FileRow key={`c-${c.path}`} change={c} />)}
        </Section>
      )}

      <Section
        title="Staged changes"
        count={staged.length}
        actions={staged.length > 0 && <button className="quiet" onClick={() => void git().unstage([])}>Unstage all</button>}
      >
        {staged.length === 0 ? <p className="section-empty">Nothing staged.</p> : staged.map((c) => <FileRow key={`s-${c.path}`} change={c} />)}
      </Section>

      <Section
        title="Changes"
        count={changes.length}
        actions={changes.length > 0 && <button className="quiet" onClick={() => void git().stage([])}>Stage all</button>}
      >
        {changes.length === 0 ? (
          <p className="section-empty">{status.files.length === 0 ? "Everything is committed." : "All changes are staged."}</p>
        ) : (
          changes.map((c) => <FileRow key={`w-${c.path}`} change={c} />)
        )}
      </Section>

      <Section
        title="Stashes"
        count={stashes.length}
        defaultOpen={stashes.length > 0}
        actions={<button className="icon-button" title="Stash changes" aria-label="Stash changes" onClick={() => void stashPrompt()}><Plus size={15} /></button>}
      >
        {stashes.length === 0 ? (
          <p className="section-empty">Stash puts unfinished work aside so you can switch branches cleanly.</p>
        ) : (
          stashes.map((s) => (
            <div className="row static" key={s.index}>
              <span className="row-main" title={s.message}>{s.message}</span>
              <span className="row-actions">
                <button className="quiet" onClick={() => void git().stashPop(s.index)} title="Apply and remove from the list">Pop</button>
                <button className="quiet" onClick={() => void git().stashApply(s.index)} title="Apply and keep in the list">Apply</button>
                <button className="icon-button danger" aria-label="Delete stash" onClick={() => void git().stashDrop(s.index)}><Trash2 size={14} /></button>
              </span>
            </div>
          ))
        )}
      </Section>

      <Section
        title="Branches"
        count={branches.filter((b) => !b.isRemote).length}
        defaultOpen={false}
        actions={<button className="icon-button" title="New branch" aria-label="New branch" onClick={() => void newBranchPrompt()}><Plus size={15} /></button>}
      >
        {branches.map((b) => <BranchRow key={`${b.isRemote}-${b.name}`} branch={b} />)}
      </Section>
    </div>
  );
}

function BranchRow({ branch }: { branch: BranchInfo }) {
  const git = useGit.getState;
  const items = (): MenuItem[] => [
    { label: branch.isCurrent ? "Current branch" : `Switch to ${branch.name}`, disabled: branch.isCurrent, onSelect: () => void git().checkout(branch.name) },
    { label: "Merge into current branch", disabled: branch.isCurrent, onSelect: () => void git().merge(branch.name) },
    ...(!branch.isRemote ? [{ label: "Delete branch…", danger: true, disabled: branch.isCurrent, separator: true, onSelect: () => void git().deleteBranch(branch.name) }] : []),
  ];
  return (
    <div className={`row${branch.isCurrent ? " active" : ""}`} onDoubleClick={() => !branch.isCurrent && void git().checkout(branch.name)} onContextMenu={(e) => { e.preventDefault(); useUi.getState().openMenu(e.clientX, e.clientY, items()); }}>
      {branch.isRemote ? <CloudUpload size={14} className="row-icon" /> : <GitBranch size={14} className="row-icon" />}
      <span className="row-main">{branch.name}</span>
      {(branch.ahead > 0 || branch.behind > 0) && <span className="row-dim">↑{branch.ahead} ↓{branch.behind}</span>}
      <span className="row-dim">{relativeTime(branch.time)}</span>
      <span className="row-actions">
        {!branch.isCurrent && <button className="icon-button" aria-label={`Merge ${branch.name}`} title="Merge into current branch" onClick={() => void git().merge(branch.name)}><GitMerge size={14} /></button>}
        <button className="icon-button" aria-label="Branch actions" onClick={(e) => useUi.getState().openMenuBelow(e.currentTarget, items())}><Ellipsis size={14} /></button>
      </span>
    </div>
  );
}

function Section(props: { title: string; count: number; defaultOpen?: boolean; actions?: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(props.defaultOpen ?? true);

  // A section that was empty opens by itself when its first item arrives (for example the first stash).
  const previousCount = useRef(props.count);
  useEffect(() => {
    if (previousCount.current === 0 && props.count > 0) setOpen(true);
    previousCount.current = props.count;
  }, [props.count]);

  return (
    <section className="scm-section">
      <header>
        <button className="section-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span>{props.title}</span>
          <span className="count">{props.count}</span>
        </button>
        <span className="section-actions">{props.actions}</span>
      </header>
      {open && <div className="section-body">{props.children}</div>}
    </section>
  );
}
