// Zoom the whole app in and out (Ctrl + / Ctrl - / Ctrl 0 / Ctrl + scroll). Remembered between launches.

import { getCurrentWebview } from "@tauri-apps/api/webview";
import { create } from "zustand";

const STEPS = [0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5];
const KEY = "inkdelta.zoom";

function readLevel(): number {
  try {
    const value = Number(localStorage.getItem(KEY));
    if (value >= STEPS[0] && value <= STEPS[STEPS.length - 1]) return value;
  } catch { /* storage unavailable: normal size */ }
  return 1;
}

/** The webview scales everything crisply. If that is not available, fall back to CSS zoom. */
async function apply(level: number) {
  try {
    await getCurrentWebview().setZoom(level);
  } catch {
    document.documentElement.style.setProperty("zoom", String(level));
  }
}

interface ZoomState {
  level: number;
  zoomIn: () => void;
  zoomOut: () => void;
  reset: () => void;
  /** Apply the remembered level (called once at start). */
  restore: () => void;
}

export const useZoom = create<ZoomState>((set, get) => {
  const change = (level: number) => {
    set({ level });
    try { localStorage.setItem(KEY, String(level)); } catch { /* ignore */ }
    void apply(level);
  };
  return {
    level: readLevel(),
    zoomIn: () => change(STEPS.find((s) => s > get().level + 0.001) ?? STEPS[STEPS.length - 1]),
    zoomOut: () => change([...STEPS].reverse().find((s) => s < get().level - 0.001) ?? STEPS[0]),
    reset: () => change(1),
    restore: () => void apply(get().level),
  };
});
