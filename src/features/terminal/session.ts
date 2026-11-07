// The one terminal of the app, kept alive outside React.
//
// Dockview unmounts a panel when its tab is hidden, but a shell running `claude` must not die when the
// user looks at another tab. So the xterm screen and the shell live here; the panel only attaches the
// screen to its own box (see TerminalPanel.tsx) and detaches it again.

import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { create } from "zustand";
import { api, errorMessage } from "../../api/commands";
import { useGit } from "../../store/git";

interface TerminalStatus {
  state: "none" | "running" | "ended" | "error";
  /** The folder the shell was started in. */
  cwd: string;
  error?: string;
}

export const useTerminalStatus = create<TerminalStatus>(() => ({ state: "none", cwd: "" }));

interface Live {
  term: Terminal;
  fit: FitAddon;
  host: HTMLDivElement;
  id: number | null;
  opened: boolean;
}

let live: Live | null = null;
let refreshTimer: number | undefined;

/** Colours of the xterm screen follow the app theme (CSS tokens). */
function themeFromCss() {
  const css = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return {
    background: read("--pane", "#121318"),
    foreground: read("--text", "#ededf0"),
    cursor: read("--accent", "#8f9bff"),
    selectionBackground: read("--accent-soft", "rgba(143,155,255,.3)"),
  };
}

new MutationObserver(() => {
  if (live) live.term.options.theme = themeFromCss();
}).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-mode", "data-accent"] });

/** A shell may change files (an AI tool editing, git commands): look at the project again once it has gone quiet. */
function refreshSoon() {
  window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(() => {
    if (!useGit.getState().busy) void useGit.getState().refresh();
  }, 1500);
}

function create_(): Live {
  const term = new Terminal({
    fontFamily: getComputedStyle(document.documentElement).getPropertyValue("--font-mono") || "monospace",
    fontSize: 13,
    cursorBlink: true,
    scrollback: 5000,
    theme: themeFromCss(),
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  const host = document.createElement("div");
  host.className = "terminal-host";
  // Ctrl+C copies when text is selected (like Windows Terminal); otherwise it is sent to the shell as usual.
  term.attachCustomKeyEventHandler((e) => {
    if (e.type === "keydown" && e.ctrlKey && e.key.toLowerCase() === "c" && (term.hasSelection() || e.shiftKey)) {
      void navigator.clipboard?.writeText(term.getSelection());
      return false;
    }
    return true;
  });
  const session: Live = { term, fit, host, id: null, opened: false };
  // The keyboard and size always talk to whichever shell is current.
  term.onData((data) => session.id !== null && void api.terminalWrite(session.id, data).catch(() => {}));
  term.onResize(({ cols, rows }) => session.id !== null && void api.terminalResize(session.id, cols, rows).catch(() => {}));
  return session;
}

/** Make the screen fit its box. Does nothing while the box is hidden or has no size. */
export function fitTerminal() {
  if (!live || !live.opened || live.host.offsetWidth === 0 || live.host.offsetHeight === 0) return;
  try {
    live.fit.fit();
  } catch { /* the box was just removed */ }
}

/** Put the screen into `container` (and start a shell in `cwd` if none is running yet). */
export async function attachTerminal(container: HTMLElement, cwd: string) {
  const fresh = live === null;
  if (!live) live = create_();
  container.appendChild(live.host);
  if (!live.opened) {
    live.term.open(live.host);
    live.opened = true;
  }
  fitTerminal();
  live.term.focus();
  if (fresh) await startShell(cwd);
}

/** Start (or restart) the shell in `cwd`, keeping the same screen. */
export async function startShell(cwd: string) {
  if (!live) return;
  const session = live;
  if (session.id !== null) void api.terminalClose(session.id);
  session.id = null;
  session.term.reset();
  fitTerminal();
  useTerminalStatus.setState({ state: "running", cwd, error: undefined });
  try {
    const id = await api.terminalStart(
      cwd,
      session.term.cols,
      session.term.rows,
      (bytes) => {
        session.term.write(bytes);
        refreshSoon();
      },
      () => {
        if (session.id === null) return; // an old shell ending after a restart
        void api.terminalClose(session.id);
        session.id = null;
        session.term.write("\r\n\x1b[2m[The shell has ended. Use Restart to open a new one.]\x1b[0m\r\n");
        useTerminalStatus.setState({ state: "ended" });
      },
    );
    session.id = id;
  } catch (e) {
    session.term.write(`\r\n\x1b[31m${errorMessage(e)}\x1b[0m\r\n`);
    useTerminalStatus.setState({ state: "error", error: errorMessage(e) });
  }
}

/** Type text into the running shell (used by the "Run Claude Code" buttons). */
export function typeIntoTerminal(text: string) {
  if (live?.id != null) void api.terminalWrite(live.id, text).catch(() => {});
  live?.term.focus();
}

export function focusTerminal() {
  live?.term.focus();
}
