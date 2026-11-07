// Scroll choreography, kept small: windows tilt upright as they arrive, the giant scene words drift sideways,
// the hero screenshot rises, and an ink drop grows to flood the page between the light and dark halves.
// Everything is driven by CSS variables, so with reduced motion this file does nothing and the page is still.

const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const smooth = (t) => t * t * (3 - 2 * t);

if (!reduced) {
  const stages = [...document.querySelectorAll(".stage")];
  const words = [...document.querySelectorAll(".scene h2")];
  const object = document.getElementById("object");
  const flood = document.getElementById("flood");
  const drop = document.getElementById("flood-drop");
  let queued = false;

  function update() {
    queued = false;
    const vh = innerHeight;

    if (object) {
      const r = object.getBoundingClientRect();
      object.style.setProperty("--h", smooth(clamp((vh - r.top) / (vh * 0.8))).toFixed(3));
    }
    for (const stage of stages) {
      const r = stage.getBoundingClientRect();
      if (r.bottom < -200 || r.top > vh + 400) continue;
      stage.style.setProperty("--e", smooth(clamp((vh * 0.98 - r.top) / (vh * 0.5))).toFixed(3));
    }
    for (const word of words) {
      const r = word.getBoundingClientRect();
      if (r.bottom < -200 || r.top > vh + 200) continue;
      word.style.setProperty("--p", clamp(1 - (r.top + r.height / 2) / vh).toFixed(3));
    }
    if (flood && drop) {
      const r = flood.getBoundingClientRect();
      const p = clamp(-r.top / Math.max(1, r.height - vh));
      const size = Math.min(innerWidth, innerHeight) * 0.22;
      const target = (Math.hypot(innerWidth, innerHeight) / size) * 1.15;
      drop.style.setProperty("--f", (0.03 + (target - 0.03) * smooth(clamp(p * 1.2))).toFixed(3));
    }
  }
  const queue = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };
  addEventListener("scroll", queue, { passive: true });
  addEventListener("resize", queue);
  update();
}
