// the arrows step a Walkthrough, and the keys show in its buttons' hints
export const SHORTCUTS = { previous: "\u2190", next: "\u2192" } as const;
export type Shortcut = (typeof SHORTCUTS)[keyof typeof SHORTCUTS];

const KEYS: Record<Shortcut, string> = {
  [SHORTCUTS.previous]: "ArrowLeft",
  [SHORTCUTS.next]: "ArrowRight",
};

export function shortcutKeys(shortcut: Shortcut): string {
  return KEYS[shortcut];
}
