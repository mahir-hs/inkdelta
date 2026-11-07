// The "Ask AI" chat panel: ask anything, choose what the AI sees, and apply its proposed changes to the document.

import { Bot, Copy, Eraser, Send, Settings2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { contextFor, contextWindowFor, documentParagraphs, estimateTokens, sectionsOf, type Proposed, type Scope } from "./chat";
import { PRESETS, useAi } from "../../store/ai";
import { useChat, type ChatMessage } from "../../store/chat";
import { useReview } from "../../store/review";
import { useUi } from "../../store/ui";
import { useWorkspace } from "../../store/workspace";

type ScopeKind = Scope["kind"];

const SUGGESTIONS = [
  "Summarize this in three sentences.",
  "Make this clearer and more concise.",
  "Check this for unclear or unsupported claims.",
  "Write a short paragraph that follows this one.",
];

export function AskPanel() {
  const { config, isConfigured, openSettings, setConfig } = useAi();
  const { messages, busy, scope, draft, selected, allowEdits, setScope, setDraft, setAllowEdits, send, clear, preview } = useChat();
  const diff = useWorkspace((s) => s.diff);
  const comments = useReview((s) => s.comments);
  const items = useReview((s) => s.state.items);
  const ready = isConfigured();
  const service = PRESETS.find((p) => p.id === config.preset)?.label;
  const endRef = useRef<HTMLDivElement>(null);

  // A block body on purpose: newer Chromium returns a Promise from scrollIntoView, and React would take it for a cleanup function.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, busy]);

  const sections = useMemo(() => sectionsOf(documentParagraphs()), [diff]); // eslint-disable-line react-hooks/exhaustive-deps
  const openComments = comments.filter((c) => items[c.id]?.status !== "done" && items[c.id]?.status !== "skipped");
  const context = contextFor(scope, selected);
  const sentPreview = preview();
  // Claude Code gets a model list and an effort setting; other services just have a model name.
  const isClaudeCli = config.kind === "cli" && /^claude(\.cmd|\.exe)?(\s|$)/i.test(config.command.trim());
  const tokens = estimateTokens(sentPreview);
  const windowTokens = contextWindowFor(config.model);
  const percent = (tokens / windowTokens) * 100;

  const chooseKind = (kind: ScopeKind) => {
    if (kind === "section") setScope({ kind, heading: sections[0]?.position ?? -1 });
    else if (kind === "comment") setScope(openComments[0] ? { kind, id: openComments[0].id, text: openComments[0].text } : { kind: "none" });
    else setScope({ kind } as Scope);
  };

  return (
    <div className="ask-panel">
      <div className="ask-head">
        <Bot size={15} />
        <span className="ask-service">{ready ? service : "No AI service chosen"}</span>
        <button className="quiet" onClick={() => openSettings(true)} title="AI service and keys"><Settings2 size={14} /> {ready ? "Change" : "Set up"}</button>
        <button className="quiet" disabled={messages.length === 0} onClick={clear} title="Clear this conversation"><Eraser size={14} /> Clear</button>
      </div>

      <div className="ask-messages">
        {messages.length === 0 && (
          <div className="ask-empty">
            <p>Ask anything about your document, or ask for changes. You choose what the AI can see; nothing is sent until you press Send.</p>
            <p className="ask-note">This chat is kept only while the app is open. Inkdelta saves no prompts or answers.</p>
            <div className="ask-chips">
              {SUGGESTIONS.map((s) => <button key={s} className="quiet" onClick={() => setDraft(s)}>{s}</button>)}
            </div>
          </div>
        )}
        {messages.map((m) => <Message key={m.id} message={m} />)}
        {busy && <div className="ask-msg assistant"><span className="ask-thinking">Thinking…</span></div>}
        <div ref={endRef} />
      </div>

      <div className="ask-composer">
        <div className="ask-scope">
          <label>
            <span>AI sees</span>
            <select value={scope.kind} onChange={(e) => chooseKind(e.target.value as ScopeKind)}>
              <option value="selection">Selected text{selected.length > 0 ? ` (${selected.length})` : ""}</option>
              <option value="section">A section</option>
              <option value="document">The whole document</option>
              <option value="comment" disabled={openComments.length === 0}>A review comment</option>
              <option value="none">Nothing from the document</option>
            </select>
          </label>
          {scope.kind === "section" && (
            <select value={scope.heading} onChange={(e) => setScope({ kind: "section", heading: Number(e.target.value) })} aria-label="Section">
              {sections.map((s) => <option key={s.position} value={s.position}>{" ".repeat(Math.max(0, s.level - 1))}{s.title}</option>)}
            </select>
          )}
          {scope.kind === "comment" && (
            <select value={scope.id} onChange={(e) => { const c = openComments.find((x) => x.id === e.target.value); if (c) setScope({ kind: "comment", id: c.id, text: c.text }); }} aria-label="Review comment">
              {openComments.map((c) => <option key={c.id} value={c.id}>{c.text.slice(0, 70)}</option>)}
            </select>
          )}
        </div>
        {scope.kind === "selection" && selected.length === 0 && <p className="ask-note">Select text in the document, then ask.</p>}

        <div className="ask-model">
          {isClaudeCli ? (
            <>
              <label><span>Model</span>
                <select value={config.model} onChange={(e) => setConfig({ model: e.target.value })}>
                  <option value="">Default</option>
                  <option value="opus">Opus</option>
                  <option value="sonnet">Sonnet</option>
                  <option value="haiku">Haiku</option>
                  {!["", "opus", "sonnet", "haiku"].includes(config.model) && <option value={config.model}>{config.model}</option>}
                </select>
              </label>
              <label><span>Effort</span>
                <select value={config.effort} onChange={(e) => setConfig({ effort: e.target.value })}>
                  <option value="">Default</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="xhigh">Extra high</option>
                  <option value="max">Max</option>
                </select>
              </label>
            </>
          ) : config.kind !== "cli" ? (
            <label><span>Model</span><input value={config.model} onChange={(e) => setConfig({ model: e.target.value })} /></label>
          ) : null}
        </div>
        <label className="ask-edits" title="Adds a short set of instructions (about 300 tokens) so the AI can answer with changes the app can apply. Off: the AI just chats.">
          <input type="checkbox" checked={allowEdits} onChange={(e) => setAllowEdits(e.target.checked)} />
          Let the AI propose document changes
        </label>
        <div className="ask-meter" title="Estimate for the next message: about 4 characters per token. Claude Code adds some of its own on top.">
          <div className="ask-meter-bar"><div className={percent > 70 ? "hot" : ""} style={{ width: `${Math.min(100, Math.max(percent, 0.5))}%` }} /></div>
          <span>Context ≈ {percent < 1 ? "<1" : Math.round(percent)}% · ~{tokens.toLocaleString()} of {(windowTokens / 1000).toLocaleString()}k tokens (estimate)</span>
        </div>

        <textarea
          value={draft}
          rows={3}
          placeholder="Ask or instruct… (Ctrl+Enter to send)"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void send(); } }}
        />
        <div className="ask-send">
          <details className="ask-preview">
            <summary>Exactly what will be sent ({(sentPreview.system.length + sentPreview.user.length).toLocaleString()} characters · {context.label})</summary>
            <pre>{[sentPreview.system, sentPreview.user].filter(Boolean).join("\n\n")}</pre>
          </details>
          <button className="primary" disabled={!draft.trim() || busy} onClick={() => void send()}><Send size={14} /> Send</button>
        </div>
      </div>
    </div>
  );
}

function Message({ message }: { message: ChatMessage }) {
  const { toggle, apply } = useChat();
  const copy = () => navigator.clipboard?.writeText(message.text).then(() => useUi.getState().toast("success", "Copied"), () => {});

  if (message.role === "user") {
    return (
      <div className="ask-msg user">
        <p>{message.text}</p>
        {message.context && <small>AI saw: {message.context}</small>}
      </div>
    );
  }
  if (message.role === "error") return <div className="ask-msg error"><p>{message.text}</p></div>;

  const proposals = message.proposals ?? [];
  const picked = proposals.filter((p) => message.chosen?.has(p.key)).length;
  return (
    <div className="ask-msg assistant">
      {message.text && <p className="ask-text">{message.text}</p>}
      {proposals.length > 0 && (
        <div className="ai-edits">
          {proposals.map((p) => (
            <label key={p.key} className={`ai-edit${message.chosen?.has(p.key) ? " on" : ""}`}>
              <input type="checkbox" checked={!!message.chosen?.has(p.key)} disabled={message.applied} onChange={() => toggle(message.id, p.key)} />
              <div><Proposal proposal={p} /></div>
            </label>
          ))}
          <div className="ask-apply">
            <button className="primary" disabled={picked === 0 || message.applied} onClick={() => apply(message.id)}>
              {message.applied ? "Added to the document" : `Add ${picked} change${picked === 1 ? "" : "s"} to the document`}
            </button>
            <span className="ask-note">They appear in the document; you review and Save there.</span>
          </div>
        </div>
      )}
      {(message.ignored ?? 0) > 0 && <p className="ask-note">{message.ignored} suggestion{message.ignored === 1 ? " was" : "s were"} ignored: they pointed at text the AI was not given or that cannot be edited.</p>}
      <button className="quiet ask-copy" onClick={copy} title="Copy the answer"><Copy size={13} /> Copy</button>
    </div>
  );
}

function Proposal({ proposal: p }: { proposal: Proposed }) {
  const why = p.why ? <small>{p.why}</small> : null;
  if (p.kind === "edit") return <><small>Reword paragraph {p.position}</small><del>{p.oldText.trim()}</del><ins>{p.newText.trim()}</ins>{why}</>;
  if (p.kind === "insert") return <><small>New paragraph after paragraph {p.after}</small><ins>{p.text}</ins>{why}</>;
  return <><small>Remove paragraph {p.position}</small><del>{p.oldText.trim()}</del>{why}</>;
}
