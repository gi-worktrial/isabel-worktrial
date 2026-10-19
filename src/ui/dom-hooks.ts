import { useEffectEvent, useLayoutEffect, useRef, type RefObject } from "react";

export function useResize<Element extends HTMLElement>(
  ref: RefObject<Element | null>,
  onResize: (element: Element) => void,
): void {
  const resized = useEffectEvent(onResize);
  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) {
      return;
    }
    resized(element);
    const observer = new ResizeObserver(() => resized(element));
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
}

// a controlled overlay with no Trigger hands focus back to `opener`, else to what had focus as it opened
export function useReturnFocus(open: boolean, opener?: RefObject<HTMLElement | null>) {
  const from = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const active = document.activeElement;
    if (open) {
      from.current =
        opener?.current ??
        (active instanceof HTMLElement && active !== document.body ? active : null);
    }
  }, [open, opener]);
  // for the content's onCloseAutoFocus, so a control that took the focus on the way out keeps it
  return (event: Event) => {
    const back = from.current;
    const active = document.activeElement;
    if (back?.isConnected === true && (active === null || active === document.body)) {
      event.preventDefault();
      back.focus();
    }
  };
}
