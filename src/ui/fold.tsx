import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "#/ui/cn";

/** A fold's open and close motion, a short height and fade, for `CollapsibleContent`'s class; still with reduced motion. */
export const FOLD =
  "overflow-hidden motion-safe:data-[state=closed]:animate-collapse motion-safe:data-[state=open]:animate-expand";

const BULLETS = { step: "bg-ring", error: "bg-danger" } as const;

/** A transcript's bullet, a trigger's `mark`: grey for a step, red for one that errored. */
export function StepBullet({ tone }: { tone: keyof typeof BULLETS }) {
  return (
    <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", BULLETS[tone])} />
  );
}

/** A fold row's `mark` in the chevron's place, until the row is hovered or open. */
export function FoldMark({ mark }: { mark: ReactNode }) {
  return (
    <span className="flex size-3.5 shrink-0 items-center justify-center">
      <span className="flex group-hover/expand:hidden group-aria-expanded/expand:hidden">
        {mark}
      </span>
      <ChevronRight
        aria-hidden="true"
        className="hidden size-3.5 text-muted group-hover/expand:block group-aria-expanded/expand:block group-aria-expanded/expand:rotate-90 motion-safe:transition-transform"
      />
    </span>
  );
}
