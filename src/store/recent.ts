// Recently opened projects, remembered between launches (shown on the start screen).

export interface RecentProject {
  path: string;
  name: string;
  /** Unix milliseconds. */
  openedAt: number;
}

const KEY = "inkdelta.recent";
const MAX = 6;

export function getRecent(): RecentProject[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((r) => typeof r?.path === "string").slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function rememberProject(path: string, name: string) {
  const others = getRecent().filter((r) => r.path !== path);
  try {
    localStorage.setItem(KEY, JSON.stringify([{ path, name, openedAt: Date.now() }, ...others].slice(0, MAX)));
  } catch { /* storage unavailable: recents simply are not kept */ }
}
