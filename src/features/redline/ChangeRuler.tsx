// The change ruler: a thin strip beside the document that shows where every
// change sits in the whole paper, like VS Code's overview ruler.
// Click a mark to jump to that change. The pale band is what is on screen now.

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import type { DiffDocument } from "../../api/types";

interface Mark {
  change: number;
  /** 0..1 position along the document. */
  at: number;
  kind: "inserted" | "deleted" | "modified";
}

interface Props {
  scroller: HTMLElement | null;
  diff: DiffDocument;
  /** Anything that changes the document's height (for example "changes only"). */
  layoutKey: string;
  selectedChange: number | null;
  onJump: (change: number) => void;
}

export function ChangeRuler({ scroller, diff, layoutKey, selectedChange, onJump }: Props) {
  const [marks, setMarks] = useState<Mark[]>([]);
  const [view, setView] = useState({ top: 0, height: 1 });

  const measure = useCallback(() => {
    if (!scroller) return;
    const total = Math.max(scroller.scrollHeight, 1);
    const origin = scroller.getBoundingClientRect().top - scroller.scrollTop;
    const found: Mark[] = [];
    scroller.querySelectorAll<HTMLElement>("[data-change]").forEach((element) => {
      const kind = ["inserted", "deleted", "modified"].find((k) => element.classList.contains(`kind-${k}`));
      if (!kind) return;
      found.push({
        change: Number(element.dataset.change),
        at: (element.getBoundingClientRect().top - origin) / total,
        kind: kind as Mark["kind"],
      });
    });
    setMarks(found);
  }, [scroller]);

  const updateView = useCallback(() => {
    if (!scroller) return;
    const total = Math.max(scroller.scrollHeight, 1);
    setView({ top: scroller.scrollTop / total, height: scroller.clientHeight / total });
  }, [scroller]);

  // Re-measure when the document or its size changes, and once the fonts are ready
  // (the serif font changes line heights).
  useLayoutEffect(() => {
    measure();
    updateView();
  }, [measure, updateView, diff, layoutKey]);

  useEffect(() => {
    if (!scroller) return;
    const observer = new ResizeObserver(() => {
      measure();
      updateView();
    });
    observer.observe(scroller);
    if (scroller.firstElementChild) observer.observe(scroller.firstElementChild);
    scroller.addEventListener("scroll", updateView, { passive: true });
    void document.fonts?.ready.then(() => {
      measure();
      updateView();
    });
    return () => {
      observer.disconnect();
      scroller.removeEventListener("scroll", updateView);
    };
  }, [scroller, measure, updateView, diff]);

  if (marks.length === 0) return <div className="ruler" aria-hidden="true" />;

  return (
    <div className="ruler" role="navigation" aria-label="Where the changes are">
      <div className="ruler-view" style={{ top: `${view.top * 100}%`, height: `${Math.max(view.height * 100, 1)}%` }} />
      {marks.map((mark) => (
        <button
          key={mark.change}
          className={`ruler-mark ${mark.kind}${mark.change === selectedChange ? " selected" : ""}`}
          style={{ top: `${mark.at * 100}%` }}
          title={`Change ${mark.change}`}
          aria-label={`Go to change ${mark.change}`}
          onClick={() => onJump(mark.change)}
        />
      ))}
    </div>
  );
}
