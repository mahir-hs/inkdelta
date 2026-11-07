// The Redline window: compare any two of the four versions of the sample manuscript, as the app does.

import { PAGE, VERSIONS } from "./data.js";
import { diffWords, renderOps, tally } from "./diff.js";

export function setupRedline() {
  const from = document.getElementById("rl-from");
  const to = document.getElementById("rl-to");
  const page = document.getElementById("rl-page");
  const ruler = document.getElementById("rl-ruler");
  const status = document.getElementById("rl-status");
  const all = document.getElementById("rl-all");
  const only = document.getElementById("rl-only");
  if (!from || !to || !page) return;

  for (const select of [from, to]) {
    VERSIONS.forEach((v, i) => select.add(new Option(`${v.short}  ${v.id}`, String(i))));
  }
  from.value = "0";
  to.value = "3";
  let changesOnly = false;

  function render() {
    const a = Number(from.value);
    const b = Number(to.value);
    page.textContent = "";
    ruler.textContent = "";
    const shown = [];
    let words = { added: 0, removed: 0 };
    let changeNumber = 0;

    PAGE.forEach((entry) => {
      const before = entry.texts[a];
      const after = entry.texts[b];
      if (before == null && after == null) return;
      let kind = "eq";
      let ops = [{ t: "eq", text: after ?? before }];
      if (before == null) { kind = "ins"; ops = [{ t: "ins", text: after }]; }
      else if (after == null) { kind = "del"; ops = [{ t: "del", text: before }]; }
      else if (before !== after) { kind = "mod"; ops = diffWords(before, after); }
      shown.push({ entry, kind, ops });
    });

    const visible = changesOnly ? shown.filter((s) => s.kind !== "eq") : shown;
    visible.forEach((item, index) => {
      const el = document.createElement("div");
      el.className = item.entry.kind === "h" ? "h pp" : "pp";
      el.style.margin = item.entry.kind === "h" ? "0 0 0.5rem" : "0 0 0.9rem";
      if (item.entry.kind === "h") el.style.fontWeight = "640";
      if (item.kind !== "eq") {
        changeNumber++;
        const badge = document.createElement("span");
        badge.className = "badge-n";
        badge.textContent = String(changeNumber);
        badge.style.marginLeft = "-2.5rem";
        el.append(badge);
        const t = tally(item.ops);
        words.added += t.added;
        words.removed += t.removed;
      }
      const body = document.createElement("span");
      renderOps(body, item.ops);
      el.append(body);
      page.append(el);

      if (item.kind !== "eq") {
        const tick = document.createElement("i");
        tick.className = item.kind === "ins" ? "ins" : item.kind === "del" ? "del" : "";
        tick.style.top = `${(index / Math.max(1, visible.length)) * 100 + 1}%`;
        tick.style.animationDelay = `${changeNumber * 60}ms`;
        ruler.append(tick);
      }
    });

    if (changeNumber === 0) {
      const note = document.createElement("p");
      note.className = "empty-note";
      note.textContent = a === b ? "These are the same version. Pick two different ones." : "No differences between these two versions.";
      page.append(note);
    }
    status.innerHTML = `<span>${changeNumber} change${changeNumber === 1 ? "" : "s"}</span><span class="p">+${words.added} words</span><span class="m">−${words.removed} words</span>`;
  }

  from.addEventListener("change", render);
  to.addEventListener("change", render);
  all.addEventListener("click", () => { changesOnly = false; all.setAttribute("aria-pressed", "true"); only.setAttribute("aria-pressed", "false"); render(); });
  only.addEventListener("click", () => { changesOnly = true; only.setAttribute("aria-pressed", "true"); all.setAttribute("aria-pressed", "false"); render(); });
  render();
}
