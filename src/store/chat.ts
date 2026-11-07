// The "Ask AI" chat: messages, what the AI is shown, and applying its proposals to the document.
//
// Nothing here is saved to disk: the conversation lives only while the app is open (Inkdelta keeps
// no prompts or replies). Each message is one separate call to the AI tool, so earlier turns are
// repeated inside the prompt (see buildChatPrompt).

import { create } from "zustand";
import { api, errorMessage } from "../api/commands";
import { buildChatPrompt, contextFor, documentParagraphs, parseChatReply, type ChatTurn, type Proposed, type Scope } from "../features/ai/chat";
import { useAi } from "./ai";
import { useDocEdits } from "./docEdits";
import { useUi } from "./ui";
import { useWorkspace } from "./workspace";

export interface ChatMessage {
  id: number;
  role: "user" | "assistant" | "error";
  text: string;
  /** For a question: what the AI was shown with it. */
  context?: string;
  proposals?: Proposed[];
  ignored?: number;
  /** Keys of the proposals ticked for applying. */
  chosen?: Set<string>;
  applied?: boolean;
}

interface ChatState {
  messages: ChatMessage[];
  busy: boolean;
  scope: Scope;
  draft: string;
  /** Add the instructions that let the AI propose document changes (costs tokens, so off by default). */
  allowEdits: boolean;
  /** Paragraph positions last selected in the reading view. */
  selected: number[];

  setScope: (scope: Scope) => void;
  setDraft: (draft: string) => void;
  setAllowEdits: (on: boolean) => void;
  setSelected: (positions: number[]) => void;
  /** The exact prompt that Send would deliver right now. */
  preview: () => { system: string; user: string };
  send: () => Promise<void>;
  toggle: (messageId: number, key: string) => void;
  apply: (messageId: number) => void;
  clear: () => void;
}

let nextId = 1;

const EDITS_KEY = "inkdelta.askEdits";
function readAllowEdits(): boolean {
  try { return localStorage.getItem(EDITS_KEY) === "1"; } catch { return false; }
}

const turnsOf = (messages: ChatMessage[]): ChatTurn[] =>
  messages.filter((m): m is ChatMessage & { role: "user" | "assistant" } => m.role !== "error").map((m) => ({ role: m.role, text: m.text }));

const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  busy: false,
  scope: { kind: "selection" },
  draft: "",
  allowEdits: readAllowEdits(),
  selected: [],

  setScope: (scope) => set({ scope }),
  setDraft: (draft) => set({ draft }),
  setAllowEdits: (allowEdits) => {
    try { localStorage.setItem(EDITS_KEY, allowEdits ? "1" : "0"); } catch { /* ignore */ }
    set({ allowEdits });
  },
  setSelected: (selected) => set({ selected }),

  preview: () => {
    const { messages, scope, selected, draft, allowEdits } = get();
    return buildChatPrompt(turnsOf(messages), contextFor(scope, selected), draft || "(your question goes here)", allowEdits);
  },

  send: async () => {
    const { draft, scope, selected, messages, busy, allowEdits } = get();
    const ui = useUi.getState();
    const ai = useAi.getState();
    if (busy || draft.trim() === "") return;
    if (!ai.isConfigured()) {
      ui.toast("info", "Choose an AI service first.");
      ai.openSettings(true);
      return;
    }
    const context = contextFor(scope, selected);
    if (scope.kind !== "none" && context.paragraphs.length === 0) {
      ui.toast("info", scope.kind === "selection" ? "Select some text in the document first, or choose another scope." : "Nothing from the document to send for this choice.");
      return;
    }
    const { system, user } = buildChatPrompt(turnsOf(messages), context, draft, allowEdits);
    const question: ChatMessage = { id: nextId++, role: "user", text: draft.trim(), context: context.label };
    set({ messages: [...messages, question], draft: "", busy: true });

    const c = ai.config;
    try {
      const reply = parseChatReply(await api.aiComplete({ kind: c.kind, model: c.model, baseUrl: c.baseUrl, apiKey: c.apiKey, command: c.command, effort: c.effort }, system, user), context);
      const answer: ChatMessage = {
        id: nextId++,
        role: "assistant",
        text: reply.text,
        proposals: reply.proposals,
        ignored: reply.ignored,
        chosen: new Set(reply.proposals.map((p) => p.key)),
      };
      set({ messages: [...get().messages, answer], busy: false });
    } catch (e) {
      set({ messages: [...get().messages, { id: nextId++, role: "error", text: errorMessage(e) }], busy: false });
    }
  },

  toggle: (messageId, key) =>
    set({
      messages: get().messages.map((m) => {
        if (m.id !== messageId || !m.chosen) return m;
        const chosen = new Set(m.chosen);
        if (chosen.has(key)) chosen.delete(key);
        else chosen.add(key);
        return { ...m, chosen };
      }),
    }),

  apply: (messageId) => {
    const message = get().messages.find((m) => m.id === messageId);
    const ui = useUi.getState();
    if (!message?.proposals || !message.chosen) return;
    const ws = useWorkspace.getState();
    if (ws.loose || ws.newKey !== "workdir") {
      ui.toast("info", "Open the working copy of the document (Documents, then Working copy) so changes can be applied.");
      return;
    }
    // The document may have been saved or changed since the answer: skip anything that no longer matches.
    const now = new Map(documentParagraphs().map((p) => [p.position, p.text]));
    const edits = useDocEdits.getState();
    let applied = 0;
    let stale = 0;
    for (const p of message.proposals.filter((x) => message.chosen!.has(x.key))) {
      if (p.kind === "edit" && now.get(p.position) === p.oldText) { edits.set(p.position, p.oldText, p.newText); applied++; }
      else if (p.kind === "insert" && now.get(p.after) === p.afterText) { edits.addInsert(p.after, p.text, p.like); applied++; }
      else if (p.kind === "delete" && now.get(p.position) === p.oldText) { edits.markDelete(p.position, p.oldText); applied++; }
      else stale++;
    }
    if (applied > 0) ui.toast("success", `${applied} change${applied === 1 ? "" : "s"} added to the document. Review them there, then Save.`);
    if (stale > 0) ui.toast("info", `${stale} change${stale === 1 ? "" : "s"} skipped: that part of the document has changed since the answer. Ask again.`);
    set({ messages: get().messages.map((m) => (m.id === messageId ? { ...m, applied: applied > 0 } : m)) });
  },

  clear: () => set({ messages: [] }),
}));

export const useChat = useChatStore;

// Remember what the user last selected in the document, even while this chat is closed: clicking
// into the chat box would otherwise lose the selection. Each paragraph in the reading view carries
// data-pos (its position in the file), which is how a selection becomes a list of paragraphs.
if (typeof document !== "undefined") {
  document.addEventListener("selectionchange", () => {
    const selection = document.getSelection();
    const root = document.querySelector(".redline");
    if (!selection || selection.isCollapsed || selection.rangeCount === 0 || !root) return;
    const range = selection.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) return;
    const positions = [...root.querySelectorAll<HTMLElement>("[data-pos]")].filter((el) => range.intersectsNode(el)).map((el) => Number(el.dataset.pos));
    if (positions.length > 0) useChatStore.getState().setSelected(positions);
  });
}
