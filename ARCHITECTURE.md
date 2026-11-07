# Inkdelta architecture

Inkdelta shows what changed between versions of a Word document, tracks which
reviewer comments have been addressed, and is a full Git client for the project.
It is a desktop app built with **Tauri 2**: a Rust backend does the heavy work,
a React + TypeScript UI draws it in a VS Code-style dockable workspace.

```
 ┌──────────────────────────── UI (src/, React + TypeScript) ─────────────────────────────┐
 │  app/        shell: App, dock layout, activity bar, status bar, command palette        │
 │  features/   one folder per panel: redline · documents · sourcecontrol · graph ·       │
 │              review · sidebar (changes list, Word comments) · output                   │
 │  store/      shared state (zustand): workspace · git · review · ui                     │
 │  ui/         dialogs, menus, toasts (used by everything)                               │
 │  api/        the ONLY place that talks to Rust (commands.ts) + shared types            │
 └───────────────────────────────────────────┬────────────────────────────────────────────┘
                                             │  Tauri "commands" (JSON over IPC)
 ┌───────────────────────────────────────────┴────────────────────────────────────────────┐
 │ Backend (src-tauri/src/, Rust)                                                         │
 │  commands.rs   thin entry points, no logic                                             │
 │     ├── docx/      .docx → Document (paragraphs, tables, images, comments)             │
 │     ├── diff/      two Documents → DiffDocument (the redline)                          │
 │     ├── git/       built-in engine (libgit2): history, status, commit, branches,       │
 │     │              stash, graph, identity, conflicts, lines (line-level staging).      │
│     │              cli.rs: fetch/pull/push/                                            │
│     │              clone/merge (the Git installed on the computer)                     │
 │     │              through the Git installed on the computer                           │
 │     └── storage.rs review progress file, export                                        │
 │  model/        plain data types shared by all of the above                             │
 │  error.rs      one error type                                                          │
 └────────────────────────────────────────────────────────────────────────────────────────┘
```

## Rules that keep it readable

1. **Dependencies point downwards.** UI → commands → (docx, diff, git, storage) → model.
   `docx` never calls `git`; `diff` never reads files. Each can be tested alone.
2. **Commands stay thin.** If you are writing an `if` in `commands.rs`, it belongs in a module.
3. **`model/` has no logic**, only data. `src/api/types.ts` and `gitTypes.ts` mirror it (camelCase).
4. **Components do not call Tauri directly.** They use stores; stores use `api/commands.ts`.
5. **Every Git action goes through `run()` in `store/git.ts`**: it shows progress, logs, reports
   errors as toasts, and refreshes state afterwards. Destructive actions ask for confirmation first.
6. **All user-visible text that is shared lives in `src/strings.ts`**, ready for translation.
7. **All colours and sizes are tokens in `src/styles/tokens.css`**; dark and light are automatic.

## Why two Git engines

* **Built-in (libgit2)** for everything local: status, stage, commit, branches, stash, graph.
  Works without Git installed, and is fast.
* **Installed Git** (`git/cli.rs`) only for talking to servers (fetch, pull, push, clone) and
  merging. Pull and push need the user's logins (Git Credential Manager, SSH keys), and the
  installed Git already knows them. If Git is missing, the app says so and everything else works.

## The workspace (docking)

`app/layout.ts` defines the panels and the starting arrangement. Dragging tabs, splitting,
resizing borders and floating panels is done by the `dockview` library; the arrangement is
saved to localStorage (`inkdelta.layout.v2`) and restored on start. "Reset panel layout" in the
Settings menu or the command palette returns to the default. To add a panel: write the
component in `features/`, add its id to `PanelId` and `PANEL_TITLES` in `layout.ts`, map it in
`app/panels.tsx`, and add it to `buildDefaultLayout`.

## How a comparison works

1. The UI picks two versions (`Source` = commit id, working copy, plain file, or "empty").
2. `git::read_source` returns the .docx bytes for each (`empty` skips this: a new file is compared with nothing).
3. `docx::parse` reads the zip → XML tree → `Document` (blocks of tokens: words, spaces, images).
4. `diff::compare` aligns paragraphs/tables (`diff/blocks.rs`), pairs similar ones as edits
   (`diff/align.rs`), compares edited paragraphs word by word (`diff/words.rs`), numbers the
   changes and collects word counts.
5. `features/redline` renders it; the change ruler (`ChangeRuler.tsx`) shows where every change sits.

## Where to change things

| I want to…                                  | Look at                                       |
|---------------------------------------------|-----------------------------------------------|
| Support more Word features (footnotes…)     | `src-tauri/src/docx/parser.rs`                |
| Tune how paragraphs are matched             | `diff/align.rs` (`MIN_SIMILARITY`)            |
| Change how word diffs look/group            | `diff/words.rs`                               |
| Add a Git feature                           | function in `git/*.rs` + wrapper in `commands.rs` + register in `lib.rs` + `api/commands.ts` + action in `store/git.ts` |
| Change the commit graph drawing             | `features/graph/LaneSvg.tsx` (layout maths in `git/graph.rs`) |
| Add a command-palette entry                 | `app/commands.ts`                             |
| Change colours / spacing / fonts            | `src/styles/tokens.css`                       |
| Change a label                              | `src/strings.ts` (shared) or the component    |
| Change what is saved for review progress    | `features/review/reviewState.ts`              |

## Tests

* `cargo test --manifest-path src-tauri/Cargo.toml` runs 37 backend tests, including Git
  against throwaway repositories (created under `src-tauri/target/test-repos`) and push/pull
  against a local bare repository acting as the server.
* `INKDELTA_REPO=… INKDELTA_FILE=… INKDELTA_OLD_REV=… cargo test smoke -- --ignored --nocapture`
  compares a real document from a real repository.

## Known limits

* Tracked changes already inside a file are read as *accepted* (insertions kept, deletions dropped).
* Footnotes, headers/footers and text boxes are not compared yet.
* Moved paragraphs show as deleted + inserted.
* Images are compared by content hash (changed / added / removed), not pixel by pixel.
* Conflicts inside a Word file are resolved by keeping one whole version (after viewing a redline of the two); there is no merging of the text of two Word versions.
* In-app editing (`docx/edit.rs`) changes the text of existing paragraphs only: it cannot add or delete paragraphs, and paragraphs with equations, tabs, line breaks, pictures or fields are read-only (edit those in Word). It patches the original XML so formatting, images and styles survive; a paragraph whose text no longer matches what you saw is refused. Saving fails (with a clear message) if the file is open in Word.
* Line-by-line staging works for plain text files that were added or modified; Word files, other binaries and deleted files are staged whole.
* Rebase beyond `pull --rebase` and cherry-pick are not built.
