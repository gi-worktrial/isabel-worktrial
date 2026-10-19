import { contentText, type AssistantMessage, type Message } from "@earendil-works/pi-ai";
import type {
  AgentState,
  ConversationView,
  EntryRecord,
  LiveState,
} from "@earendil-works/pi-durable";
import type { Thread } from "@grounded-intelligence/grounded-sdk";

export interface ChatView {
  model: AgentState["model"];
  thinkingLevel: AgentState["thinkingLevel"];
  entries: readonly ConversationView["entries"][number][];
  partial: AssistantMessage | undefined;
  busy: boolean;
  compactions: NonNullable<LiveState["compactions"]>;
  error: string | undefined;
}

export function chatView(view: ConversationView | undefined): ChatView {
  // SAFETY: Pi stores its agent and live documents under these kinds.
  const agent = view?.docs["pi.agent"] as AgentState | undefined;
  // SAFETY: Pi stores its agent and live documents under these kinds.
  const live = view?.docs["pi.live"] as LiveState | undefined;
  return {
    model: agent?.model,
    thinkingLevel: agent?.thinkingLevel,
    entries: view?.entries ?? [],
    partial: live?.generation?.message,
    busy: !!live?.run,
    compactions: live?.compactions ?? [],
    error: live?.generation?.retry?.error,
  };
}

export function threadTitle(thread: Pick<Thread, "title">): string {
  return thread.title ?? "New chat";
}

/** Whether a thread has a title or has had a prompt or rename, each of which moves `updated_at` past `created_at`. */
export function threadUsed(thread: Pick<Thread, "title" | "created_at" | "updated_at">): boolean {
  return thread.title !== null || thread.updated_at !== thread.created_at;
}

export function messageText(message: Message): string {
  return contentText(message.content);
}

/** Tells Pebble what screen the engineer is on. `ask` writes one before a question when the screen has changed, and `Conversation` leaves it out of the chat. */
export const CONTEXT_ENTRY = "grounded.context";

/** Whether the session's latest context entry differs from `context`, so the screen is only sent again when it changed. */
export function contextChanged({ entries }: ChatView, context: string) {
  return [...entries].reverse().find(({ kind }) => kind === CONTEXT_ENTRY)?.data !== context;
}

export function mergeEntries(older: readonly EntryRecord[], newer: readonly EntryRecord[]) {
  const entries = new Map(older.map((entry) => [entry.id, entry]));
  for (const entry of newer) {
    entries.set(entry.id, entry);
  }

  return [...entries.values()].sort((left, right) => left.id - right.id);
}
