// The window's title bar, drawn by the app: brand, the menu bar (File, Git, View, AI), where you are,
// search, and the window buttons. Every feature is reachable from here without knowing a shortcut.

import { getCurrentWindow } from "@tauri-apps/api/window";
import { ChevronRight, Command, Copy, Minus, Sparkles, Square, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useAi } from "../store/ai";
import { useGit } from "../store/git";
import { useUi } from "../store/ui";
import { useWorkspace } from "../store/workspace";
import { aiMenu, fileMenu, gitMenu, openMenuFor, viewMenu } from "./menus";

export const IS_MAC = /Mac/i.test(navigator.userAgent);

export function TitleBar() {
  const repo = useWorkspace((s) => s.repo);
  const branch = useGit((s) => s.status?.branch);
  const aiReady = useAi((s) => s.config.preset !== "" && s.isConfigured());
  const setPaletteOpen = useUi((s) => s.setPaletteOpen);

  const menus: [string, () => ReturnType<typeof fileMenu>][] = [
    ["File", fileMenu],
    ["Git", gitMenu],
    ["View", viewMenu],
  ];

  return (
    <header className="titlebar" data-tauri-drag-region>
      {IS_MAC && <span className="traffic-space" />}
      <img className="brand-mark" src="/logo.svg" alt="" width={20} height={20} />
      <span className="brand-name">Inkdelta</span>

      <nav className="menubar" aria-label="Menu">
        {menus.map(([label, items]) => (
          <button key={label} className="menu-button" onClick={(e) => openMenuFor(e.currentTarget, items())}>{label}</button>
        ))}
        <button className={`menu-button ai-menu${aiReady ? "" : " setup"}`} onClick={(e) => openMenuFor(e.currentTarget, aiMenu())} title="AI assistant for review comments">
          <Sparkles size={14} /> AI{!aiReady && <small>set up</small>}
        </button>
      </nav>

      <span className="crumbs" data-tauri-drag-region>
        {repo && (
          <>
            <ChevronRight size={14} />
            <span className="crumb">{repo.name}</span>
            {branch && <span className="crumb muted">· {branch}</span>}
          </>
        )}
      </span>

      <span className="spacer" data-tauri-drag-region />
      <button className="icon-button" onClick={() => setPaletteOpen(true)} title="Search every command (Ctrl K)" aria-label="Search commands">
        <Command size={16} />
      </button>
      {!IS_MAC && <WindowControls />}
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
