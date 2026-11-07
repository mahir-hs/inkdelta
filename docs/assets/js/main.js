// Entry point. One job per file: lens.js (hero loupe), scroll.js (scroll choreography), redline.js (compare window),
// scenes.js (the short stories inside the app windows), themes.js (theme and accent pickers).

import "./lens.js";
import "./scroll.js";
import { setupRedline } from "./redline.js";
import { setupScenes } from "./scenes.js";
import { setupThemes } from "./themes.js";

setupRedline();
setupScenes();
setupThemes();

// A hairline appears under the top bar once the page has moved.
const top = document.getElementById("top");
const onScroll = () => top.classList.toggle("scrolled", window.scrollY > 8);
addEventListener("scroll", onScroll, { passive: true });
// Over the dark half the bar turns dark too (once the ink drop has mostly covered the page).
const flood = document.getElementById("flood");
const ink = document.querySelector(".ink");
function tintBar() {
  let dark = false;
  if (ink && ink.getBoundingClientRect().top < 40) dark = true;
  else if (flood) {
    const r = flood.getBoundingClientRect();
    dark = -r.top > (r.height - innerHeight) * 0.55;
  }
  top.classList.toggle("dark", dark);
}
addEventListener("scroll", tintBar, { passive: true });
tintBar();
onScroll();
