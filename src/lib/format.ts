// Small display helpers.

import type { VersionInfo } from "../api/types";
import { S } from "../strings";

/** Date in the user's own language and format. */
export function formatDate(unixSeconds: number): string {
  if (!unixSeconds) return "";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(unixSeconds * 1000));
}

/** Text shown for a version inside a dropdown. */
export function versionLabel(version: VersionInfo): string {
  if (version.kind === "workdir") {
    return version.dirty ? `${S.workingCopy} (${S.uncommitted})` : S.workingCopy;
  }
  const tags = version.tags.length ? `[${version.tags.join(", ")}] ` : "";
  return `${tags}${version.summary}  ·  ${formatDate(version.time)}`;
}

/** Key that identifies a version inside <select> options. */
export function versionKey(version: VersionInfo): string {
  return version.kind === "workdir" ? "workdir" : version.id;
}

/** Small stable id for a piece of text (used to remember review progress per comment). */
export function textId(text: string): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  return "c" + (hash >>> 0).toString(16);
}

export function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

/** "3 days ago" in the user's own language. */
export function relativeTime(unixSeconds: number): string {
  if (!unixSeconds) return "";
  const seconds = Math.round(unixSeconds - Date.now() / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60],
  ];
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return formatter.format(Math.round(seconds / size), unit);
  }
  return formatter.format(seconds, "second");
}

/** "src/docs/paper.docx" -> ["paper.docx", "src/docs"] */
export function splitPath(path: string): { name: string; dir: string } {
  const parts = path.split("/");
  return { name: parts.pop() ?? path, dir: parts.join("/") };
}

export const isWordFile = (path: string): boolean => path.toLowerCase().endsWith(".docx");
