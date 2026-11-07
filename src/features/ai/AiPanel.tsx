// The AI assistant panel: what it is, whether it is ready, and your open review comments with a button on each.

import { Sparkles } from "lucide-react";
import { PRESETS, useAi } from "../../store/ai";
import { useReview } from "../../store/review";
import { useWorkspace } from "../../store/workspace";

export function AiPanel() {
  const { config, isConfigured, openSettings, start, startNext } = useAi();
  const comments = useReview((s) => s.comments);
  const items = useReview((s) => s.state.items);
  const canEdit = useWorkspace((s) => !s.loose && s.newKey === "workdir");
  const ready = isConfigured();
  const service = PRESETS.find((p) => p.id === config.preset)?.label;
  const open = comments.filter((c) => items[c.id]?.status !== "done" && items[c.id]?.status !== "skipped");

  return (
    <div className="panel-scroll ai-panel">
      <section className="ai-status">
        <Sparkles size={18} />
        <div>
          <strong>{ready ? service : "Not set up yet"}</strong>
          <p>{ready ? "Ready. Nothing is sent until you confirm it." : "Choose a service: Claude, Codex, OpenRouter, Ollama or a command-line tool."}</p>
        </div>
        <button className={ready ? "" : "primary"} onClick={() => openSettings(true)}>{ready ? "Change" : "Set up"}</button>
      </section>

      <ol className="ai-steps">
        <li>Pick the reviewer's file in the <b>Review</b> panel.</li>
        <li>Open the <b>working copy</b> of your document.</li>
        <li>Press <b>Suggest edits</b> on a comment. You see what will be sent, then the proposed new wording.</li>
        <li>Tick the edits you accept. They become normal edits you can still change, then Save.</li>
      </ol>
      {!canEdit && <p className="notice-inline">Open the working copy (Documents, then Working copy) so suggested edits can be applied.</p>}

      <div className="ai-run">
        <button className="primary" disabled={!ready || open.length === 0} onClick={() => startNext()}>
          <Sparkles size={15} /> Suggest edits for the next open comment
        </button>
      </div>

      <div className="list-heading">{open.length} open comment{open.length === 1 ? "" : "s"}</div>
      <ul className="plain-list">
        {open.map((c) => (
          <li key={c.id}>
            <button className="row ai-comment-row" disabled={!ready} onClick={() => start(c.text, c.id)} title="Suggest edits for this comment">
              <Sparkles size={14} className="row-icon" />
              <span className="row-main">{c.text}</span>
            </button>
          </li>
        ))}
      </ul>
      {comments.length === 0 && <p className="section-empty">No review comments loaded. Pick the reviewer's file in the Review panel.</p>}
    </div>
  );
}
