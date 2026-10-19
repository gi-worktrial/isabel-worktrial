import { type ReactNode, createContext, useContext, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";

const TabActionsSlot = createContext<HTMLElement | null>(null);
const SetTabActionsSlot = createContext<(slot: HTMLElement | null) => void>(() => undefined);

/** A page whose tab row's `TabActionsEnd` holds the open tab's `TabActions`. */
export function TabActionsScope({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  return (
    <SetTabActionsSlot value={setSlot}>
      <TabActionsSlot value={slot}>{children}</TabActionsSlot>
    </SetTabActionsSlot>
  );
}

/** The right end of a page's tab row, where the open tab puts its own actions. Platform's outline buttons there (Sync,
 * Rerun Evals) read as grey ones, since their border would run beside the tab row's rule (no lines within lines). */
export function TabActionsEnd() {
  return (
    <div
      ref={useContext(SetTabActionsSlot)}
      data-edge="end"
      className="ml-auto flex shrink-0 items-center gap-2 [&_.border]:border-transparent [&_.border]:bg-fill [&_.border:not(:disabled):hover]:bg-inset"
    />
  );
}

/** The open tab's actions, at the right end of its tab row once the row has mounted. */
export function TabActions({ children }: { children: ReactNode }) {
  const slot = useContext(TabActionsSlot);
  // the actions render into a box of their own that sits in the slot only while the tab's layout effects run, since a
  // portal escapes the display none that hides a tab while the next one shows its skeleton, and React tears those
  // effects down
  const [box] = useState(() => {
    const element = document.createElement("div");
    element.style.display = "contents";
    return element;
  });
  useLayoutEffect(() => {
    slot?.append(box);
    return () => box.remove();
  }, [slot, box]);

  return slot === null ? null : createPortal(children, box);
}
