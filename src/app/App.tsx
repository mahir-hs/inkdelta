// The application shell. It only wires things together:
// stores hold the state, panels draw it, layout.ts arranges them.

import { DockviewReact, type DockviewReadyEvent } from "dockview-react";
import { useCallback, useEffect, useRef } from "react";
import { api } from "../api/commands";
import { useGit } from "../store/git";
import { useReview } from "../store/review";
import { useUi } from "../store/ui";
import { useWorkspace } from "../store/workspace";
import { useZoom } from "../store/zoom";
import { LayoutDialog } from "../features/layout/LayoutDialog";
import { AiDialogs } from "../features/ai/AiDialogs";
import { UpdateHost } from "../features/updates/UpdateHost";
import { useUpdater } from "../store/updater";
import { AppearanceDialog } from "../features/appearance/AppearanceDialog";
import { ConflictResolver } from "../features/conflicts/ConflictResolver";
import { DialogHost } from "../ui/DialogHost";
import { MenuHost } from "../ui/MenuHost";
import { Toasts } from "../ui/Toasts";
import { ActivityBar } from "./ActivityBar";
import { CommandPalette } from "./CommandPalette";
import { stepChange } from "./commands";
import { buildDefaultLayout, DOCK_THEME, restoreLayout, saveLayout, useLayout } from "./layout";
import { panelComponents } from "./panels";
import { StatusBar } from "./StatusBar";
import { TitleBar } from "./TitleBar";

export default function App() {
  const repoRoot = useWorkspace((s) => s.repo?.root ?? null);
  const loose = useWorkspace((s) => s.loose);
  const saveTimer = useRef<number | undefined>(undefined);

  // ---- dock layout: restore the user's arrangement, or build the default one
  const onReady = useCallback((event: DockviewReadyEvent) => {
    const dock = event.api;
    useLayout.getState().setApi(dock);
    if (!restoreLayout(dock)) buildDefaultLayout(dock);

    dock.onDidActivePanelChange((event) => {
      useLayout.getState().setActive(event?.panel?.id ?? null);
      useLayout.getState().refreshVisible();
    });
    useLayout.getState().refreshVisible();
    dock.onDidLayoutChange(() => {
      useLayout.getState().refreshVisible();
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => saveLayout(dock), 300);
    });
  }, []);

  // ---- open a folder passed on the command line (inkdelta <folder>)
  useEffect(() => {
    api
      .startupPath()
      .then((path) => {
        if (path) void useWorkspace.getState().openPath(path);
      })
      .catch(() => undefined);
  }, []);

  // ---- when the project changes, load its Git state and review progress
  useEffect(() => {
    useGit.getState().clear();
    void useReview.getState().load(repoRoot);
    if (repoRoot) void useGit.getState().refresh();
  }, [repoRoot]);

  // ---- the user may have saved in Word or committed elsewhere: refresh when the window is focused again
  useEffect(() => {
    const onFocus = () => {
      if (!useWorkspace.getState().repo || useGit.getState().busy) return;
      void useGit.getState().refresh();
      void useWorkspace.getState().refreshVersions();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  // ---- look for a new version in the background (it only ever ASKS; see store/updater.ts)
  useEffect(() => { void useUpdater.getState().init(); }, []);

  // ---- keyboard: F3 / Shift+F3 move between changes, Ctrl+K opens the command palette
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Inside the terminal every key belongs to the shell (Ctrl+K, Ctrl+-, ...).
      if ((e.target as Element | null)?.closest?.(".terminal-host")) return;
      const mod = (e.ctrlKey || e.metaKey) && !e.altKey;
      if (mod && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        useZoom.getState().zoomIn();
      } else if (mod && (e.key === "-" || e.key === "_")) {
        e.preventDefault();
        useZoom.getState().zoomOut();
      } else if (mod && e.key === "0") {
        e.preventDefault();
        useZoom.getState().reset();
      } else if (e.key === "F3") {
        e.preventDefault();
        stepChange(e.shiftKey ? -1 : 1);
      } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "k" || (e.shiftKey && e.key.toLowerCase() === "p"))) {
        e.preventDefault();
        useUi.getState().setPaletteOpen(true);
      }
    };
    // Ctrl + scroll wheel zooms too.
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      if (e.deltaY < 0) useZoom.getState().zoomIn();
      else if (e.deltaY > 0) useZoom.getState().zoomOut();
    };
    useZoom.getState().restore();
    window.addEventListener("keydown", onKey);
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("wheel", onWheel);
    };
  }, []);

  return (
    <div className="app">
      <TitleBar />
      <div className="body">
        <ActivityBar />
        <main className="dock-host" data-loose={loose ? "true" : undefined}>
          <DockviewReact theme={DOCK_THEME} components={panelComponents} onReady={onReady} />
        </main>
      </div>
      <StatusBar />

      <LayoutDialog />
      <AiDialogs />
      <AppearanceDialog />
      <UpdateHost />
      <ConflictResolver />
      <DialogHost />
      <MenuHost />
      <CommandPalette />
      <Toasts />
    </div>
  );
}
