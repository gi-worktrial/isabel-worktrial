import { createContext, use, useEffect } from "react";
import type { HtmlPortalNode } from "react-reverse-portal";

import type { IssueParams } from "#/queries";

/** What a page tells Pebble: its screen, written ahead of the next question when it changed, and suggested prompts. */
export type PebblePage = { context: string; prompts: readonly string[] };

export const DEFAULT_PROMPTS = [
  "Review open Issues",
  "Analyze recent Traces",
  "Summarize Eval runs",
];

type PebbleDock = {
  setPage(page: PebblePage | undefined): void;
  /** Opens Pebble with `text` at the start of the prompt. */
  prefill(text: string): void;
  /** Opens this Issue's activity in the shared side panel. */
  openActivity(params: IssueParams): void;
  /** The active chat, for a fullscreen page to show with `OutPortal`. */
  chat: HtmlPortalNode;
  /** The active chat's side pane, for the fullscreen chat to show beside it with `OutPortal`. */
  pane: HtmlPortalNode;
};

export const PebbleDockContext = createContext<PebbleDock | undefined>(undefined);

export function usePebbleDock() {
  const dock = use(PebbleDockContext);
  if (dock === undefined) {
    throw new Error("Pebble's dock renders in the org shell");
  }

  return dock;
}

/** Describes the current page to the shell's Pebble while it's mounted. */
export function usePebblePage(context: string, prompts: readonly string[]) {
  const { setPage } = usePebbleDock();
  useEffect(() => {
    setPage({ context, prompts });
    return () => setPage(undefined);
  }, [setPage, context, prompts]);
}
