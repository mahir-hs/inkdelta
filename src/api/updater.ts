// The only place the UI talks to the update plugin (the Rust side is registered in src-tauri/src/lib.rs).
// The flow itself (when to check, asking, progress, install) lives in store/updater.ts.

import { getVersion } from "@tauri-apps/api/app";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";

export type { DownloadEvent, Update };

export const updaterApi = {
  /** The version of the running app. */
  version: () => getVersion(),
  /** Ask the update address whether a newer version exists. Null means this is the newest. */
  check: (): Promise<Update | null> => check({ timeout: 20_000 }),
  /** Start the new version after an install (Windows closes the app itself while installing). */
  relaunch: () => relaunch(),
};
