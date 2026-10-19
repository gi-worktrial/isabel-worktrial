import type { ComponentProps } from "react";

import { cn } from "#/ui/cn";

/** One turn of a conversation, after shadcn's Message. */
export function Message({
  className,
  align = "start",
  ...props
}: ComponentProps<"div"> & { align?: "start" | "end" }) {
  return (
    <div
      data-slot="message"
      data-align={align}
      className={cn(
        "group/message flex w-full min-w-0 gap-2 data-[align=end]:flex-row-reverse",
        className,
      )}
      {...props}
    />
  );
}

export function MessageContent({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="message-content"
      className={cn(
        "flex w-full min-w-0 flex-col gap-3 wrap-break-word group-data-[align=end]/message:items-end",
        className,
      )}
      {...props}
    />
  );
}

export function MessageFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="message-footer"
      className={cn("-mt-1 -ml-1 flex h-7 items-center gap-1", className)}
      {...props}
    />
  );
}
