// A clickable list of every change, in reading order.

import { useMemo } from "react";
import type { DiffDocument } from "../../api/types";
import { listChanges } from "../../lib/diffUtils";
import { S } from "../../strings";

interface Props {
  diff: DiffDocument;
  selectedChange: number | null;
  onSelect: (change: number) => void;
}

const KIND_LABEL = { inserted: "Added", deleted: "Removed", modified: "Edited", equal: "" } as const;

export function ChangesList({ diff, selectedChange, onSelect }: Props) {
  const changes = useMemo(() => listChanges(diff), [diff]);
  if (changes.length === 0) return <p className="muted">{S.noChangeList}</p>;

  return (
    <ul className="changes-list">
      {changes.map((c) => (
        <li key={c.change}>
          <button className={c.change === selectedChange ? "active" : ""} onClick={() => onSelect(c.change)}>
            <span className={`badge ${c.kind}`}>{KIND_LABEL[c.kind]}</span>
            <span className="num">#{c.change}</span>
            <span className="excerpt">{c.excerpt}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
