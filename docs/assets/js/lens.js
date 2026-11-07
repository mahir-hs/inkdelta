// The hero loupe. Over the headline sits a second copy of it, in ink, showing the redline version
// (the new words highlighted, the old ones struck above them). A circular window onto that copy follows the cursor,
// so moving over the headline literally shows "what changed". It plays once by itself, then rests on the changed words.

const wrap = document.getElementById("lens");
const layer = document.getElementById("lens-layer");
const ring = document.getElementById("lens-ring");
const hero = document.querySelector(".hero");
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const coarse = matchMedia("(pointer: coarse)").matches;

if (wrap && layer && ring && hero) {
  const state = { x: 0, y: 0, r: 0 };
  let focus = { x: 0, y: 0 };      // the changed words
  let radius = 160;
  let pointer = null;              // where the cursor is, if it is over the hero
  let leftAt = 0;
  const started = performance.now();

  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const lerp = (a, b, t) => a + (b - a) * t;

  function measure() {
    const box = wrap.getBoundingClientRect();
    const word = layer.querySelector(".ins-word").getBoundingClientRect(); // the first changed words
    focus = { x: word.left - box.left + word.width * 0.5, y: word.top - box.top + word.height * 0.3 };
    radius = Math.max(110, Math.min(210, box.width * 0.14));
  }

  function draw() {
    layer.style.clipPath = `circle(${state.r}px at ${state.x}px ${state.y}px)`;
    ring.style.width = ring.style.height = `${state.r * 2}px`;
    ring.style.transform = `translate(${state.x - state.r}px, ${state.y - state.r}px)`;
    ring.classList.toggle("on", state.r > 4);
  }

  function frame(now) {
    const t = (now - started) / 1000;
    let tx = focus.x, ty = focus.y, tr = radius;
    if (t < 2.8) {
      // intro: the loupe slides in from the left, across the headline, and lands on the changed words
      const k = ease(Math.min(1, t / 2.8));
      const box = wrap.getBoundingClientRect();
      state.x = lerp(-radius * 0.5, focus.x, k);
      state.y = lerp(box.height * 0.55, focus.y, k);
      state.r = radius * Math.min(1, t / 0.7);
    } else {
      if (pointer) { tx = pointer.x; ty = pointer.y; }
      else if (coarse) {
        // touch screens have no hover: the loupe patrols the headline on its own
        const box = wrap.getBoundingClientRect();
        tx = box.width * (0.5 + 0.38 * Math.sin(t * 0.55));
        ty = box.height * (0.45 + 0.3 * Math.sin(t * 0.37 + 1));
      } else if (now - leftAt < 900) { tx = state.x; ty = state.y; }
      state.x = lerp(state.x, tx, 0.14);
      state.y = lerp(state.y, ty, 0.14);
      state.r = lerp(state.r, tr, 0.12);
    }
    draw();
    requestAnimationFrame(frame);
  }

  hero.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch") return;
    const box = wrap.getBoundingClientRect();
    pointer = { x: event.clientX - box.left, y: event.clientY - box.top };
  });
  hero.addEventListener("pointerleave", () => { pointer = null; leftAt = performance.now(); });
  addEventListener("resize", measure);

  const start = () => {
    measure();
    if (reduced) {
      // no motion: the loupe rests on the changed words
      state.x = focus.x; state.y = focus.y; state.r = radius * 0.9;
      draw();
    } else {
      requestAnimationFrame(frame);
    }
  };
  (document.fonts?.ready ?? Promise.resolve()).then(start); // wait for the font, so the words are where they will stay
}
