import { Check } from "lucide-react";
import { Select as Radix } from "radix-ui";
import { Fragment } from "react";

import { cn } from "#/ui/cn";
import { CheckSlot } from "#/ui/menu";

// a borderless grey field with a small solid caret, on the 32px row with buttons and the search field
const TRIGGER_CLASS =
  "inline-flex h-8 items-center gap-2 rounded-xs bg-fill pr-2 pl-3 type-label-13 text-ink enabled:hover:bg-inset disabled:text-faint focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring";
const CHEVRON = (
  <svg aria-hidden="true" viewBox="0 0 8 5" className="h-1.25 w-2 shrink-0 fill-muted">
    <path d="M0 0h8L4 5z" />
  </svg>
);
const SCROLL_CLASS = "flex h-5 shrink-0 cursor-default items-center justify-center";

export function Select<T extends string>({
  options,
  value,
  onChange,
  "aria-label": label,
  disabled = false,
  className,
}: {
  "options": ReadonlyArray<{ value: T; label: string; separatorBefore?: boolean }>;
  "value": T;
  "onChange"(value: T): void;
  "aria-label": string;
  "disabled"?: boolean;
  "className"?: string;
}) {
  return (
    // Radix only reports the value of an item it rendered from options
    <Radix.Root value={value} onValueChange={(next) => onChange(next as T)} disabled={disabled}>
      <Radix.Trigger aria-label={label} className={cn(TRIGGER_CLASS, className)}>
        <Radix.Value placeholder={label}>
          {options.find((option) => option.value === value)?.label}
        </Radix.Value>
        <Radix.Icon asChild>{CHEVRON}</Radix.Icon>
      </Radix.Trigger>
      <Radix.Portal>
        {/* twelve rows fit whole, and a shorter window scrolls with a caret at the cut edge */}
        <Radix.Content
          position="popper"
          sideOffset={4}
          className="menu-panel max-h-[min(22rem,var(--radix-select-content-available-height))] min-w-(--radix-select-trigger-width)"
        >
          <Radix.ScrollUpButton className={SCROLL_CLASS}>
            <span className="rotate-180">{CHEVRON}</span>
          </Radix.ScrollUpButton>
          <Radix.Viewport>
            {options.map((option) => (
              <Fragment key={option.value}>
                {/* a hairline that parts one group of options from the next */}
                {option.separatorBefore === true && (
                  <Radix.Separator className="my-1 h-px bg-divider" />
                )}
                <Radix.Item value={option.value} className="menu-item">
                  {/* radix ItemText drops className */}
                  <span className="min-w-0 flex-1 truncate">
                    <Radix.ItemText>{option.label}</Radix.ItemText>
                  </span>
                  <CheckSlot>
                    <Radix.ItemIndicator>
                      <Check aria-hidden="true" className="size-4" />
                    </Radix.ItemIndicator>
                  </CheckSlot>
                </Radix.Item>
              </Fragment>
            ))}
          </Radix.Viewport>
          <Radix.ScrollDownButton className={SCROLL_CLASS}>{CHEVRON}</Radix.ScrollDownButton>
        </Radix.Content>
      </Radix.Portal>
    </Radix.Root>
  );
}
