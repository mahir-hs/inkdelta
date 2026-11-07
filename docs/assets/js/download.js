// Downloads, straight from the page. The newest published release lists its files; this fills the buttons from them,
// so a new version needs no change to the site. It also notices the visitor's system (and, where the browser says so,
// the processor) and lights up the matching file. The browser downloads from GitHub's file server without leaving the page.

const API = "https://api.github.com/repos/mahir-hs/inkdelta/releases/latest";

/** Which file is which. First match wins; the label is what the visitor reads. */
const FILES = [
  { os: "windows", id: "win-exe", label: "Installer", ext: ".exe", match: /_x64-setup\.exe$/i },
  { os: "windows", id: "win-msi", label: "MSI package", ext: ".msi", match: /_x64_en-US\.msi$/i },
  { os: "macos", id: "mac-arm", label: "Apple Silicon", ext: ".dmg", match: /_aarch64\.dmg$/i },
  { os: "macos", id: "mac-x64", label: "Intel", ext: ".dmg", match: /_x64\.dmg$/i },
  { os: "linux", id: "lin-appimage", label: "Any distribution", ext: ".AppImage", match: /\.AppImage$/i },
  { os: "linux", id: "lin-deb", label: "Debian, Ubuntu", ext: ".deb", match: /\.deb$/i },
  { os: "linux", id: "lin-rpm", label: "Fedora", ext: ".rpm", match: /\.rpm$/i },
];
const OS_NAME = { windows: "Windows", macos: "macOS", linux: "Linux" };
const PREFERRED = { windows: "win-exe", macos: "mac-arm", linux: "lin-appimage" };

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const size = (bytes) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`);

/** The visitor's system, or null on phones and anything unknown. */
function detectOs() {
  const ua = navigator.userAgent;
  if (/Android|iPhone|iPad|iPod/i.test(ua)) return null;
  const platform = navigator.userAgentData?.platform || navigator.platform || "";
  if (/win/i.test(platform) || /Windows/.test(ua)) return "windows";
  if (/mac/i.test(platform) || /Mac OS X/.test(ua)) return "macos";
  if (/linux|x11|cros/i.test(platform + ua)) return "linux";
  return null;
}

/** Apple Silicon or Intel, when the browser will say (Chrome and Edge do; Safari and Firefox do not, so assume the newer chip). */
async function macChip() {
  try {
    const hint = await navigator.userAgentData?.getHighEntropyValues(["architecture"]);
    if (hint?.architecture) return /arm/i.test(hint.architecture) ? "mac-arm" : "mac-x64";
  } catch { /* not available */ }
  return "mac-arm";
}

async function start() {
  const root = $("#download");
  if (!root) return;
  const os = detectOs();
  const note = $("#dl-state");

  let release;
  try {
    const response = await fetch(API, { headers: { Accept: "application/vnd.github+json" } });
    if (!response.ok) throw new Error(String(response.status));
    release = await response.json();
  } catch {
    note.textContent = "The first release is not published yet. Check back soon.";
    root.classList.add("dl-empty");
    return;
  }

  const version = String(release.tag_name ?? "").replace(/^v/, "");
  const found = new Map();
  for (const asset of release.assets ?? []) {
    const rule = FILES.find((f) => !found.has(f.id) && f.match.test(asset.name));
    if (rule) found.set(rule.id, asset);
  }

  // fill every button we have a file for
  for (const rule of FILES) {
    const asset = found.get(rule.id);
    const button = $(`[data-file="${rule.id}"]`);
    if (!button) continue;
    if (!asset) { button.hidden = true; continue; }
    button.href = asset.browser_download_url;
    button.removeAttribute("aria-disabled");
    $(".dl-size", button).textContent = size(asset.size);
  }
  $$(".dl-version").forEach((el) => (el.textContent = version));
  note.textContent = "";

  // light up the visitor's own system, and pick the right file for it
  let pick = null;
  if (os) {
    pick = os === "macos" ? await macChip() : PREFERRED[os];
    if (!found.has(pick)) pick = FILES.find((f) => f.os === os && found.has(f.id))?.id ?? null;
  }
  if (os) $(`[data-os="${os}"]`)?.classList.add("rec");
  if (pick) $(`[data-file="${pick}"]`)?.classList.add("pick");

  // the big button in the middle, and the one under the headline, download the right file directly
  const asset = pick && found.get(pick);
  for (const button of $$("[data-main-download]")) {
    if (asset) {
      button.href = asset.browser_download_url;
      $(".dl-label", button).textContent = `Download for ${OS_NAME[os]}`;
    } else {
      button.href = "#download";
    }
  }
  if (asset) {
    $("#dl-main-sub").textContent = `${OS_NAME[os]}  ·  ${FILES.find((f) => f.id === pick).label} ${FILES.find((f) => f.id === pick).ext}  ·  ${size(asset.size)}`;
    $("#dl-main-icon").dataset.os = os;
    root.classList.add("dl-detected");
  }
}

start();
