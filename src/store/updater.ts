// Keeping the app up to date: look for a new version in the background, ASK before downloading, show the download's
// percentage and speed without getting in the way, and ASK again before installing (which restarts the app).
//
// Phases:  idle -> checking -> (upToDate | available) -> downloading -> ready -> installing
// Nothing is downloaded or installed unless the user says yes. The signature of every update is verified by the
// Rust plugin against the public key in tauri.conf.json before it can be installed.

import { create } from "zustand";
import { updaterApi, type DownloadEvent, type Update } from "../api/updater";
import { pendingCount, useDocEdits } from "./docEdits";
import { useUi } from "./ui";

export type UpdatePhase = "idle" | "checking" | "upToDate" | "available" | "downloading" | "ready" | "installing" | "error";

export interface UpdateInfo {
  version: string;
  notes: string;
  date: string | null;
}

export interface DownloadProgress {
  downloaded: number;
  /** Bytes in the whole file, when the server says. */
  total: number | null;
  /** Bytes per second, smoothed. */
  speed: number;
}

const AUTO_KEY = "inkdelta.autoUpdate";
const SKIP_KEY = "inkdelta.skipUpdate";
const FIRST_CHECK_DELAY = 10_000;          // let the app settle first
const CHECK_EVERY = 6 * 60 * 60 * 1000;    // and again every six hours while it stays open

const read = (key: string): string | null => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* ignore */ } };

interface UpdaterState {
  phase: UpdatePhase;
  currentVersion: string;
  info: UpdateInfo | null;
  progress: DownloadProgress;
  error: string | null;
  lastChecked: number | null;
  /** The small "update available" / "ready to install" card at the bottom right. */
  cardOpen: boolean;
  /** The details window (File > Check for updates). */
  dialogOpen: boolean;
  autoCheck: boolean;

  /** Start the background schedule. Call once when the app starts. */
  init: () => Promise<void>;
  /** Look for an update. `silent` = the automatic check: no error messages, and no card for a version the user skipped. */
  check: (silent: boolean) => Promise<void>;
  /** The "Check for updates" buttons: opens the details window and checks. */
  checkNow: () => Promise<void>;
  download: () => Promise<void>;
  install: () => Promise<void>;
  later: () => void;
  skipVersion: () => void;
  setAutoCheck: (on: boolean) => void;
  openDialog: (open: boolean) => void;
}

const EMPTY_PROGRESS: DownloadProgress = { downloaded: 0, total: null, speed: 0 };

/** The plugin's update object cannot live in the store (it is not plain data). */
let pending: Update | null = null;
let started = false;

export const useUpdater = create<UpdaterState>((set, get) => ({
  phase: "idle",
  currentVersion: "",
  info: null,
  progress: EMPTY_PROGRESS,
  error: null,
  lastChecked: null,
  cardOpen: false,
  dialogOpen: false,
  autoCheck: read(AUTO_KEY) !== "0",

  init: async () => {
    if (started) return;
    started = true;
    try { set({ currentVersion: await updaterApi.version() }); } catch { /* not running inside the app (browser preview) */ }
    if (typeof window === "undefined" || !(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__) return;
    const tick = () => { if (get().autoCheck) void get().check(true); };
    window.setTimeout(tick, FIRST_CHECK_DELAY);
    window.setInterval(tick, CHECK_EVERY);
  },

  check: async (silent) => {
    const { phase } = get();
    if (phase === "checking" || phase === "downloading" || phase === "installing") return;
    // Already found one and waiting for an answer or an install: nothing new to look for.
    if (silent && (phase === "available" || phase === "ready")) return;
    // An update that is already downloaded stays ready: a manual check just shows it again.
    if (phase === "ready") { set({ dialogOpen: !silent }); return; }
    set({ phase: "checking", error: null });
    try {
      const update = await updaterApi.check();
      set({ lastChecked: Date.now() });
      if (!update) {
        pending = null;
        set({ phase: "upToDate", info: null });
        return;
      }
      pending = update;
      const info: UpdateInfo = { version: update.version, notes: update.body ?? "", date: update.date ?? null };
      const skipped = read(SKIP_KEY) === update.version;
      set({ phase: "available", info });
      // Ask: automatically only for a version the user has not skipped; always when they pressed the button.
      if (!silent) set({ dialogOpen: true });
      else if (!skipped) set({ cardOpen: true });
    } catch (e) {
      // The automatic check stays quiet when offline; a button press explains. A found update is not forgotten.
      const keep = phase === "available" && pending;
      if (!keep) pending = null;
      set({ phase: keep ? "available" : silent ? "idle" : "error", error: silent ? null : friendly(e) });
    }
  },

  checkNow: async () => {
    set({ dialogOpen: true, cardOpen: false });
    await get().check(false);
  },

  download: async () => {
    const update = pending;
    if (!update || get().phase !== "available") return;
    set({ phase: "downloading", cardOpen: false, progress: EMPTY_PROGRESS, error: null });

    // Speed: bytes received per second, measured over short windows and smoothed so the number does not jump about.
    let downloaded = 0;
    let total: number | null = null;
    let windowStart = performance.now();
    let windowBytes = 0;
    let speed = 0;
    let lastPaint = 0;
    const paint = () => set({ progress: { downloaded, total, speed } });

    const onEvent = (event: DownloadEvent) => {
      if (event.event === "Started") {
        total = event.data.contentLength ?? null;
      } else if (event.event === "Progress") {
        downloaded += event.data.chunkLength;
        windowBytes += event.data.chunkLength;
        const now = performance.now();
        const seconds = (now - windowStart) / 1000;
        if (seconds >= 0.5) {
          const instant = windowBytes / seconds;
          speed = speed === 0 ? instant : speed * 0.6 + instant * 0.4;
          windowStart = now;
          windowBytes = 0;
        }
        if (now - lastPaint > 120) { lastPaint = now; paint(); } // at most ~8 redraws a second
      }
    };

    try {
      await update.download(onEvent);
      set({ phase: "ready", progress: { downloaded: total ?? downloaded, total, speed: 0 }, cardOpen: true });
    } catch (e) {
      set({ phase: "error", error: friendly(e), dialogOpen: true });
    }
  },

  install: async () => {
    const update = pending;
    if (!update || get().phase !== "ready") return;
    // Installing closes the app: protect work that is not saved yet.
    const unsaved = pendingCount(useDocEdits.getState());
    if (unsaved > 0) {
      const go = await useUi.getState().confirm({
        title: "Unsaved edits",
        message: `You have ${unsaved} edit${unsaved === 1 ? "" : "s"} in the document that are not saved. Installing closes Inkdelta and they will be lost.`,
        confirmLabel: "Install anyway",
        danger: true,
      });
      if (!go) return;
    }
    set({ phase: "installing", cardOpen: false });
    try {
      await update.install();
      await updaterApi.relaunch();
    } catch (e) {
      set({ phase: "error", error: friendly(e), dialogOpen: true });
    }
  },

  later: () => set({ cardOpen: false }),

  skipVersion: () => {
    const info = get().info;
    if (info) write(SKIP_KEY, info.version);
    set({ cardOpen: false, dialogOpen: false });
  },

  setAutoCheck: (on) => {
    write(AUTO_KEY, on ? "1" : "0");
    set({ autoCheck: on });
  },

  openDialog: (open) => set({ dialogOpen: open }),
}));

/** A readable message for the usual failures. */
function friendly(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  if (/signature/i.test(text)) return "The update could not be verified, so it was not installed. Try again later.";
  if (/network|connect|resolve|timed out|timeout|dns|offline|request/i.test(text)) return "Could not reach the update server. Check your internet connection and try again.";
  if (/json|release|404|not found/i.test(text)) return "No update information is published yet. Try again later.";
  return `The update failed: ${text}`;
}

// ------------------------------------------------------------ formatting used by the screens

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const formatSpeed = (bytesPerSecond: number): string => `${formatBytes(bytesPerSecond)}/s`;

/** "12 s left", "2 min left"; empty when it cannot be known yet. */
export function formatEta(progress: DownloadProgress): string {
  if (!progress.total || progress.speed <= 0) return "";
  const seconds = Math.max(0, (progress.total - progress.downloaded) / progress.speed);
  if (seconds < 90) return `${Math.ceil(seconds)} s left`;
  return `${Math.ceil(seconds / 60)} min left`;
}

export const percentOf = (progress: DownloadProgress): number | null =>
  progress.total ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100)) : null;
