import type { ComponentProps, ReactNode } from "react";

import { cn } from "#/ui/cn";
import { Tag } from "#/ui/tag";

/** A count beside a heading, muted unless a `tone` colors it. */
export function Count({
  tone,
  className,
  children,
}: {
  tone?: ComponentProps<typeof Tag>["tone"];
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tag
      tone={tone}
      className={cn("min-w-5 justify-center", tone === undefined && "text-muted", className)}
    >
      {children}
    </Tag>
  );
}
