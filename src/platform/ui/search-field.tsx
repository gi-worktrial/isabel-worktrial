import { Search, X } from "lucide-react";
import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useRef, useState } from "react";

import { cn } from "#/ui/cn";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "#/ui/input-group";

const DEBOUNCE_MS = 250;

// The field draws the focus ring around itself, so its input stays plain.
export function SearchField({
  label,
  placeholder,
  value,
  onChange,
  onKeyDown,
  onEscape,
  autoFocus,
  controls,
  debounce = DEBOUNCE_MS,
  className,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange(value: string): void;
  onKeyDown?: ((event: ReactKeyboardEvent<HTMLInputElement>) => void) | undefined;
  onEscape?: (() => void) | undefined;
  autoFocus?: boolean | undefined;
  controls?: string | undefined;
  debounce?: number;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const pending = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Typing edits a draft, so keys pressed before the last change lands aren't lost.
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    if (pending.current === undefined) {
      setDraft(value);
    }
  }, [value]);
  useEffect(() => () => clearTimeout(pending.current), []);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        !event.isComposing &&
        event.target === input.current &&
        input.current?.value !== ""
      ) {
        event.preventDefault();
      }
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, []);
  const change = (next: string, delay: number) => {
    setDraft(next);
    clearTimeout(pending.current);
    pending.current = setTimeout(() => {
      pending.current = undefined;
      onChange(next);
    }, delay);
  };

  return (
    <InputGroup
      role="search"
      className={cn(
        "h-8 w-auto gap-2 rounded-control border-0 bg-fill px-2 has-[input:focus-visible]:outline-2 has-[input:focus-visible]:-outline-offset-2 has-[input:focus-visible]:outline-ring has-[[data-slot=input-group-control]:focus-visible]:ring-0",
        className,
      )}
    >
      <InputGroupInput
        ref={input}
        aria-label={label}
        placeholder={placeholder}
        value={draft}
        autoFocus={autoFocus}
        onChange={(event) => change(event.target.value, debounce)}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (event.key !== "Escape" || event.nativeEvent.isComposing) {
            return;
          }

          if (draft === "") {
            event.currentTarget.blur();
            onEscape?.();
          } else {
            change("", 0);
          }
        }}
        {...(controls === undefined
          ? {}
          : { role: "combobox", "aria-controls": controls, "aria-expanded": true })}
        className="p-0"
      />
      <InputGroupAddon className="p-0">
        <Search className="size-3.5" />
      </InputGroupAddon>
      {draft !== "" && (
        <InputGroupAddon align="inline-end" className="p-0">
          <InputGroupButton
            aria-label="Clear search"
            onClick={() => {
              change("", 0);
              input.current?.focus();
            }}
            className="size-5 rounded-xs p-0 not-disabled:hover:bg-divider"
          >
            <X className="size-3.5" />
          </InputGroupButton>
        </InputGroupAddon>
      )}
    </InputGroup>
  );
}
