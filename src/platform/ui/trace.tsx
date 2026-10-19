import { ChevronRight } from "lucide-react";
import { Collapsible as Radix } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "#/ui/cn";

/** The steps an agent took, one line each, after shadcn's Trace. */
export function Trace({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="trace"
      className={cn("flex w-full min-w-0 flex-col gap-2", className)}
      {...props}
    />
  );
}

export function TraceLine({
  className,
  status,
  ...props
}: ComponentProps<"span"> & { status?: "running" | undefined }) {
  return (
    <span
      data-slot="trace-line"
      data-status={status}
      className={cn(
        "flex w-fit max-w-full min-w-0 items-center gap-2 type-label-13 text-muted in-[button:hover]:text-ink data-[status=running]:*:data-[slot=trace-title]:shimmer",
        className,
      )}
      {...props}
    />
  );
}

export function TraceIcon({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      aria-hidden
      className={cn("flex size-4 shrink-0 items-center justify-center [&_svg]:size-3.5", className)}
      {...props}
    />
  );
}

export function TraceTitle({ className, ...props }: ComponentProps<"span">) {
  return <span data-slot="trace-title" className={cn("min-w-0 truncate", className)} {...props} />;
}

export function TraceDescription({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      data-slot="trace-description"
      className={cn("shrink-0 text-muted/70 tabular-nums", className)}
      {...props}
    />
  );
}

export function TraceCollapsible({ className, ...props }: ComponentProps<typeof Radix.Root>) {
  return <Radix.Root className={cn("flex w-full min-w-0 flex-col", className)} {...props} />;
}

export function TraceCollapsibleTrigger({
  className,
  children,
  ...props
}: ComponentProps<typeof Radix.Trigger>) {
  return (
    <Radix.Trigger
      className={cn(
        "group/trace flex w-fit max-w-full min-w-0 items-center gap-1 rounded-xs text-left text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      {...props}
    >
      {children}
      <TraceIcon className="group-aria-expanded/trace:rotate-90 motion-safe:transition-transform">
        <ChevronRight />
      </TraceIcon>
    </Radix.Trigger>
  );
}

export function TraceCollapsibleContent({
  className,
  ...props
}: ComponentProps<typeof Radix.Content>) {
  return (
    <Radix.Content
      className={cn(
        "mt-2 mb-1 ml-[7px] flex min-w-0 flex-col gap-2 border-l border-divider pl-4 type-label-13 wrap-break-word text-muted",
        className,
      )}
      {...props}
    />
  );
}
