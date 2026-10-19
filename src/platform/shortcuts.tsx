import { Kbd } from "#/ui/kbd";
import { Modal } from "#/ui/dialog";

/** A chord with the platform's command key, like ⌘K on a Mac and Ctrl+K elsewhere. */
export function chord(key: string) {
  return navigator.userAgent.includes("Mac") ? `⌘${key}` : `Ctrl+${key}`;
}

/** Whether a key went to a field, where it edits text rather than running a shortcut. */
export function isTyping({ target }: KeyboardEvent) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.matches("input, textarea, select"))
  );
}

/** Whether a key was pressed alone, without a modifier that makes it a browser or system chord. */
export function isPlainKey(event: KeyboardEvent) {
  return !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey;
}

export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
}) {
  const shortcuts = [
    { action: "Go to a page, Issue or Agent", keys: [chord("K")] },
    { action: "Ask Pebble", keys: [chord("J")] },
    { action: "Show keyboard shortcuts", keys: [chord("/")] },
    { action: "Go back one level", keys: ["Esc"] },
    { action: "Move through Traces", keys: ["↑", "↓"] },
    { action: "Open a Trace", keys: ["↵"] },
    { action: "Previous or next Trace", keys: ["←", "→"] },
    { action: "Save Debug's edits", keys: [chord("S")] },
  ];

  return (
    <Modal title="Keyboard shortcuts" open={open} onOpenChange={onOpenChange}>
      <ul className="flex flex-col">
        {shortcuts.map(({ action, keys }) => (
          <li key={action} className="flex h-8 items-center gap-3 type-label-13 text-ink">
            <span className="min-w-0 flex-1 truncate">{action}</span>
            <span className="flex gap-1">
              {keys.map((key) => (
                <Kbd key={key}>{key}</Kbd>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
