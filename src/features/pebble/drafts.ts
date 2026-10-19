import { useCallback, useSyncExternalStore } from "react";

import { listeners } from "#src/ui/listeners";

// the side panel and the main view type into one prompt per thread, so a draft moves with the chat
const NO_THREAD = "";
const drafts = new Map<string, string>();
const drafted = listeners<[thread: string]>();

/** Sets a thread's unsent prompt, or updates it from what it holds now, as React's state setter does. */
export function setDraft(thread: string | undefined, next: string | ((current: string) => string)) {
  const key = thread ?? NO_THREAD;
  drafts.set(key, typeof next === "string" ? next : next(drafts.get(key) ?? ""));
  drafted.emit(key);
}

/** The unsent prompt of a thread, shared by every view of it. */
export function useDraft(thread: string | undefined): string {
  const key = thread ?? NO_THREAD;
  const subscribe = useCallback(
    (notify: () => void) => drafted.subscribe((id) => id === key && notify()),
    [key],
  );
  return useSyncExternalStore(subscribe, () => drafts.get(key) ?? "");
}
