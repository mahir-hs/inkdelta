// Entry point. Each file does one thing: hero.js (headline and scrubber), redline.js (compare window),
// scenes.js (the short stories in the app windows), themes.js (theme and accent pickers).

import "./hero.js";
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
onScroll();
