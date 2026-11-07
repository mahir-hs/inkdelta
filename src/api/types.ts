// Types that mirror the Rust backend (src-tauri/src/model/*).
// If you change a struct in Rust, change it here too. Field names are camelCase.

export type SourceKind = "git" | "workdir" | "file" | "empty" | "stage";

/** Points at one version of one document. */
export interface Source {
  kind: SourceKind;
  repo?: string | null;
  rev?: string | null;
  /** Repo-relative for git/workdir, absolute for file. */
  path: string;
}

export interface RepoInfo {
  root: string;
  name: string;
  branch: string;
  docxFiles: string[];
}

export interface VersionInfo {
  kind: "commit" | "workdir";
  id: string;
  shortId: string;
  summary: string;
  author: string;
  /** Unix seconds. */
  time: number;
  tags: string[];
  dirty: boolean;
}

export type SegmentOp = "equal" | "inserted" | "deleted";
export type BlockKind = "equal" | "inserted" | "deleted" | "modified";

export interface DiffSegment {
  op: SegmentOp;
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  superscript: boolean;
  subscript: boolean;
  math: boolean;
  /** Image hash; look it up in DiffDocument.images. */
  image?: string;
}

export interface DiffParagraph {
  type: "paragraph";
  kind: BlockKind;
  heading: number;
  listMarker?: string;
  indent: number;
  /** Where this paragraph sits in the document (used to save edits into the right place). */
  position: number;
  /** Plain text only, so it can be edited in the app. */
  editable: boolean;
  segments: DiffSegment[];
  /** 1-based number among all changes. Missing when unchanged. */
  change?: number;
}

export interface DiffTable {
  type: "table";
  kind: BlockKind;
  rows: DiffBlock[][][];
}

export type DiffBlock = DiffParagraph | DiffTable;

export interface Stats {
  insertedParagraphs: number;
  deletedParagraphs: number;
  modifiedParagraphs: number;
  wordsAdded: number;
  wordsRemoved: number;
}

export interface WordComment {
  id: string;
  author: string;
  date: string;
  text: string;
  anchorBlock?: number;
  anchorText: string;
}

export interface DiffDocument {
  blocks: DiffBlock[];
  changeCount: number;
  stats: Stats;
  images: Record<string, string>;
  comments: WordComment[];
}

export interface OutlineItem {
  index: number;
  heading: number;
  listMarker?: string;
  text: string;
}

export interface Outline {
  items: OutlineItem[];
  comments: WordComment[];
}
