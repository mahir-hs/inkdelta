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

## Build, run, test
```
pnpm app                                   # dev (first run compiles Rust, a few minutes)
pnpm exec tauri build --no-bundle          # release exe: src-tauri/target/release/inkdelta.exe (~2 min)
pnpm exec tsc --noEmit                     # type-check the UI
cargo test --manifest-path src-tauri/Cargo.toml    # 44 backend tests (Git against throwaway repos)
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
- **docx/**: reads Word files (reader), `edit.rs` patches paragraph text in place (formatting/images untouched, stale/complex paragraphs refused).
- **diff/**: paragraph alignment + word diff. **git/**: libgit2 for local work (history, status, commit, branches, stash, graph,
  conflicts, line-level staging in `lines.rs`); the installed `git` only for fetch/pull/push/clone/merge (`cli.rs`).
- **ai.rs**: AI via command-line tool (stdin) / Anthropic API / OpenAI-compatible (OpenRouter, Ollama) using `ureq`.
- **UI** (`src/`): dockview docking, zustand stores (`store/`), menu bar (File/Git/View/AI) in `app/TitleBar.tsx` + `app/menus.ts`,
  panels in `features/*`, 8 themes + accents + document font/size + zoom, Reading mode is the default view.
- Layout: starts as just the page; panels open from the left icon bar; "View > Customize layout" assigns each panel
  to left/right/bottom/hidden (`app/layout.ts`, key `inkdelta.sides`); saved layout key `inkdelta.layout.v4`.

## Verified vs not verified
Verified (real window + real Git): staging, commit, branches, stash, merge-conflict resolution, per-line staging,
history comparison, in-app editing saved into the .docx and committed, themes, zoom, docking with real mouse, menu bar,
layout customization, AI flow with a stand-in CLI tool.
**Not verified:** the AI with a REAL provider (Claude Code `claude -p`, Codex `codex exec -`, OpenRouter, Ollama, Anthropic key);
pull/push against GitHub (only a local bare repo); native file/folder pickers, Export HTML, Print, "Compare two files";
macOS/Linux builds; line staging with CRLF files; Match-system theme following live OS changes.

## Known limits
Edit text only (no add/delete paragraphs; paragraphs with equations/tabs/breaks/pictures/fields are read-only, ~533 of 579 editable in the paper).
Word conflicts: keep one whole version. API keys are stored in plain text in localStorage. AI picks paragraphs by simple word overlap (max 6).

## NEXT SESSION: planned work (owner confirmed, in this order)
The review-only AI is "too rigid". The owner wants AI usable for ANY task, with the company-provided CLI as the main route.
1. **"Ask AI" chat panel (dock panel `ask`)**: free-text prompts with history shown in the panel; the user picks what the AI sees
   (selected text / current section / whole paper / a review comment). Replies appear and can be applied as pending edits
   (reuse `store/docEdits.ts`, `features/ai/suggest.ts` parsing, `ai.rs`). Needs a way to feed back multi-turn context
   (send prior turns in the prompt; the CLI call is one-shot). Add paragraph INSERT/DELETE to `docx/edit.rs` so "write a new section" works.
2. **Real terminal panel** (PTY + xterm.js, e.g. `portable-pty` crate) opened in the project folder so the owner can run
   `claude` / `codex` interactively. Note Claude Code edits text files, not .docx; refresh the app on file changes.
3. (Info only, NOT a task.) The owner asked a QUESTION about AI history; they did NOT ask for a CLI-only or privacy mode. Do not build one
   unless they ask. Facts to answer honestly if it comes up: Inkdelta stores NO prompts/replies; the CLI keeps its own local transcripts
   under `C:\Users\Administrator\.claude\` (accepted C: exception); Claude Code does not show in claude.ai chat history (believed,
   unverified); company/Anthropic server-side retention is set by the account policy and cannot be checked from the app.
   The owner uses an official company Claude account via the Claude Code CLI, so keep the CLI route first-class.
4. Show the exact full prompt in the "Send" confirmation (today it lists only the paragraphs). "Send" means: the app silently spawns
   the CLI (`cmd /C claude -p`, no window), writes the prompt to its stdin and reads stdout. One shot, no memory, not the web UI.

## Older next steps
1. Try the AI with a real service and fix command/model defaults. 2. A right-edge icon bar matching panels placed on the right.
3. Test pull/push on GitHub; macOS/Linux builds via CI. 4. "Draft the reply to the reviewer" AI action; discard individual lines.
Owner feedback style: wants a Notion-like calm, premium feel; features must be discoverable (no hidden shortcuts only); everything user-configurable.
