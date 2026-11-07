# Inkdelta: notes for Claude (read this first)

Desktop app (Tauri 2: Rust backend + React/TypeScript UI) for people who write in Word. It redlines versions of a
.docx from Git history, lets you read and edit the document in place, tracks reviewer comments, has an AI helper
for those comments, and is a full Git client. Built for the owner's research paper repo (`D:\Personal\colab\pneumonia`).
Read `ARCHITECTURE.md` (map, rules, where to change things) and `README.md` before changing anything.

## The owner's rules (they override defaults)
- **Never install or store anything on C:.** Tools live in `D:\DevData` (Rust via `RUSTUP_HOME`/`CARGO_HOME` user env vars,
  MSVC Build Tools at `D:\DevData\BuildTools`). **Never delete anything in `D:\DevData`.** The Windows SDK on C: is an accepted exception.
- Download with `aria2c` (`-d` a D: folder), never curl/wget.
- The owner wants readable, well-structured code they can maintain without AI. Keep modules small, comment the why.
- Be honest about what was and was not verified. Do not call something "premium" or "done" without looking at it.
- Mention handy lesser-known tools/commands when relevant (their global rule).
- The user's real repo `D:\Personal\colab\pneumonia` holds their own `.inkdelta/review.json`. Do not delete or modify it.
  Test against a COPY (`D:\Scratch\inkdelta-test-repo`).

## The website (docs/)
Product page on GitHub Pages: `docs/index.html`, `docs/assets/{css,js,fonts,shots}`. No build step. OWNER'S RULES FOR IT: VISUAL FIRST, VERY FEW WORDS
(one giant word + one short line per feature), NO architecture / "built with" / test counts / prose paragraphs; README must stay short and visual too.
Design: pale proof paper, indigo ink; hero = headline with a loupe (`js/lens.js`) that follows the cursor and shows the redline layer
(touch screens: it patrols on its own; reduced motion: it rests on the changed words), then a REAL screenshot of the app that tilts upright on
scroll; each feature = giant word (drifts sideways) + dark app window that tilts in (`js/scroll.js`, CSS variables `--e --p --h --f`);
an ink drop floods the page into the dark half (Ask, Run, Commit, Style, Status, Get). App windows are HTML re-creations in the app's real colours;
`js/scenes.js` plays them when scrolled into view (final states under `prefers-reduced-motion`); `js/diff.js` is a real word diff used by the Compare
window. "Status" chips = what is / is not verified: keep honest and in step with the section below.
Real screenshots (`assets/shots/*.webp`, also used by the README) come from the real app on an INVENTED demo project built by a script
(`D:\Scratch\demo\build_demo.py`: sample paper as real .docx files, a reviewer file with Word comments, a Git history with a branch and merge) with a
scripted stand-in AI reply; captured over the DevTools protocol at 2x as WebP. NEVER use the owner's real paper text, hashes or paths on the site/README.
Preview: `python -m http.server 8099 --bind 127.0.0.1` in `docs/`; check with headless Edge over the DevTools protocol (profile on D:).
`.github/workflows/pages.yml` deploys on changes to `docs/`; Pages source is "GitHub Actions"; `gh` lives at `D:\DevData\gh\bin\gh.exe` (logged in).
The repo is MIT licensed (`LICENSE`, copyright mahir-hs); keep the `license` fields in Cargo.toml and package.json in step.

## Build, run, test
```
pnpm app                                   # dev (first run compiles Rust, a few minutes)
pnpm exec tauri build --no-bundle          # release exe: src-tauri/target/release/inkdelta.exe (~2 min)
pnpm exec tsc --noEmit                     # type-check the UI
cargo test --manifest-path src-tauri/Cargo.toml    # 48 backend tests (Git against throwaway repos, one real shell)
inkdelta.exe <folder>                      # open a project directly
```
Installers (.msi/.exe) are not built: Tauri would download WiX/NSIS to C:. CI for Windows/macOS/Linux is `.github/workflows/release.yml` (never run).

## How UI changes were verified (reuse this)
Launch the exe with a folder arg and `WEBVIEW2_USER_DATA_FOLDER=D:\DevData\webview2-inkdelta-test` plus
`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9333`, then drive it over the Chrome DevTools Protocol
with Node (global `WebSocket`). Take screenshots with `Page.captureScreenshot` and LOOK at them.
- **Drag/drop and pointer UX must be tested with real OS mouse input** (SetCursorPos/mouse_event), not synthetic events:
  synthetic events once passed while real dragging was broken (`dragDropEnabled` must stay `false` in `tauri.conf.json`).
  Tell the user before taking their mouse.
- The test scripts lived in a session scratchpad and are gone; rewrite small ones as needed.

## Shell gotchas
- Bash heredocs containing quotes/backslashes often fail or get mangled (e.g. `\r\n`). Create files with the Write/Edit
  tools; for multi-file edits write a small `.py` patch with Write, run it, delete it.
- Rust crate APIs are very new (git2 0.21, quick-xml 0.42, zip 9, similar 3). Check the real signatures in
  `D:\DevData\cargo\registry\src\*` instead of guessing.

## What exists
- **docx/**: reads Word files (reader), `edit.rs` patches paragraph text in place (formatting/images untouched, stale/complex paragraphs refused) and can insert
  a new paragraph after one (copies a nearby paragraph's style) or delete a plain one (`apply_changes`, `DocChanges` in `model/source.rs`).
- **diff/**: paragraph alignment + word diff. **git/**: libgit2 for local work (history, status, commit, branches, stash, graph,
  conflicts, line-level staging in `lines.rs`); the installed `git` only for fetch/pull/push/clone/merge (`cli.rs`).
- **ai.rs**: AI via command-line tool (stdin) / Anthropic API / OpenAI-compatible (OpenRouter, Ollama) using `ureq`.
- **Terminal panel** (`terminal`, bottom, activity bar): a real PowerShell (`$SHELL` elsewhere) in the project folder through a pseudo-terminal.
  Backend `terminal.rs` (`portable-pty`, ConPTY) + commands `terminal_*`; output goes to the UI as base64 bytes over a Tauri `Channel`.
  UI: xterm.js (`@xterm/xterm`, `@xterm/addon-fit`). `features/terminal/session.ts` keeps the screen and the shell ALIVE OUTSIDE React, because
  dockview unmounts a hidden panel (switching tabs or closing the panel does not end the shell; Restart does). Buttons type `claude` / `codex`.
  After the shell has been quiet for 1.5 s the app refreshes Git status (files changed by a tool show up on their own). App shortcuts
  (Ctrl+K, zoom keys) are ignored inside `.terminal-host`. Windows ConPTY asks the terminal for the cursor position at start (`ESC[6n`);
  xterm.js answers it, a bare test must answer `ESC[1;1R` itself.
- **Updates**: `tauri-plugin-updater` + `-process`; flow in `store/updater.ts` (phases idle/checking/available/downloading/ready/installing), screens in
  `features/updates/` (a small card that ASKS, a details dialog, a status-bar chip with % and speed), wrapper `api/updater.ts`. Checks 10 s after start and
  every 6 h (switch in the dialog, key `inkdelta.autoUpdate`; skipped version `inkdelta.skipUpdate`); File > Check for updates and the palette open the
  dialog. Download runs in the background; install asks again and warns about unsaved edits. The app reads
  `https://github.com/mahir-hs/inkdelta/releases/latest/download/latest.json` (made by tauri-action, `includeUpdaterJson`) and verifies every update
  against the PUBLIC key in `tauri.conf.json`. The PRIVATE key + password are in `D:\DevData\inkdelta-signing\` (BACK THEM UP: if lost, installed apps can
  never update again) and MUST also be GitHub secrets `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, or the release build fails
  (the auto mode classifier blocks Claude from writing secrets: the owner runs `gh secret set` themselves).
  Tested locally against a mock server (`D:\Scratch\updater-mock`, throttled, real signature): ask, background download with % and speed, ready prompt.
  NOT tested: a real update installing, and the restart.
  RELEASE: bump the version in package.json, tauri.conf.json and Cargo.toml; push a tag `vX.Y.Z`; CI builds a DRAFT with installers for all systems; the
  owner publishes it (updates and the site's Download button only see PUBLISHED releases). Do not move or delete tags (blocked as destructive; use a new version).
  The site and README Download buttons point to `releases/latest`.
- **Ask AI chat** (panel `ask`, left icon bar + AI menu): `features/ai/chat.ts` (context, prompt, reply parsing, no UI), `store/chat.ts`
  (messages are in memory only, never saved), `features/ai/AskPanel.tsx`. The user picks what the AI sees (selected text / a section / whole
  document / a review comment / nothing) and can open "Exactly what will be sent". Each message is one CLI call; earlier turns are repeated
  in the prompt. TOKEN COST (owner cares): the format instructions (~350 tokens) are sent ONLY when the switch "Let the AI propose document
  changes" is on (default off; key `inkdelta.askEdits`); otherwise the prompt is just history + chosen paragraphs + question, with no system text.
  The owner LIKES the "Exactly what will be sent" preview: keep it. Under the box: Model + Effort pickers (Claude Code only; other services get a
  model text box) and a context meter (ESTIMATE: chars/4 against 200k, or 1M if the model name says 1m; Claude Code adds some of its own).
  `ai.rs::cli_command` adds `--model`, `--effort`, `--disable-slash-commands`, `--strict-mcp-config` when the command starts with `claude`
  (NOT `--bare`: it stops Claude Code reading the OAuth/company login). With the switch on, the AI answers in plain text and, if asked to change the document, ends with a fenced ```inkdelta JSON block
  (edits / inserts / deletes by paragraph number). Proposals are ticked, then become pending changes in `store/docEdits.ts`
  (shown in the reading view: green new paragraph, struck-through removal), and the user presses Save. Selection capture: every reading-view
  paragraph has `data-pos`; `store/chat.ts` listens to `selectionchange` for the whole app lifetime.
- **UI** (`src/`): dockview docking, zustand stores (`store/`), menu bar (File/Git/View/AI) in `app/TitleBar.tsx` + `app/menus.ts`,
  panels in `features/*`, 8 themes + accents + document font/size + zoom, Reading mode is the default view.
- Layout: starts as just the page; panels open from the left icon bar; "View > Customize layout" assigns each panel
  to left/right/bottom/hidden (`app/layout.ts`, key `inkdelta.sides`); saved layout key `inkdelta.layout.v4`.

## Verified vs not verified
Verified (real window + real Git): staging, commit, branches, stash, merge-conflict resolution, per-line staging,
history comparison, in-app editing saved into the .docx and committed, themes, zoom, docking with real mouse, menu bar,
layout customization, AI flow with a stand-in CLI tool, **Ask AI chat with a stand-in CLI tool** (select text, reword, add a paragraph,
remove a paragraph, multi-turn history in the prompt, ignored out-of-scope suggestions, Save into the real .docx and re-read it).
Terminal panel verified in the real window: starts in the project folder, typing works, `claude --version` found on PATH, Claude Code's full-screen
UI renders and exits, the shell survives a tab switch, files made by the shell appear in Source control by themselves, Ctrl+K reaches the shell,
terminal size matches the shell's idea of it, closing the app ends the shell (no orphan).
**Not verified:** the AI (review flow AND Ask AI chat) with a REAL provider, incl. whether `--effort`/`--model sonnet`/`--disable-slash-commands`/
`--strict-mcp-config` are accepted by `claude -p` exactly as built (flags exist in `claude --help` 2.1.319; no real prompt was sent), and a REAL context
percentage (only an estimate; `claude -p --output-format json` could give real usage) (Claude Code `claude -p`, Codex `codex exec -`, OpenRouter, Ollama, Anthropic key);
pull/push against GitHub (only a local bare repo); native file/folder pickers, Export HTML, Print, "Compare two files";
macOS/Linux builds (the terminal's `$SHELL` path in particular); copy/paste inside the terminal with a real mouse; line staging with CRLF files; Match-system theme following live OS changes.

## Known limits
Edit text, add plain paragraphs, delete plain paragraphs (paragraphs with equations/tabs/breaks/pictures/fields are read-only, ~533 of 579 editable
in the paper; the only paragraph of a table cell and section-break paragraphs cannot be deleted; no new tables or images).
Word conflicts: keep one whole version. API keys are stored in plain text in localStorage. AI picks paragraphs by simple word overlap (max 6).

## NEXT SESSION: planned work (owner confirmed, in this order)
The review-only AI is "too rigid". The owner wants AI usable for ANY task, with the company-provided CLI as the main route.
1. DONE (built and checked with a stand-in CLI, NOT with the real `claude -p` yet): the "Ask AI" chat panel and paragraph insert/delete. See "What exists".
   Gotcha found: in this WebView2 (Chromium 157) `element.scrollIntoView()` returns a Promise, so never use it as a one-line `useEffect(() => el.scrollIntoView())`
   (React takes it for a cleanup function and the whole UI goes blank). Use a block body.
2. DONE: the real terminal panel (see "What exists"). Note Claude Code edits text files, not .docx. Possible follow-ups: several terminals,
   choose the shell (cmd, Git Bash), reload the open document when its file changes on disk.
3. (Info only, NOT a task.) The owner asked a QUESTION about AI history; they did NOT ask for a CLI-only or privacy mode. Do not build one
   unless they ask. Facts to answer honestly if it comes up: Inkdelta stores NO prompts/replies; the CLI keeps its own local transcripts
   under `C:\Users\Administrator\.claude\` (accepted C: exception); Claude Code does not show in claude.ai chat history (believed,
   unverified); company/Anthropic server-side retention is set by the account policy and cannot be checked from the app.
   The owner uses an official company Claude account via the Claude Code CLI, so keep the CLI route first-class.
4. Show the exact full prompt in the review-comment "Send" confirmation (`SuggestionDialog`; the Ask AI chat already has "Exactly what will be sent"). "Send" means: the app silently spawns
   the CLI (`cmd /C claude -p`, no window), writes the prompt to its stdin and reads stdout. One shot, no memory, not the web UI.

## Older next steps
1. Try the AI with a real service and fix command/model defaults. 2. A right-edge icon bar matching panels placed on the right.
3. Test pull/push on GitHub; macOS/Linux builds via CI. 4. "Draft the reply to the reviewer" AI action; discard individual lines.
Owner feedback style: wants a Notion-like calm, premium feel; features must be discoverable (no hidden shortcuts only); everything user-configurable.
