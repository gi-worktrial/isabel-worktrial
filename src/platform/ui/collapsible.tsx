import { ChevronRight } from "lucide-react";
import { Collapsible as Radix } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "#/ui/cn";
import { FoldMark } from "#src/ui/fold";

export const Collapsible = Radix.Root;
export const CollapsibleContent = Radix.Content;

export function CollapsibleTrigger({
  className,
  mark,
  children,
  ...props
}: ComponentProps<typeof Radix.Trigger> & { mark?: ReactNode }) {
  return (
    <Radix.Trigger
      className={cn(
        "group/expand -mx-2 flex h-7 min-w-0 items-center gap-2 rounded-xs px-2 text-left hover:bg-fill",
        className,
      )}
      {...props}
    >
      {mark === undefined ? (
        <ChevronRight className="size-3.5 shrink-0 text-muted group-aria-expanded/expand:rotate-90 motion-safe:transition-transform" />
      ) : (
        <FoldMark mark={mark} />
      )}
      {children}
    </Radix.Trigger>
  );
}
