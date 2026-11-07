# Inkdelta

See exactly what changed between versions of a Word document, track which reviewer
comments you have addressed, and manage the project with a full Git client.
Windows, macOS and Linux.

* **Redline:** word-level differences with formatting, tables, images and equations, plus a
  change ruler that shows where every change sits in the whole paper.
* **Reading and editing:** documents open as a clean reading page. When you are reading the working copy, click any text
  to edit it, then **Save** (written into the `.docx`, everything else untouched) or **Save & commit…** (and push).
* **Versions:** compare any two versions from Git history, a file against its last commit, or two loose `.docx` files.
* **Reviewer comments:** a checklist with status, notes, and links to the changes that address each comment.
* **Git client:** source control (stage, commit, amend), branches, stash, tags, a colour-coded
  history graph, fetch / pull / push, clone, and merge. Destructive actions always ask first.
* **Line-by-line staging:** open a changed text file, pick individual lines or whole hunks
  (click, shift+click for a range), and stage or unstage exactly those.
* **Merge conflicts:** resolve text files section by section (keep mine, take theirs, keep both,
  or edit by hand), and Word files by viewing a redline of the two versions and keeping one.
* **VS Code-style workspace:** drag tabs to any edge, split, resize borders, float panels.
  The layout is remembered. Press **Ctrl+K** for every command.
* Light and dark themes. Export the redline as HTML or print it to PDF.

Architecture and where to change things: see [ARCHITECTURE.md](ARCHITECTURE.md).

## Develop

Requirements: Node 22+, pnpm, Rust (stable), and on Windows the *Visual Studio C++ Build Tools*.
Pull, push and clone also need Git installed on the computer (everything else works without it).

```
pnpm install
pnpm app          # run the desktop app in development
pnpm bundle       # build installers into src-tauri/target/release/bundle
cargo test --manifest-path src-tauri/Cargo.toml   # backend tests
```

Start the app on a project directly: `inkdelta <folder>`.

## Release (all three operating systems)

Push a tag like `v0.1.0`. GitHub Actions (`.github/workflows/release.yml`) builds the
Windows, macOS and Linux installers and attaches them to a draft release.
