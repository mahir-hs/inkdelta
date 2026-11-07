// The first screen: the headline revises itself once, then the paragraph below can be stepped through its versions.

import { ABSTRACT, VERSIONS } from "./data.js";
import { diffWords, renderOps, tally } from "./diff.js";

const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Strike the old words, insert the new ones, then tidy the old ones away. One sequence, played once. */
async function reviseHeadline() {
  const rev = document.getElementById("rev");
  if (!rev) return;
  if (reduced) { rev.classList.add("s-done"); return; }
  await sleep(900);
  rev.classList.add("s-strike");
  await sleep(950);
  rev.classList.add("s-insert");
  await sleep(1900);
  // The headline wraps onto one more line while both phrases show. Hold its height, tidy the old words
  // away, then ease to the final height so the page below settles instead of jumping.
  const headline = document.getElementById("headline");
  const tall = headline.offsetHeight;
  headline.style.height = `${tall}px`;
  rev.classList.add("s-done");
  await sleep(1000);
  headline.style.height = "auto";
  const settled = headline.offsetHeight;
  headline.style.height = `${tall}px`;
  headline.offsetHeight; // force the browser to register the starting height
  headline.style.height = `${settled}px`;
  await sleep(900);
  headline.style.height = "";
}

function setupSheet() {
  const slider = document.getElementById("ver");
  const text = document.getElementById("sheet-text");
  const label = document.getElementById("sheet-label");
  const tallyBox = document.getElementById("tally");
  const ticks = [...document.querySelectorAll("#ticks span")];
  if (!slider || !text) return { stop() {} };

  function show(version) {
    const v = Number(version);
    ticks.forEach((tick) => tick.setAttribute("aria-current", String(Number(tick.dataset.v) === v)));
    slider.setAttribute("aria-valuetext", VERSIONS[v].short);
    if (v === 0) {
      text.textContent = ABSTRACT[0];
      label.textContent = "Baseline: nothing to compare yet";
      tallyBox.textContent = "The first version. Drag the marker to see what each revision changed.";
      return;
    }
    const ops = diffWords(ABSTRACT[v - 1], ABSTRACT[v]);
    renderOps(text, ops);
    const t = tally(ops);
    label.textContent = `${VERSIONS[v].short} against ${VERSIONS[v - 1].short}`;
    tallyBox.innerHTML = `<span class="p">+${t.added} words</span><span class="m">−${t.removed} words</span><span>${t.changes} change${t.changes === 1 ? "" : "s"}</span>`;
  }

  let userTookOver = false;
  const takeOver = () => { userTookOver = true; text.setAttribute("aria-live", "polite"); };
  slider.addEventListener("input", () => { takeOver(); show(slider.value); });
  slider.addEventListener("pointerdown", takeOver);
  slider.addEventListener("keydown", takeOver);
  ticks.forEach((tick) => tick.addEventListener("click", () => { takeOver(); slider.value = tick.dataset.v; show(tick.dataset.v); }));

  text.setAttribute("aria-live", "off"); // no chatter for screen readers while it plays by itself
  show(slider.value);

  /** After the headline, step through the versions once so the page shows what the control does. */
  async function demo() {
    if (reduced) return;
    await sleep(5200);
    for (const v of [2, 3, 1]) {
      if (userTookOver) return;
      slider.value = v;
      show(v);
      await sleep(2300);
    }
  }
  return { demo };
}

reviseHeadline();
setupSheet().demo?.();
