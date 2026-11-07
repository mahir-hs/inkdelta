// The logic behind the "Ask AI" chat, with no screen and no stores of its own (except reading the open document):
// which paragraphs the AI is shown, the exact prompt, and turning its reply into proposed document changes.
//
// The AI is free to just answer. Only when asked to change the document does it end its reply with a
// fenced block labelled `inkdelta` holding JSON; we parse that into edits / new paragraphs / removals.

import { forEachParagraph } from "../../lib/diffUtils";
import { useWorkspace } from "../../store/workspace";
import { candidatesFor } from "./suggest";

/** One paragraph of the open document as the AI sees it. */
export interface ParaInfo {
  position: number;
  text: string;
  /** 0 for body text, 1-6 for headings. */
  heading: number;
  editable: boolean;
}

/** What the AI is shown with a question. */
export type Scope =
  | { kind: "none" }
  | { kind: "selection" }
  | { kind: "section"; heading: number }
  | { kind: "document" }
  | { kind: "comment"; id: string; text: string };

export interface ChatTurn {
  role: "user" | "assistant";
  text: string;
}

export interface ChatContext {
  label: string;
  paragraphs: ParaInfo[];
  /** A reviewer comment the question is about. */
  comment?: string;
}

/** A change the AI proposes. `key` identifies it in the tick-list. */
export type Proposed =
  | { key: string; kind: "edit"; position: number; oldText: string; newText: string; why: string }
  | { key: string; kind: "insert"; after: number; afterText: string; like: number; text: string; why: string }
  | { key: string; kind: "delete"; position: number; oldText: string; why: string };

export interface ChatReply {
  /** The answer without the machine-readable block. */
  text: string;
  proposals: Proposed[];
  /** Suggestions that were dropped because they pointed at paragraphs the AI was not given. */
  ignored: number;
}

const SYSTEM = `You are an assistant helping an author work on a Word document (usually a research manuscript) inside the app Inkdelta.
You may be given numbered paragraphs from the document, written as [number] text. A paragraph marked (read-only) cannot be changed by the app.
Rules:
- Answer the request normally, in plain text, and be concise.
- NEVER invent data, results, numbers, citations, dataset details or methods. Where a fact is missing, write a short bracketed note for the authors, exactly like [AUTHORS TO CONFIRM: what is needed].
- Only when the user asks you to change, add or remove document text, end your reply with ONE fenced block like this:
\`\`\`inkdelta
{"edits": [{"position": 12, "newText": "<complete new text of paragraph 12>", "why": "<short reason>"}],
 "inserts": [{"after": 12, "text": "<complete text of one new paragraph>", "why": "<short reason>"}],
 "deletes": [{"position": 15, "why": "<short reason>"}]}
\`\`\`
- "edits" rewrite a paragraph you were given (always the complete new text). "inserts" add one new paragraph after a paragraph you were given: for several new paragraphs use several inserts in reading order, all with the same "after". "deletes" remove a paragraph you were given.
- Use only paragraph numbers you were given, and never change read-only paragraphs. Leave out any key you do not need. Do not add the block when no change to the document is wanted.`;

// ------------------------------------------------------------ the open document

/** Every paragraph of the open document in reading order (new version, deleted paragraphs left out). */
export function documentParagraphs(): ParaInfo[] {
  const diff = useWorkspace.getState().diff;
  const list: ParaInfo[] = [];
  if (!diff) return list;
  forEachParagraph(diff.blocks, (p) => {
    if (p.kind === "deleted") return;
    // Exactly as in the file (no trimming): saving checks the text against the document.
    const text = p.segments.filter((s) => s.op !== "deleted" && !s.image).map((s) => s.text).join("");
    if (text.trim() === "") return;
    list.push({ position: p.position, text, heading: p.heading, editable: p.editable });
  });
  return list;
}

export interface SectionInfo {
  position: number;
  title: string;
  level: number;
}

export function sectionsOf(paragraphs: ParaInfo[]): SectionInfo[] {
  return paragraphs.filter((p) => p.heading > 0).map((p) => ({ position: p.position, title: p.text.trim().slice(0, 80), level: p.heading }));
}

/** A heading and everything below it, until the next heading of the same or a higher level. */
function sectionParagraphs(paragraphs: ParaInfo[], heading: number): ParaInfo[] {
  const start = paragraphs.findIndex((p) => p.position === heading);
  if (start < 0) return [];
  const level = paragraphs[start].heading;
  let end = start + 1;
  while (end < paragraphs.length && !(paragraphs[end].heading > 0 && paragraphs[end].heading <= level)) end++;
  return paragraphs.slice(start, end);
}

/** The paragraphs a scope covers. `selected` are the positions captured from the reading view. */
export function contextFor(scope: Scope, selected: number[]): ChatContext {
  const all = documentParagraphs();
  switch (scope.kind) {
    case "none":
      return { label: "No document text", paragraphs: [] };
    case "selection": {
      const wanted = new Set(selected);
      const paragraphs = all.filter((p) => wanted.has(p.position));
      return { label: `Selected text (${paragraphs.length} paragraph${paragraphs.length === 1 ? "" : "s"})`, paragraphs };
    }
    case "section": {
      const paragraphs = sectionParagraphs(all, scope.heading);
      return { label: `Section: ${paragraphs[0]?.text.trim().slice(0, 50) ?? "?"}`, paragraphs };
    }
    case "document":
      return { label: `Whole document (${all.length} paragraphs)`, paragraphs: all };
    case "comment": {
      const found = new Set(candidatesFor(scope.text, 8).map((c) => c.position));
      return { label: "Review comment and related paragraphs", paragraphs: all.filter((p) => found.has(p.position)), comment: scope.text };
    }
  }
}

// ------------------------------------------------------------ the prompt

const MAX_TURNS = 8;
const MAX_REPLY_CHARS = 2000;

/** The exact text sent. The tool is called once per message, so earlier turns are repeated here. */
/** `allowEdits` adds the format instructions (about 300 tokens) so the AI can propose document changes; without it the AI just chats. */
export function buildChatPrompt(history: ChatTurn[], context: ChatContext, question: string, allowEdits: boolean): { system: string; user: string } {
  const parts: string[] = [];
  if (history.length > 0) {
    const recent = history.slice(-MAX_TURNS * 2);
    parts.push("CONVERSATION SO FAR:\n" + recent.map((t) => `${t.role === "user" ? "USER" : "ASSISTANT"}: ${t.text.slice(0, MAX_REPLY_CHARS)}`).join("\n\n"));
  }
  if (context.comment) parts.push(`REVIEWER COMMENT:\n${context.comment}`);
  if (context.paragraphs.length > 0) {
    const body = context.paragraphs.map((p) => `[${p.position}]${p.editable ? "" : " (read-only)"} ${p.heading > 0 ? "(heading) " : ""}${p.text.trim()}`).join("\n\n");
    parts.push(`PARAGRAPHS FROM THE DOCUMENT (${context.label}):\n${body}`);
  }
  parts.push(`USER REQUEST:\n${question.trim()}`);
  return { system: allowEdits ? SYSTEM : "", user: parts.join("\n\n") };
}

// ------------------------------------------------------------ size of the next message

/** A rough token count (about 4 characters per token for English). Only an estimate, never exact. */
export const estimateTokens = (prompt: { system: string; user: string }): number => Math.ceil((prompt.system.length + prompt.user.length) / 4);

/** The model's context window as far as the name tells: 1M if it says so, otherwise the usual 200k. */
export const contextWindowFor = (model: string): number => (/1m/i.test(model) ? 1_000_000 : 200_000);

// ------------------------------------------------------------ the reply

const BLOCK = /```inkdelta\s*([\s\S]*?)```/g;

export function parseChatReply(reply: string, context: ChatContext): ChatReply {
  let block: string | undefined;
  for (const match of reply.matchAll(BLOCK)) block = match[1]; // the last one wins
  const text = reply.replace(BLOCK, "").trim();
  if (block === undefined) return { text: text || reply.trim(), proposals: [], ignored: 0 };

  let data: { edits?: unknown; inserts?: unknown; deletes?: unknown };
  try {
    data = JSON.parse(block.slice(block.indexOf("{"), block.lastIndexOf("}") + 1));
  } catch {
    return { text: `${text}\n\n(The proposed changes could not be read. Ask again.)`.trim(), proposals: [], ignored: 0 };
  }

  const given = new Map(context.paragraphs.map((p) => [p.position, p]));
  const proposals: Proposed[] = [];
  let ignored = 0;
  const list = (value: unknown): Record<string, unknown>[] => (Array.isArray(value) ? value.filter((v): v is Record<string, unknown> => !!v && typeof v === "object") : []);
  const why = (v: Record<string, unknown>) => (typeof v.why === "string" ? v.why : "");

  for (const e of list(data.edits)) {
    const p = typeof e.position === "number" ? given.get(e.position) : undefined;
    if (!p || !p.editable || typeof e.newText !== "string" || !e.newText.trim()) { ignored++; continue; }
    // Keep the paragraph's own leading/trailing spacing so only the words change.
    const lead = p.text.match(/^\s*/)?.[0] ?? "";
    const trail = p.text.match(/\s*$/)?.[0] ?? "";
    const newText = lead + e.newText.replace(/\r?\n/g, " ").trim() + trail;
    if (newText !== p.text) proposals.push({ key: `e${p.position}`, kind: "edit", position: p.position, oldText: p.text, newText, why: why(e) });
  }
  list(data.inserts).forEach((e, i) => {
    const after = typeof e.after === "number" ? given.get(e.after) : undefined;
    if (!after || typeof e.text !== "string" || !e.text.trim()) { ignored++; return; }
    proposals.push({ key: `i${i}`, kind: "insert", after: after.position, afterText: after.text, like: styleSource(after.position), text: e.text.replace(/\r?\n/g, " ").trim(), why: why(e) });
  });
  for (const e of list(data.deletes)) {
    const p = typeof e.position === "number" ? given.get(e.position) : undefined;
    if (!p || !p.editable) { ignored++; continue; }
    proposals.push({ key: `d${p.position}`, kind: "delete", position: p.position, oldText: p.text, why: why(e) });
  }
  return { text, proposals, ignored };
}

/** A new paragraph copies the look of the paragraph it follows, unless that is a heading: then the next body paragraph. */
function styleSource(after: number): number {
  const all = documentParagraphs();
  const at = all.findIndex((p) => p.position === after);
  if (at < 0 || all[at].heading === 0) return after;
  return all.slice(at + 1).find((p) => p.heading === 0 && p.editable)?.position ?? after;
}
