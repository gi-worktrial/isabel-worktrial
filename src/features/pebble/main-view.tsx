import { OutPortal } from "react-reverse-portal";

import { usePebbleDock } from "#/pebble/page";

/**
 * A new chat in the main view, the shell's one chat moved here from the side panel with its prompt and draft, whose
 * first question starts it; platform's `chat/$thread` shows a chat that has one.
 */
export function MainView() {
  const { chat } = usePebbleDock();

  return (
    <section
      aria-label="Pebble"
      className="flex h-full flex-col bg-surface [--chat-width:var(--container-reading)] [view-transition-name:pebble-chat]"
    >
      <OutPortal node={chat} />
    </section>
  );
}
