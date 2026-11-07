// The AI assistant: which service to use, and one reviewer comment being worked on.
//
// Flow: start() finds the paragraphs a comment is about -> the user sees exactly what will be
// sent and confirms -> send() asks the AI -> the user ticks the edits they accept -> apply()
// puts them into the document as ordinary pending edits (still editable, still saved by the user).

import { create } from "zustand";
import { api, errorMessage } from "../api/commands";
import { askAi, candidatesFor, parseReply, type Candidate, type Suggestion } from "../features/ai/suggest";
import { useDocEdits } from "./docEdits";
import { useReview } from "./review";
import { useUi } from "./ui";
import { useWorkspace } from "./workspace";

export interface AiConfig {
  preset: string;
  kind: "cli" | "anthropic" | "openai";
  model: string;
  baseUrl: string;
  apiKey: string;
  command: string;
  /** Claude Code only: low, medium, high, xhigh, max. Empty = the tool's default. */
  effort: string;
}

export interface Preset extends Partial<AiConfig> {
  id: string;
  label: string;
  kind: AiConfig["kind"];
  note: string;
}

export const PRESETS: Preset[] = [
  { id: "claude-cli", label: "Claude Code (command line)", kind: "cli", command: "claude -p", note: "Uses the Claude Code login already on this computer. No key needed." },
  { id: "codex-cli", label: "Codex (command line)", kind: "cli", command: "codex exec -", note: "Uses the Codex login already on this computer. No key needed." },
  { id: "anthropic", label: "Claude (API key)", kind: "anthropic", baseUrl: "https://api.anthropic.com", model: "claude-sonnet-5-5", note: "Your Anthropic API key." },
  { id: "openrouter", label: "OpenRouter", kind: "openai", baseUrl: "https://openrouter.ai/api/v1", model: "anthropic/claude-sonnet-4.5", note: "Your OpenRouter key. Any model OpenRouter offers." },
  { id: "ollama", label: "Ollama (on this computer)", kind: "openai", baseUrl: "http://localhost:11434/v1", model: "llama3.1", note: "Runs locally: nothing leaves this computer. Install Ollama and a model first." },
  { id: "custom-openai", label: "Other OpenAI-compatible service", kind: "openai", note: "Any service with an OpenAI-style /chat/completions address." },
  { id: "custom-cli", label: "Other command-line tool", kind: "cli", command: "", note: "Any command that reads the prompt from standard input and prints the answer." },
];

const KEY = "inkdelta.ai";
const EMPTY: AiConfig = { preset: "", kind: "cli", model: "", baseUrl: "", apiKey: "", command: "", effort: "" };

function read(): AiConfig {
  try {
    return { ...EMPTY, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return EMPTY;
  }
}

interface AiState {
  config: AiConfig;
  settingsOpen: boolean;
  suggestion: Suggestion | null;

  isConfigured: () => boolean;
  openSettings: (open: boolean) => void;
  setConfig: (patch: Partial<AiConfig>) => void;
  usePreset: (id: string) => void;
  /** Check the connection with a tiny request. Returns a message for the user. */
  test: () => Promise<string>;

  start: (comment: string, commentId: string) => void;
  /** Start on the first review comment that is not addressed yet. */
  startNext: () => void;
  send: () => Promise<void>;
  toggle: (position: number) => void;
  apply: () => void;
  close: () => void;
}

export const useAi = create<AiState>((set, get) => ({
  config: read(),
  settingsOpen: false,
  suggestion: null,

  isConfigured: () => {
    const c = get().config;
    return c.kind === "cli" ? c.command.trim() !== "" : c.baseUrl.trim() !== "" && c.model.trim() !== "" && (c.preset === "ollama" || c.apiKey.trim() !== "" || c.preset === "custom-openai");
  },
  openSettings: (open) => set({ settingsOpen: open }),
  setConfig: (patch) => {
    const config = { ...get().config, ...patch };
    try { localStorage.setItem(KEY, JSON.stringify(config)); } catch { /* ignore */ }
    set({ config });
  },
  usePreset: (id) => {
    const p = PRESETS.find((x) => x.id === id);
    if (p) get().setConfig({ preset: p.id, kind: p.kind, command: p.command ?? "", baseUrl: p.baseUrl ?? "", model: p.model ?? "" });
  },
  test: async () => {
    try {
      const reply = await askAi(get().config, "You are a connection test.", "Reply with the single word OK.");
      return `Connected. The service answered: ${reply.trim().slice(0, 60)}`;
    } catch (e) {
      return errorMessage(e);
    }
  },

  start: (comment, commentId) => {
    const ui = useUi.getState();
    const ws = useWorkspace.getState();
    if (!get().isConfigured()) {
      ui.toast("info", "Choose an AI service first.");
      set({ settingsOpen: true });
      return;
    }
    if (ws.loose || ws.newKey !== "workdir") {
      ui.toast("info", "Open the working copy of the document (Documents, then Working copy) so suggested edits can be applied.");
      return;
    }
    const candidates: Candidate[] = candidatesFor(comment);
    if (candidates.length === 0) {
      ui.toast("info", "Could not find editable paragraphs related to this comment. Edit the document by hand for this one.");
      return;
    }
    set({ suggestion: { phase: "confirm", comment, commentId, candidates, chosen: new Set() } });
  },

  startNext: () => {
    const items = useReview.getState().state.items;
    const next = useReview.getState().comments.find((c) => items[c.id]?.status !== "done" && items[c.id]?.status !== "skipped");
    if (!next) useUi.getState().toast("info", "No open review comments. Pick the reviewer file in the Review panel first.");
    else get().start(next.text, next.id);
  },

  send: async () => {
    const s = get().suggestion;
    if (!s) return;
    set({ suggestion: { ...s, phase: "working" } });
    try {
      const result = parseReply(await askAi(get().config, undefined, undefined, s), s.candidates);
      set({ suggestion: { ...s, phase: "result", result, chosen: new Set(result.edits.map((e) => e.position)) } });
    } catch (e) {
      set({ suggestion: { ...s, phase: "error", error: errorMessage(e) } });
    }
  },

  toggle: (position) => {
    const s = get().suggestion;
    if (!s) return;
    const chosen = new Set(s.chosen);
    if (chosen.has(position)) chosen.delete(position);
    else chosen.add(position);
    set({ suggestion: { ...s, chosen } });
  },

  apply: () => {
    const s = get().suggestion;
    if (!s?.result) return;
    const picked = s.result.edits.filter((e) => s.chosen.has(e.position));
    picked.forEach((e) => useDocEdits.getState().set(e.position, e.oldText, e.newText));
    if (picked.length > 0) useReview.getState().updateItem(s.commentId, { status: "progress" });
    useUi.getState().toast("success", `${picked.length} edit${picked.length === 1 ? "" : "s"} added to the document. Review them, then Save.`);
    set({ suggestion: null });
  },

  close: () => set({ suggestion: null }),
}));

void api;
