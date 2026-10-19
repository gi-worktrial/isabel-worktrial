import { useEffect, useRef, useState, type KeyboardEvent } from "react";

// a new query resets keyboard selection to the first option
export function useListbox<Option, ResetOn>(
  options: readonly Option[],
  onPick: (option: Option) => void,
  resetOn: ResetOn,
) {
  const [active, setActive] = useState(0);
  const [shownFor, setShownFor] = useState(resetOn);
  if (shownFor !== resetOn) {
    setShownFor(resetOn);
    setActive(0);
  }
  const index = Math.max(0, Math.min(active, options.length - 1));
  const current = options[index];
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [index, options]);
  const onKeyDown = (event: KeyboardEvent): boolean => {
    if ((event.key === "ArrowDown" || event.key === "ArrowUp") && options.length > 0) {
      event.preventDefault();
      setActive((index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length);
      return true;
    }
    if (event.key !== "Enter" || event.shiftKey || current === undefined) {
      return false;
    }
    event.preventDefault();
    onPick(current);
    return true;
  };
  return { current, list, setActive, onKeyDown };
}
