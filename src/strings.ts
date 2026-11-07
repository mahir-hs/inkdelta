// Every piece of text the user sees lives here.
// To translate Inkdelta, copy this object and replace the values.

export const S = {
  appName: "Inkdelta",
  tagline: "See exactly what changed in your document.",

  openFolder: "Open project folder",
  compareFiles: "Compare two files",
  file: "Document",
  from: "From",
  to: "To",
  workingCopy: "Working copy",
  uncommitted: "unsaved changes",
  original: "Original",
  previous: "Previous",
  changesOnly: "Changes only",
  exportHtml: "Export redline",
  print: "Print / PDF",
  nextChange: "Next change",
  previousChange: "Previous change",
  noChanges: "No differences between these two versions.",
  unchangedParagraphs: (n: number) => `${n} unchanged paragraph${n === 1 ? "" : "s"}`,

  welcomeTitle: "Compare any two versions of a Word document",
  welcomeBody:
    "Open a project folder that uses Git to browse every saved version of your paper, or compare two .docx files directly.",
  noHistory: "This document has only one version so far.",
  loading: "Comparing…",
  chooseOldFile: "Choose the OLDER .docx",
  chooseNewFile: "Choose the NEWER .docx",

  tabReviewer: "Reviewer comments",
  tabChanges: "Changes",
  tabWord: "Word comments",

  reviewerFile: "Reviewer file",
  chooseReviewerFile: "Choose file…",
  browse: "Browse…",
  noReviewerFile: "Pick the document that contains the reviewer's comments.",
  progress: (done: number, total: number) => `${done} of ${total} addressed`,
  filterAll: "All",
  filterOpen: "Open",
  filterDone: "Done",
  addNote: "Add note",
  linkChange: "Link selected change",
  linkHint: "Select a change in the document first, then link it to this comment.",
  unlink: "Remove link",
  statusOpen: "Open",
  statusProgress: "In progress",
  statusDone: "Done",
  statusSkipped: "Won't fix",

  noWordComments: "This version has no Word comments.",
  noChangeList: "No changes to list.",

  stats: (added: number, removed: number) => `+${added} words, −${removed} words`,
  changeCounter: (current: number, total: number) => `${current} / ${total}`,
};
