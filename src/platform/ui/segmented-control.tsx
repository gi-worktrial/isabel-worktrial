import { RadioGroup } from "radix-ui";
import type { ReactNode } from "react";

import { cn } from "#/ui/cn";
import { Tooltip } from "#/ui/tooltip";

type Segment<T extends string> = { value: T; label: ReactNode; tooltip?: ReactNode };

const BOXED_TRACK =
  "slider h-8 gap-1 rounded-control bg-fill p-1 [--slide-fill:var(--color-divider)]";
const BOXED_ITEM =
  "relative inline-flex h-6 items-center justify-center gap-1 rounded-xs px-2 whitespace-nowrap type-label-13 text-muted select-none focus-visible:-outline-offset-2 enabled:aria-[checked=false]:hover:bg-inset enabled:aria-[checked=false]:hover:text-ink enabled:aria-[checked=false]:active:bg-divider enabled:active:scale-[0.97] aria-[checked=true]:text-ink disabled:text-faint motion-safe:transition-[color,background-color,scale]";

export function SegmentedControl<T extends string>({
  label,
  value,
  segments,
  onChange,
  className,
}: {
  label: string;
  value: T | null;
  segments: ReadonlyArray<Segment<T>>;
  onChange(value: T): void;
  className?: string;
}) {
  return (
    <RadioGroup.Root
      aria-label={label}
      value={value === null ? "" : value}
      // SAFETY: Radix only reports the value of a segment it rendered from `segments`.
      onValueChange={(next) => onChange(next as T)}
      className={cn("inline-flex items-center", BOXED_TRACK, className)}
    >
      {segments.map((segment) => {
        const item = (
          <RadioGroup.Item key={segment.value} value={segment.value} className={BOXED_ITEM}>
            {segment.label}
          </RadioGroup.Item>
        );
        return segment.tooltip === undefined ? item : (
          <Tooltip key={segment.value} label={segment.tooltip}>
            {item}
          </Tooltip>
        );
      })}
    </RadioGroup.Root>
  );
}
