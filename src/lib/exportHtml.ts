// Builds a standalone HTML file of the redline that opens in any browser
// (and prints to PDF from there). It reuses the same React components as the app.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { DiffDocument } from "../api/types";
import { BlockView } from "../features/redline/BlockView";
import redlineCss from "../styles/redline.css?raw";
import tokensCss from "../styles/tokens.css?raw";
import { S } from "../strings";

export function buildRedlineHtml(diff: DiffDocument, title: string): string {
  const context = { images: diff.images, selectedChange: null };
  const body = diff.blocks
    .map((block) => renderToStaticMarkup(createElement(BlockView, { block, context })))
    .join("\n");

  const { wordsAdded, wordsRemoved } = diff.stats;
  return `<!doctype html>
<html lang="en" data-theme="light"><head><meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>${tokensCss}\n${redlineCss}\nbody{margin:0;background:var(--window)}</style>
</head><body>
<header style="padding:12px 24px;border-bottom:1px solid var(--line);font:14px system-ui;color:var(--text)">
  <strong>${escapeHtml(title)}</strong> — ${diff.changeCount} changes, ${escapeHtml(S.stats(wordsAdded, wordsRemoved))}
  <span class="seg op-inserted">added</span> <span class="seg op-deleted">removed</span>
</header>
<article class="redline">${body}</article>
</body></html>`;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
