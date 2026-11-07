// Draws one block of the redline: a paragraph (with inserted/deleted words) or a table.
// This component is also used by the HTML export, so it must stay free of app state.

import { useEffect, useRef } from "react";
import type { DiffBlock, DiffParagraph, DiffSegment } from "../../api/types";
import { useDocEdits } from "../../store/docEdits";

export interface RenderContext {
  /** image hash -> data: URL */
  images: Record<string, string>;
  selectedChange: number | null;
  /** Text can be edited in place (reading the working copy). */
  editable?: boolean;
  /** Omit for read-only output (export). */
  onSelectChange?: (change: number) => void;
}

const PARAGRAPH_TAGS = ["p", "h1", "h2", "h3", "h4", "h5", "h6"] as const;

export function BlockView({ block, context }: { block: DiffBlock; context: RenderContext }) {
  if (block.type === "paragraph") return <ParagraphView paragraph={block} context={context} />;

  return (
    <div className="table-wrap">
      <table className="doc-table">
        <tbody>
          {block.rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, c) => (
                <td key={c}>
                  {cell.map((inner, i) => (
                    <BlockView key={i} block={inner} context={context} />
                  ))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ParagraphView({ paragraph, context }: { paragraph: DiffParagraph; context: RenderContext }) {
  const Tag = PARAGRAPH_TAGS[Math.min(paragraph.heading, 6)];
  const isChange = paragraph.change !== undefined;
  const selected = isChange && paragraph.change === context.selectedChange;

  const classes = ["para", `kind-${paragraph.kind}`, `indent-${paragraph.indent}`];
  if (selected) classes.push("selected");
  if (paragraph.segments.length === 0) classes.push("empty");

  return (
    <Tag
      className={classes.join(" ")}
      data-change={paragraph.change}
      onClick={isChange && context.onSelectChange ? () => context.onSelectChange!(paragraph.change!) : undefined}
    >
      {isChange && <span className="change-number">{paragraph.change}</span>}
      {paragraph.listMarker && <span className="list-marker">{paragraph.listMarker}</span>}
      {context.editable && paragraph.editable && paragraph.kind !== "deleted" ? (
        <EditableText paragraph={paragraph} />
      ) : null}
      {!(context.editable && paragraph.editable && paragraph.kind !== "deleted") && paragraph.segments.map((segment, i) => (
        <SegmentView key={i} segment={segment} images={context.images} />
      ))}
    </Tag>
  );
}

function SegmentView({ segment, images }: { segment: DiffSegment; images: Record<string, string> }) {
  const classes = ["seg", `op-${segment.op}`];
  if (segment.bold) classes.push("bold");
  if (segment.italic) classes.push("italic");
  if (segment.underline) classes.push("underline");
  if (segment.superscript) classes.push("sup");
  if (segment.subscript) classes.push("sub");
  if (segment.math) classes.push("math");

  if (segment.image) {
    const source = images[segment.image];
    return source ? <img className={classes.join(" ")} src={source} alt="" /> : null;
  }
  return <span className={classes.join(" ")}>{segment.text}</span>;
}

/** The paragraph's text, editable in place. Edits are collected and saved together. */
function EditableText({ paragraph }: { paragraph: DiffParagraph }) {
  const original = paragraph.segments.filter((s) => s.op !== "deleted" && !s.image).map((s) => s.text).join("");
  const ref = useRef<HTMLSpanElement>(null);
  const edited = useDocEdits((s) => s.edits.has(paragraph.position));

  // Keep the on-screen text in step with the state, but only touch it when it differs, so the cursor
  // never jumps while the user types. This also resets the text when edits are discarded.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const pending = useDocEdits.getState().edits.get(paragraph.position);
    if (pending) {
      if (el.textContent !== pending.newText) el.textContent = pending.newText;
    } else if (el.textContent !== original || !el.dataset.filled) {
      fillFormatted(el, paragraph.segments); // bold, italic and superscripts are kept while editing
      el.dataset.filled = "yes";
    }
  }, [original, paragraph.position, edited]);

  return (
    <span
      ref={ref}
      className={edited ? "editable edited" : "editable"}
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      spellCheck
      onInput={() => useDocEdits.getState().set(paragraph.position, original, ref.current?.textContent ?? "")}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.preventDefault(); // paragraphs are not added or removed here
      }}
    />
  );
}

/** Fill an editable element with the paragraph's text, one span per formatting change. */
function fillFormatted(element: HTMLElement, segments: DiffSegment[]) {
  element.textContent = "";
  for (const segment of segments) {
    if (segment.op === "deleted" || segment.image) continue;
    const span = document.createElement("span");
    span.className = ["seg", `op-${segment.op}`, segment.bold && "bold", segment.italic && "italic", segment.underline && "underline", segment.superscript && "sup", segment.subscript && "sub"]
      .filter(Boolean)
      .join(" ");
    span.textContent = segment.text;
    element.appendChild(span);
  }
}
