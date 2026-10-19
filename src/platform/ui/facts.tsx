import type { ReactNode } from "react";

import { cn } from "#/ui/cn";

export function Facts({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <dl
      role="group"
      aria-label={label}
      className={cn("flex min-w-0 flex-wrap items-center gap-x-6 gap-y-2", className)}
    >
      {children}
    </dl>
  );
}

export function Fact({
  label,
  children,
  orientation = "horizontal",
}: {
  label: string;
  children: ReactNode;
  orientation?: "horizontal" | "vertical";
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "flex min-w-0",
        orientation === "vertical" ? "flex-col items-start gap-1" : "h-6 items-center gap-2",
      )}
    >
      <dt className="type-meta-12 whitespace-nowrap text-muted">{label}</dt>
      <dd className="flex min-w-0 items-center gap-2 type-label-13 whitespace-nowrap text-ink tabular-nums">
        {children}
      </dd>
    </div>
  );
}
