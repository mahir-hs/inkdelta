// Message box and the Commit button.

import { useEffect, useState } from "react";
import { useGit } from "../../store/git";

interface Props {
  stagedCount: number;
  hasChanges: boolean;
  /** A merge is open: committing finishes it, even if nothing new is staged. */
  merging: boolean;
  /** The message Git prepared for the merge commit. */
  mergeMessage: string | null;
  /** Conflicts are still unresolved: committing is not possible yet. */
  blocked: boolean;
}

export function CommitBox({ stagedCount, hasChanges, merging, mergeMessage, blocked }: Props) {
  const [message, setMessage] = useState("");
  const [amend, setAmend] = useState(false);
  const busy = useGit((s) => s.busy);

  // When a merge needs finishing, start from the message Git prepared.
  useEffect(() => {
    if (merging && mergeMessage) setMessage((current) => current || mergeMessage);
  }, [merging, mergeMessage]);

  const hasWork = stagedCount > 0 || amend || merging;
  const ready = hasWork && !blocked && (message.trim().length > 0 || amend);

  async function commit() {
    if (!ready || busy) return;
    if (await useGit.getState().commit(message, amend)) {
      setMessage("");
      setAmend(false);
    }
  }

  const hint = blocked
    ? "Resolve the conflicts first"
    : !hasChanges && !amend && !merging
      ? "Nothing to commit"
      : stagedCount === 0 && !amend && !merging
        ? "Stage changes to commit them"
        : "";

  const label = amend ? "Amend" : merging ? "Commit merge" : `Commit${stagedCount ? ` ${stagedCount} file${stagedCount === 1 ? "" : "s"}` : ""}`;

  return (
    <div className="commit-box">
      <textarea
        value={message}
        rows={3}
        placeholder={amend ? "New message (leave empty to keep the old one)" : "Message  (Ctrl+Enter to commit)"}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === "Enter") void commit();
        }}
      />
      <div className="commit-actions">
        <label className="check-inline">
          <input type="checkbox" checked={amend} disabled={merging} onChange={(e) => setAmend(e.target.checked)} />
          Amend last commit
        </label>
        <span className="spacer" />
        <button className="primary" disabled={!ready || !!busy} title={hint} onClick={() => void commit()}>{label}</button>
      </div>
      {hint && <p className="section-empty">{hint}</p>}
    </div>
  );
}
