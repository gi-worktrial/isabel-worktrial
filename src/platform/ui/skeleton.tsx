import type { ComponentProps } from "react";

import { cn } from "#/ui/cn";

/** A placeholder block for content still loading, after shadcn's Skeleton. */
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("rounded-xs bg-fill motion-safe:animate-pulse", className)}
      {...props}
    />
  );
}
