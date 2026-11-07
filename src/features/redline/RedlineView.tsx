// The scrolling document with all changes marked.

import { useMemo, useState } from "react";
import type { DiffDocument } from "../../api/types";
import { blockHasChange } from "../../lib/diffUtils";
import { S } from "../../strings";
import { BlockView, type RenderContext } from "./BlockView";

interface Props {
  diff: DiffDocument;
  changesOnly: boolean;
  /** Show the newer version as a clean document. */
  reading?: boolean;
  /** Paragraphs can be edited in place. */
  editable?: boolean;
  selectedChange: number | null;
  onSelectChange: (change: number) => void;
}

/** A run of consecutive blocks that either all changed (or are unchanged and may be folded). */
interface Group {
  start: number;
  end: number; // exclusive
  folded: boolean;
}

export function RedlineView({ diff, changesOnly, reading = false, editable = false, selectedChange, onSelectChange }: Props) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const groups = useMemo(() => buildGroups(diff, changesOnly), [diff, changesOnly]);
  const context: RenderContext = { images: diff.images, selectedChange, onSelectChange, editable: reading && editable };

  return (
    <article className={reading ? "redline reading" : "redline"}>
      {diff.changeCount === 0 && <p className="notice">{S.noChanges}</p>}
      {groups.map((group) => {
        const isFolded = group.folded && !expanded.has(group.start);
        if (isFolded) {
          const count = group.end - group.start;
          return (
            <button
              key={group.start}
              className="fold"
              onClick={() => setExpanded(new Set(expanded).add(group.start))}
            >
              ⋯ {S.unchangedParagraphs(count)}
            </button>
          );
        }
        return diff.blocks
          .slice(group.start, group.end)
          .map((block, i) => <BlockView key={group.start + i} block={block} context={context} />);
      })}
    </article>
  );
}

/** Split the document into folded (unchanged) and visible groups. */
function buildGroups(diff: DiffDocument, changesOnly: boolean): Group[] {
  if (!changesOnly) return [{ start: 0, end: diff.blocks.length, folded: false }];

  const groups: Group[] = [];
  diff.blocks.forEach((block, index) => {
    const folded = !blockHasChange(block);
    const last = groups[groups.length - 1];
    if (last && last.folded === folded) {
      last.end = index + 1;
    } else {
      groups.push({ start: index, end: index + 1, folded });
    }
  });
  return groups;
}
