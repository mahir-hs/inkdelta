// Helpers that read a DiffDocument. No React in here.

import type { BlockKind, DiffBlock, DiffDocument, DiffParagraph } from "../api/types";

/** Run `visit` on every paragraph, including those inside table cells, in reading order. */
export function forEachParagraph(blocks: DiffBlock[], visit: (paragraph: DiffParagraph) => void): void {
  for (const block of blocks) {
    if (block.type === "paragraph") {
      visit(block);
    } else {
      for (const row of block.rows) for (const cell of row) forEachParagraph(cell, visit);
    }
  }
}

/** True if this block, or anything inside it, changed. */
export function blockHasChange(block: DiffBlock): boolean {
  if (block.type === "paragraph") return block.kind !== "equal";
  return block.rows.some((row) => row.some((cell) => cell.some(blockHasChange)));
}

/** Text of a paragraph as it reads in the newer version (deleted text excluded, unless the whole paragraph was deleted). */
export function paragraphText(paragraph: DiffParagraph): string {
  const keepDeleted = paragraph.kind === "deleted";
  return paragraph.segments
    .filter((s) => !s.image && (keepDeleted || s.op !== "deleted"))
    .map((s) => s.text)
    .join("")
    .trim();
}

export interface ChangeSummary {
  change: number;
  kind: BlockKind;
  excerpt: string;
}

export function listChanges(diff: DiffDocument): ChangeSummary[] {
  const list: ChangeSummary[] = [];
  forEachParagraph(diff.blocks, (p) => {
    if (p.change !== undefined) {
      list.push({ change: p.change, kind: p.kind, excerpt: paragraphText(p).slice(0, 140) || "(image or empty paragraph)" });
    }
  });
  return list;
}

/** Short stable text used to remember which change a reviewer comment was linked to. */
export function excerptOfChange(diff: DiffDocument, change: number): string | null {
  return listChanges(diff).find((c) => c.change === change)?.excerpt.slice(0, 80) ?? null;
}

/** Inverse of excerptOfChange: find the change (in the current comparison) with this excerpt. */
export function findChangeByExcerpt(diff: DiffDocument, excerpt: string): number | null {
  const match = listChanges(diff).find((c) => c.excerpt.startsWith(excerpt));
  return match ? match.change : null;
}
