import type { ComponentProps } from "react";

import { cn } from "#/ui/cn";

/** What the person sent, after shadcn's Bubble. */
export function Bubble({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="bubble"
      className={cn(
        "w-fit max-w-[85%] min-w-0 rounded-2xl bg-fill px-4 py-2 type-copy-14 whitespace-pre-wrap wrap-break-word text-ink",
        className,
      )}
      {...props}
    />
  );
}
