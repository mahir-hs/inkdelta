// Turning a reviewer comment into a question for an AI, and its answer into proposed edits.

import { api } from "../../api/commands";
import { forEachParagraph } from "../../lib/diffUtils";
import type { AiConfig } from "../../store/ai";
import { useWorkspace } from "../../store/workspace";

export interface Candidate {
  position: number;
  text: string;
}

export interface ProposedEdit {
  position: number;
  oldText: string;
  newText: string;
  why: string;
}

export interface Result {
  summary: string;
  edits: ProposedEdit[];
  /** Things the authors must do themselves (new experiments, data, citations). */
  manual: string[];
}

export interface Suggestion {
  phase: "confirm" | "working" | "result" | "error";
  comment: string;
  commentId: string;
  candidates: Candidate[];
  result?: Result;
  error?: string;
  chosen: Set<number>;
}

const SYSTEM = `You are a careful scientific editor helping authors respond to a peer-review comment on their manuscript.
Rules:
- Only rewrite the numbered paragraphs you are given, and only where the comment calls for a change. Leave other paragraphs out.
- NEVER invent data, results, numbers, citations, dataset details or methods. Where a fact is missing, write a short bracketed note for the authors, exactly like [AUTHORS TO CONFIRM: what is needed].
- Keep each paragraph's meaning, technical terms and approximate length. Change claims only to make them accurate or appropriately cautious.
- If the comment needs work that wording cannot fix (new experiments, new analysis, a new table), say so in "manual" instead of pretending to fix it.
- Reply with ONE JSON object and nothing else:
{"summary": "one or two sentences on how the comment is addressed",
 "edits": [{"position": <number from the brackets>, "newText": "<full new text of that paragraph>", "why": "<short reason>"}],
 "manual": ["<things the authors must still do>"]}`;

const STOP = new Set("the and that this with from have been should which their there about would could these those what when where while into than then also more most such only other some each both does not are for was were will can may must needs need please authors author manuscript paper study".split(" "));

const words = (text: string): string[] => (text.toLowerCase().match(/[a-z0-9][a-z0-9-]{2,}/g) ?? []).filter((w) => !STOP.has(w));

/** The editable paragraphs of the open document that best match the comment (simple word overlap). */
export function candidatesFor(comment: string, limit = 6): Candidate[] {
  const diff = useWorkspace.getState().diff;
  if (!diff) return [];
  const wanted = new Set(words(comment));
  const mentioned = (comment.match(/(table|figure|section)\s+\d+(\.\d+)?/gi) ?? []).map((m) => m.toLowerCase().replace(/\s+/g, " "));
  const scored: { c: Candidate; score: number }[] = [];

  forEachParagraph(diff.blocks, (p) => {
    if (!p.editable || p.kind === "deleted") return;
    // Keep the text exactly as in the file (no trimming): the save checks it against the document.
    const text = p.segments.filter((s) => s.op !== "deleted" && !s.image).map((s) => s.text).join("");
    if (text.trim().length < 40) return;
    const own = new Set(words(text));
    let shared = 0;
    wanted.forEach((w) => own.has(w) && shared++);
    const lower = text.toLowerCase().replace(/\s+/g, " ");
    const bonus = mentioned.some((m) => lower.includes(m)) ? 3 : 0;
    const score = shared / Math.sqrt(own.size + 4) + bonus;
    if (shared >= 2 || bonus > 0) scored.push({ c: { position: p.position, text }, score });
  });
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((x) => x.c);
}

export function buildPrompt(s: Pick<Suggestion, "comment" | "candidates">): { system: string; user: string } {
  const paragraphs = s.candidates.map((c) => `[${c.position}] ${c.text.trim()}`).join("\n\n");
  return { system: SYSTEM, user: `REVIEWER COMMENT:\n${s.comment}\n\nPARAGRAPHS FROM THE MANUSCRIPT:\n${paragraphs}` };
}

/** Send one request. For the connection test the caller passes its own system/user text. */
export async function askAi(config: AiConfig, system?: string, user?: string, suggestion?: Suggestion): Promise<string> {
  const prompt = suggestion ? buildPrompt(suggestion) : { system: system ?? "", user: user ?? "" };
  return api.aiComplete({ kind: config.kind, model: config.model, baseUrl: config.baseUrl, apiKey: config.apiKey, command: config.command, effort: config.effort }, prompt.system, prompt.user);
}

/** The first complete {...} object in the reply (tools often add chatter around it), checked against what was asked. */
export function parseReply(reply: string, candidates: Candidate[]): Result {
  const start = reply.indexOf("{");
  const end = reply.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The AI did not answer in the expected format. Try again.");
  let data: { summary?: unknown; edits?: unknown; manual?: unknown };
  try {
    data = JSON.parse(reply.slice(start, end + 1));
  } catch {
    throw new Error("The AI's answer could not be read. Try again.");
  }
  const byPosition = new Map(candidates.map((c) => [c.position, c.text]));
  const edits: ProposedEdit[] = [];
  for (const raw of Array.isArray(data.edits) ? data.edits : []) {
    const e = raw as { position?: unknown; newText?: unknown; why?: unknown };
    const oldText = typeof e.position === "number" ? byPosition.get(e.position) : undefined;
    if (oldText === undefined || typeof e.newText !== "string") continue; // only paragraphs we offered
    // Keep the paragraph's own leading/trailing spacing, so only the words change.
    const lead = oldText.match(/^\s*/)?.[0] ?? "";
    const trail = oldText.match(/\s*$/)?.[0] ?? "";
    const newText = lead + e.newText.replace(/\r?\n/g, " ").trim() + trail;
    if (e.newText.trim() && newText !== oldText) edits.push({ position: e.position as number, oldText, newText, why: typeof e.why === "string" ? e.why : "" });
  }
  return {
    summary: typeof data.summary === "string" ? data.summary : "",
    edits,
    manual: Array.isArray(data.manual) ? data.manual.filter((m): m is string => typeof m === "string") : [],
  };
}
