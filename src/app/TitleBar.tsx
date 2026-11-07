// The window's title bar, drawn by the app (the native one is turned off for a cleaner look).
//
// Left: the brand and where you are (project, branch).  Centre: the command palette.
// Right: minimise / maximise / close on Windows and Linux. macOS keeps its own traffic lights.

import { getCurrentWindow } from "@tauri-apps/api/window";
import { ChevronRight, Command, Copy, Minus, Square, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useGit } from "../store/git";
import { useUi } from "../store/ui";
import { useWorkspace } from "../store/workspace";

export const IS_MAC = /Mac/i.test(navigator.userAgent);

export function TitleBar() {
  const repo = useWorkspace((s) => s.repo);
  const loose = useWorkspace((s) => s.loose);
  const branch = useGit((s) => s.status?.branch);
  const setPaletteOpen = useUi((s) => s.setPaletteOpen);

  return (
    <header className="titlebar" data-tauri-drag-region>
      <div className="titlebar-left" data-tauri-drag-region>
        {IS_MAC && <span className="traffic-space" />}
        <img className="brand-mark" src="/logo.svg" alt="" width={20} height={20} />
        <span className="brand-name">Inkdelta</span>
        {repo && (
          <span className="crumbs">
            <ChevronRight size={14} />
            <span className="crumb">{repo.name}</span>
            {branch && (
              <>
                <ChevronRight size={14} />
                <span className="crumb muted">{branch}</span>
              </>
            )}
          </span>
        )}
      </div>

      <button className="palette-trigger" onClick={() => setPaletteOpen(true)} aria-label="Open command palette">
        <Command size={14} />
        <span>{loose ? "Comparing two files" : "Search commands and branches"}</span>
        <kbd>Ctrl K</kbd>
      </button>

      <div className="titlebar-right" data-tauri-drag-region>{!IS_MAC && <WindowControls />}</div>
    </header>
  );
}

function WindowControls() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const win = getCurrentWindow();
    const sync = () => void win.isMaximized().then(setMaximized).catch(() => undefined);
    sync();
    const unlisten = win.onResized(sync);
    return () => void unlisten.then((off) => off());
  }, []);

  const win = getCurrentWindow();
  return (
    <div className="window-controls">
      <button aria-label="Minimise" onClick={() => void win.minimize()}><Minus size={16} /></button>
      <button aria-label={maximized ? "Restore" : "Maximise"} onClick={() => void win.toggleMaximize()}>
        {maximized ? <Copy size={13} /> : <Square size={12} />}
      </button>
      <button className="close" aria-label="Close" onClick={() => void win.close()}><X size={16} /></button>
    </div>
  );
}
