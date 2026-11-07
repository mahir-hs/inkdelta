// The Terminal panel: a real shell opened in the project folder, so `claude` or `codex` can be run interactively.
// The screen and the shell live in session.ts, so switching tabs does not end them.

import { Play, RotateCcw } from "lucide-react";
import { useEffect, useRef } from "react";
import { useWorkspace } from "../../store/workspace";
import { attachTerminal, fitTerminal, startShell, typeIntoTerminal, useTerminalStatus } from "./session";

export function TerminalPanel() {
  const root = useWorkspace((s) => s.repo?.root ?? null);
  const status = useTerminalStatus();
  const box = useRef<HTMLDivElement>(null);

  // Show the screen here, start the shell on first use, and keep it fitted to the panel.
  useEffect(() => {
    const element = box.current;
    if (!element || !root) return;
    void attachTerminal(element, root);
    const observer = new ResizeObserver(() => fitTerminal());
    observer.observe(element);
    return () => observer.disconnect();
  }, [root]);

  if (!root) return <p className="section-empty">Open a project folder to start a terminal in it.</p>;

  const elsewhere = status.state !== "none" && status.cwd !== root;
  return (
    <div className="terminal-panel">
      <div className="terminal-bar">
        <span className="terminal-cwd" title={status.cwd || root}>{status.cwd || root}</span>
        <button className="quiet" onClick={() => typeIntoTerminal("claude\r")} title="Type claude and press Enter">
          <Play size={13} /> Claude Code
        </button>
        <button className="quiet" onClick={() => typeIntoTerminal("codex\r")} title="Type codex and press Enter">
          <Play size={13} /> Codex
        </button>
        <button className={elsewhere || status.state === "ended" ? "primary" : "quiet"} onClick={() => void startShell(root)} title="Start a new shell in the project folder">
          <RotateCcw size={13} /> Restart{elsewhere ? " here" : ""}
        </button>
      </div>
      <div className="terminal-box" ref={box} />
    </div>
  );
}
