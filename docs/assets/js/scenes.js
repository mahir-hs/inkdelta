// The app windows that play a short story when they scroll into view: edit, comments, Ask AI, terminal, git graph.
// Each scene has three parts: reset() puts it at the start, run() plays it, final() shows the finished state
// (used when the visitor prefers reduced motion, so nothing moves).

const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
class Cancelled extends Error {}

const $ = (id) => document.getElementById(id);

function scene(win, { reset, run, final }) {
  if (!win) return;
  let current = 0;
  async function play() {
    const mine = ++current;
    reset();
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)).then(() => { if (mine !== current) throw new Cancelled(); });
    try { await run(sleep); } catch (error) { if (!(error instanceof Cancelled)) throw error; }
  }
  if (reduced) {
    final();
    win.querySelector(".replay")?.remove();
    return;
  }
  reset();
  const watcher = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) { watcher.disconnect(); play(); }
  }, { threshold: 0.4 });
  watcher.observe(win);
  win.querySelector(".replay")?.addEventListener("click", play);
}

/** Type text into an element one character at a time. */
async function type(element, text, sleep, speed = 26) {
  for (const ch of text) {
    element.append(ch);
    await sleep(speed + Math.random() * 22);
  }
}

// ------------------------------------------------------------ edit in place
function editScene() {
  const span = $("ed-span"), caret = $("ed-caret"), bar = $("ed-bar"), toast = $("ed-toast"), save = $("ed-save");
  const ORIGINAL = "generalise to new regions";
  const NEW = "generalise only to coastal sites like those we tested";
  const start = () => {
    span.textContent = ORIGINAL;
    span.className = "";
    caret.style.display = "none";
    bar.classList.remove("show");
    toast.classList.remove("show");
    save.classList.remove("pressed");
  };
  scene($("win-edit"), {
    reset: start,
    final: () => { start(); span.textContent = NEW; toast.classList.add("show"); },
    run: async (sleep) => {
      await sleep(900);
      span.className = "sel";               // the user selects the words to change
      await sleep(900);
      span.textContent = "";
      span.className = "edited";            // ochre: edited, not saved yet
      caret.style.display = "inline-block";
      await type(span, NEW, sleep);
      await sleep(500);
      bar.classList.add("show");
      await sleep(1400);
      save.classList.add("pressed");
      await sleep(350);
      bar.classList.remove("show");
      span.className = "";
      caret.style.display = "none";
      toast.classList.add("show");
      await sleep(3200);
      toast.classList.remove("show");
    },
  });
}

// ------------------------------------------------------------ reviewer comments
function commentsScene() {
  const items = [...document.querySelectorAll("#cm-list .cm")];
  const count = $("cm-count"), bar = $("cm-bar");
  const paint = () => {
    const done = items.filter((i) => i.dataset.s === "done").length;
    count.textContent = `${done} of ${items.length} addressed`;
    bar.style.width = `${(done / items.length) * 100}%`;
  };
  const reset = () => { items.forEach((i) => { i.dataset.s = "open"; i.classList.remove("now"); }); paint(); };
  scene($("win-comments"), {
    reset,
    final: () => { items.forEach((i, n) => { i.dataset.s = n < 3 ? "done" : "progress"; }); paint(); },
    run: async (sleep) => {
      await sleep(900);
      for (let n = 0; n < items.length; n++) {
        const item = items[n];
        item.classList.add("now");
        item.dataset.s = "progress";
        await sleep(900);
        if (n < items.length - 1) { item.dataset.s = "done"; paint(); }
        await sleep(450);
        item.classList.remove("now");
      }
    },
  });
}

// ------------------------------------------------------------ Ask AI
function askScene() {
  const log = $("ai-log"), field = $("ai-field"), send = $("ai-send"), sw = $("ai-sw"), meter = $("ai-meter"), p1 = $("ai-p1"), page = $("ai-page");
  const PLACEHOLDER = '<span class="ph">Ask or instruct… (Ctrl+Enter to send)</span>';
  const QUESTION = "Make this clearer, and add a sentence on limitations.";
  const REWORD = "Results suggest it may generalise to other coastal regions, but we tested the North Sea only.";
  const NEWP = "The model needs at least five years of hourly history per gauge, so sparse new sites may not qualify.";
  const ORIGINAL = "Results suggest it may generalise to new regions. We tested the model on the North Sea only.";

  const bubble = (html, cls) => {
    const b = document.createElement("div");
    b.className = `bubble ${cls}`;
    b.innerHTML = html;
    log.append(b);
    requestAnimationFrame(() => requestAnimationFrame(() => b.classList.add("show")));
    return b;
  };
  const reset = () => {
    log.textContent = "";
    field.innerHTML = PLACEHOLDER;
    send.className = "sendbtn";
    sw.classList.remove("on");
    meter.textContent = "Context ≈ <1% · ~120 of 200k tokens (estimate)";
    p1.className = "";
    p1.textContent = ORIGINAL;
    page.querySelector(".newp")?.remove();
  };
  const applyToDocument = () => {
    p1.className = "edited";
    p1.textContent = REWORD;
    if (!page.querySelector(".newp")) {
      const added = document.createElement("p");
      added.className = "newp";
      added.innerHTML = '<span class="tag">New paragraph</span>';
      added.append(NEWP);
      p1.after(added);
    }
  };
  scene($("win-ask"), {
    reset,
    final: () => { reset(); sw.classList.add("on"); applyToDocument(); bubble("Here is a clearer version, plus a sentence on limitations.", "ai"); },
    run: async (sleep) => {
      await sleep(900);
      p1.className = "sel";                               // choose what the AI sees
      await sleep(800);
      sw.classList.add("on");                             // allow proposed changes
      meter.textContent = "Context ≈ <1% · ~540 of 200k tokens (estimate)";
      await sleep(700);
      field.textContent = "";
      await type(field, QUESTION, sleep, 22);
      send.classList.add("ready");
      await sleep(600);
      send.classList.add("pressed");
      await sleep(250);
      field.innerHTML = PLACEHOLDER;
      send.className = "sendbtn";
      bubble(`${QUESTION}<small>AI saw: Selected text (1 paragraph)</small>`, "me");
      await sleep(500);
      const thinking = bubble('<span class="dots"><i></i><i></i><i></i></span>', "ai");
      await sleep(1700);
      thinking.remove();
      const reply = bubble(
        `Here is a clearer version, plus a sentence on limitations.
         <div class="prop"><i>✓</i><div><small>Reword paragraph 2</small><ins>${REWORD}</ins></div></div>
         <div class="prop"><i>✓</i><div><small>New paragraph after paragraph 2</small><ins>${NEWP}</ins></div></div>
         <button class="applybtn" tabindex="-1">Add 2 changes to the document</button>`, "ai");
      await sleep(700);
      const props = [...reply.querySelectorAll(".prop")];
      for (const prop of props) { prop.classList.add("on"); await sleep(550); }
      const apply = reply.querySelector(".applybtn");
      await sleep(500);
      apply.classList.add("pressed");
      await sleep(250);
      apply.className = "applybtn done";
      apply.textContent = "Added to the document";
      applyToDocument();
    },
  });
}

// ------------------------------------------------------------ terminal + source control
function terminalScene() {
  const term = $("tm-term"), list = $("tm-list"), none = $("tm-none"), n = $("tm-n"), badge = $("tm-badge");
  const PROMPT = 'PS D:\\flood-paper> ';
  const cursor = '<span class="cur"></span>';
  let lines = [];
  const draw = (typing = "") => { term.innerHTML = lines.join("\n") + (lines.length ? "\n" : "") + `<span class="ps">${PROMPT}</span><span class="cmd">${typing}</span>${cursor}`; };
  const reset = () => { lines = []; draw(); list.textContent = ""; none.hidden = false; n.textContent = "0"; badge.hidden = true; };
  const showFile = () => {
    none.hidden = true;
    n.textContent = "1";
    badge.hidden = false;
    list.innerHTML = '<li><b>U</b>notes.md</li>';
  };
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  async function typeCommand(command, sleep) {
    let typed = "";
    for (const ch of command) { typed += ch; draw(esc(typed)); await sleep(34 + Math.random() * 30); }
    await sleep(350);
    lines.push(`<span class="ps">${PROMPT}</span><span class="cmd">${esc(command)}</span>`);
  }
  scene($("win-term"), {
    reset,
    final: () => { reset(); lines = [`<span class="ps">${PROMPT}</span><span class="cmd">claude --version</span>`, '<span class="out">2.1.319 (Claude Code)</span>']; draw(); showFile(); },
    run: async (sleep) => {
      await sleep(900);
      await typeCommand('Set-Content notes.md "Reply to reviewer 2"', sleep);
      draw();
      await sleep(1500);                                   // the app notices once the shell goes quiet
      showFile();
      await sleep(1300);
      await typeCommand("claude --version", sleep);
      lines.push('<span class="out">2.1.319 (Claude Code)</span>');
      draw();
    },
  });
}

// ------------------------------------------------------------ git graph
function graphScene() {
  const win = $("win-graph"), svg = $("graph");
  if (!svg) return;
  svg.querySelectorAll(".g-draw").forEach((path) => path.style.setProperty("--len", String(Math.ceil(path.getTotalLength()))));
  svg.querySelector('[data-i="1"]')?.style.setProperty("--delay", "0.35s");
  svg.querySelectorAll(".g-draw").forEach((path) => path.style.setProperty("--dur", "1.7s"));
  scene(win, {
    reset: () => svg.classList.remove("g-in"),
    final: () => svg.classList.add("g-in"),
    run: async (sleep) => { await sleep(500); svg.classList.add("g-in"); },
  });
}

export function setupScenes() {
  editScene();
  commentsScene();
  askScene();
  terminalScene();
  graphScene();
}
