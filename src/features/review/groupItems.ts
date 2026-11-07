// Turns the reviewer's document (a flat list of paragraphs) into titled groups
// such as "Major Comments" and "Minor Comments".

import type { OutlineItem } from "../../api/types";
import { textId } from "../../lib/format";

export interface ReviewComment {
  /** Stable id derived from the text, so progress survives re-reading the file. */
  id: string;
  marker?: string;
  text: string;
}

export interface CommentGroup {
  title: string;
  comments: ReviewComment[];
}

/** A short line without a list marker or full stop is treated as a group title. */
function looksLikeTitle(item: OutlineItem): boolean {
  if (item.listMarker) return false;
  if (item.heading > 0) return true;
  const words = item.text.split(/\s+/).length;
  return words <= 4 && !/[.:;]$/.test(item.text) && !/^\d+[.)]/.test(item.text);
}

export function groupComments(items: OutlineItem[], fallbackTitle: string): CommentGroup[] {
  const groups: CommentGroup[] = [];
  let current: CommentGroup | null = null;

  for (const item of items) {
    if (looksLikeTitle(item)) {
      current = { title: item.text, comments: [] };
      groups.push(current);
      continue;
    }
    if (!current) {
      current = { title: fallbackTitle, comments: [] };
      groups.push(current);
    }
    current.comments.push({ id: textId(item.text), marker: item.listMarker, text: item.text });
  }
  return groups.filter((g) => g.comments.length > 0);
}
