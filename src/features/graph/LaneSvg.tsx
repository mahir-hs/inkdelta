// The coloured lines and dot of one graph row.
//
// Each row is drawn on its own: lines arriving from above end at the middle of
// the row, lines leaving start at the middle and run to the bottom. Stacked
// rows join up into the full tree.

import type { GraphRow } from "../../api/gitTypes";

export const ROW_HEIGHT = 28;
export const LANE_WIDTH = 16;
const PADDING = 10;
const DOT_RADIUS = 4.5;
const LANE_COLORS = 8;

export const laneX = (lane: number) => PADDING + lane * LANE_WIDTH;
export const laneColor = (lane: number) => `var(--lane-${lane % LANE_COLORS})`;
export const graphWidth = (laneCount: number) => PADDING * 2 + Math.max(laneCount - 1, 0) * LANE_WIDTH;

/** A line between two lanes: straight if they match, otherwise a soft S-curve. */
function linePath(x1: number, y1: number, x2: number, y2: number): string {
  if (x1 === x2) return `M${x1} ${y1}V${y2}`;
  const mid = (y1 + y2) / 2;
  return `M${x1} ${y1}C${x1} ${mid} ${x2} ${mid} ${x2} ${y2}`;
}

export function LaneSvg({ row, laneCount, isHead }: { row: GraphRow; laneCount: number; isHead: boolean }) {
  const middle = ROW_HEIGHT / 2;
  const isMerge = row.parents.length > 1;

  return (
    <svg className="lanes" width={graphWidth(laneCount)} height={ROW_HEIGHT} aria-hidden="true">
      {row.top.map((link, i) => (
        <path key={`t${i}`} d={linePath(laneX(link.from), 0, laneX(link.to), middle)} stroke={laneColor(link.from)} />
      ))}
      {row.bottom.map((link, i) => (
        <path key={`b${i}`} d={linePath(laneX(link.from), middle, laneX(link.to), ROW_HEIGHT)} stroke={laneColor(link.to)} />
      ))}
      <circle
        cx={laneX(row.lane)}
        cy={middle}
        r={isHead ? DOT_RADIUS + 1.5 : DOT_RADIUS}
        fill={isMerge ? "var(--pane)" : laneColor(row.lane)}
        stroke={laneColor(row.lane)}
        strokeWidth={isMerge || isHead ? 2 : 0}
      />
    </svg>
  );
}
