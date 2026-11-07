// The theme and accent pickers. They restyle the sample app window with the app's own colours.

import { ACCENTS, THEMES } from "./data.js";

export function setupThemes() {
  const win = document.getElementById("win-themes");
  const themeBox = document.getElementById("themes");
  const accentBox = document.getElementById("accents");
  if (!win || !themeBox || !accentBox) return;
  let theme = THEMES[0];
  let accent = ACCENTS[0];

  function paint() {
    const [window, pane, text] = theme.c;
    const light = theme.mode === "light";
    const mix = (amount, base = pane) => `color-mix(in srgb, ${text} ${amount}%, ${base})`;
    const set = (name, value) => win.style.setProperty(name, value);
    set("--w-window", window);
    set("--w-pane", pane);
    set("--w-page", pane);
    set("--w-raised", mix(6));
    set("--w-raised2", mix(10));
    set("--w-text", text);
    set("--w-page-text", text);
    set("--w-text2", mix(66));
    set("--w-text3", mix(46));
    set("--w-line", `color-mix(in srgb, ${text} 12%, transparent)`);
    set("--w-solid", accent.color);
    set("--w-accent", light ? accent.color : `color-mix(in srgb, ${accent.color} 62%, white)`);
    set("--w-accent-soft", `color-mix(in srgb, ${accent.color} 18%, transparent)`);
    set("--w-ins", light ? "#0b7f63" : "#47d1a6");
    set("--w-ins-bg", light ? "rgba(14,138,107,.16)" : "rgba(71,209,166,.16)");
    set("--w-del", light ? "#c72a45" : "#f2727f");
    set("--w-del-bg", light ? "rgba(199,42,69,.13)" : "rgba(242,114,127,.16)");
    set("--w-mod", light ? "#b7791f" : "#e8b44f");
    set("--w-mod-soft", light ? "rgba(214,150,30,.2)" : "rgba(232,180,79,.15)");
    themeBox.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.id === theme.id)));
    accentBox.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.id === accent.id)));
  }

  THEMES.forEach((t) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "swatch";
    button.dataset.id = t.id;
    button.innerHTML = `<i style="background:linear-gradient(135deg, ${t.c[1]} 50%, ${t.c[2]} 50%)"></i>${t.label}`;
    button.addEventListener("click", () => { theme = t; paint(); });
    themeBox.append(button);
  });
  ACCENTS.forEach((a) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.id = a.id;
    button.style.background = a.color;
    button.setAttribute("aria-label", a.label);
    button.title = a.label;
    button.addEventListener("click", () => { accent = a; paint(); });
    accentBox.append(button);
  });
  paint();
}
