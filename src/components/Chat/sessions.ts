import type { Turn } from "../../llm/types";

export interface ChatEntry {
  id: string;
  kind: "user" | "assistant" | "activity" | "error";
  text: string;
}

export interface ChatSession {
  entries: ChatEntry[];
  turns: Turn[];
  draft: string;
  historyContext: string | null;
}

// Conversations survive panel closure in this tab, without writing prompts or keys to disk.
const sessions = new Map<string, ChatSession>();

export function readChatSession(scope: string): ChatSession {
  return sessions.get(scope) ?? { entries: [], turns: [], draft: "", historyContext: null };
}

export function saveChatSession(scope: string, session: ChatSession): void {
  sessions.delete(scope);
  sessions.set(scope, session);
  if (sessions.size > 50) sessions.delete(sessions.keys().next().value!);
}

export function stoppedChatSession(session: ChatSession, request: string): ChatSession {
  return {
    ...session,
    turns: [],
    historyContext: null,
    draft: session.draft || request,
    entries: [...session.entries, { id: crypto.randomUUID(), kind: "activity", text: "Stopped" }],
  };
}
