// The AI assistant's two dialogs: connection settings, and one comment's suggestion (confirm, wait, review).

import { Sparkles } from "lucide-react";
import { useState } from "react";
import { PRESETS, useAi } from "../../store/ai";

export function AiDialogs() {
  const settingsOpen = useAi((s) => s.settingsOpen);
  const suggestion = useAi((s) => s.suggestion);
  return (
    <>
      {settingsOpen && <Settings />}
      {suggestion && <SuggestionDialog />}
    </>
  );
}

function Settings() {
  const { config, setConfig, usePreset, openSettings, test } = useAi();
  const preset = PRESETS.find((p) => p.id === config.preset);
  const [message, setMessage] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const close = () => openSettings(false);

  return (
    <div className="scrim" onMouseDown={close}>
      <div className="dialog ai-dialog" role="dialog" aria-modal="true" aria-label="AI assistant" onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === "Escape" && close()}>
        <h2><Sparkles size={16} /> AI assistant</h2>
        <p>Suggests edits for a reviewer comment. You approve every change, and nothing is sent until you confirm it for each comment.</p>

        <label className="field-row">
          <span>Service</span>
          <select value={config.preset} onChange={(e) => { usePreset(e.target.value); setMessage(null); }}>
            <option value="">Choose…</option>
            {PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>
        {preset && <p className="ai-note">{preset.note}</p>}

        {config.kind === "cli" && config.preset && (
          <label className="field-row"><span>Command</span><input value={config.command} onChange={(e) => setConfig({ command: e.target.value })} placeholder="claude -p" /></label>
        )}
        {config.kind !== "cli" && config.preset && (
          <>
            {config.preset !== "anthropic" && <label className="field-row"><span>Address</span><input value={config.baseUrl} onChange={(e) => setConfig({ baseUrl: e.target.value })} /></label>}
            <label className="field-row"><span>Model</span><input value={config.model} onChange={(e) => setConfig({ model: e.target.value })} /></label>
            {config.preset !== "ollama" && (
              <label className="field-row"><span>API key</span><input type="password" value={config.apiKey} onChange={(e) => setConfig({ apiKey: e.target.value })} placeholder="stored on this computer only" /></label>
            )}
          </>
        )}
        {message && <p className="ai-note">{message}</p>}

        <div className="dialog-actions">
          <button disabled={!config.preset || testing} onClick={async () => { setTesting(true); setMessage("Testing…"); setMessage(await test()); setTesting(false); }}>Test connection</button>
          <button className="primary" onClick={close}>Done</button>
        </div>
      </div>
    </div>
  );
}

function SuggestionDialog() {
  const { suggestion: s, config, send, toggle, apply, close } = useAi();
  if (!s) return null;
  const provider = config.kind === "cli" ? `the command “${config.command}”` : config.preset === "ollama" ? "Ollama on this computer" : config.baseUrl;
  const sizeChars = s.candidates.reduce((n, c) => n + c.text.length, s.comment.length);

  return (
    <div className="scrim" onMouseDown={() => s.phase !== "working" && close()}>
      <div className="dialog ai-dialog wide" role="dialog" aria-modal="true" aria-label="AI suggestion" onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.key === "Escape" && s.phase !== "working" && close()}>
        <h2><Sparkles size={16} /> Suggest edits for this comment</h2>
        <p className="ai-comment">{s.comment}</p>

        {s.phase === "confirm" && (
          <>
            <p>This will send the comment and <b>{s.candidates.length} paragraphs</b> of your manuscript (about {sizeChars.toLocaleString()} characters) to <b>{provider}</b>:</p>
            <ul className="ai-sent">{s.candidates.map((c) => <li key={c.position}>{c.text.slice(0, 110)}…</li>)}</ul>
            <div className="dialog-actions"><button onClick={close}>Cancel</button><button className="primary" onClick={() => void send()}>Send</button></div>
          </>
        )}

        {s.phase === "working" && <p className="muted">Asking the AI… this can take a minute.</p>}

        {s.phase === "error" && (
          <>
            <p className="error">{s.error}</p>
            <div className="dialog-actions"><button onClick={close}>Close</button><button className="primary" onClick={() => void send()}>Try again</button></div>
          </>
        )}

        {s.phase === "result" && s.result && (
          <>
            {s.result.summary && <p>{s.result.summary}</p>}
            {s.result.edits.length === 0 && <p className="muted">The AI proposed no paragraph edits.</p>}
            <div className="ai-edits">
              {s.result.edits.map((e) => (
                <label key={e.position} className={`ai-edit${s.chosen.has(e.position) ? " on" : ""}`}>
                  <input type="checkbox" checked={s.chosen.has(e.position)} onChange={() => toggle(e.position)} />
                  <span>
                    {e.why && <small>{e.why}</small>}
                    <del>{e.oldText}</del>
                    <ins>{e.newText}</ins>
                  </span>
                </label>
              ))}
            </div>
            {s.result.manual.length > 0 && (
              <div className="ai-manual"><b>You still need to:</b><ul>{s.result.manual.map((m, i) => <li key={i}>{m}</li>)}</ul></div>
            )}
            <div className="dialog-actions">
              <button onClick={close}>Discard</button>
              <button className="primary" disabled={s.chosen.size === 0} onClick={apply}>Add {s.chosen.size} edit{s.chosen.size === 1 ? "" : "s"} to the document</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
