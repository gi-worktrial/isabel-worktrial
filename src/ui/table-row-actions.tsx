import { Slot } from "radix-ui";
import type { ComponentPropsWithRef, ReactNode } from "react";

import { IconButton } from "#/ui/button";
import { cn } from "#/ui/cn";

// stretches over the row, so the whole row is one target
export function RowAction({
  asChild = false,
  className,
  ...rest
}: ComponentPropsWithRef<"button"> & { asChild?: boolean }) {
  const Root = asChild ? Slot.Root : "button";
  return (
    <Root
      {...(asChild ? {} : { type: "button" })}
      className={cn("row-action flex w-full min-w-0 items-center gap-2 text-left", className)}
      {...rest}
    />
  );
}

type RowActionItem = { label: string; icon: ReactNode; disabled?: boolean; onClick(): void };

// a row's actions, each its own icon button with its label as the tooltip (no "..." menu)
export function RowActions({ row, actions }: { row: string; actions: readonly RowActionItem[] }) {
  return (
    <span role="group" aria-label={`${row} actions`} className="inline-flex items-center gap-1">
      {actions.map(({ label, icon, disabled, onClick }) => (
        <IconButton
          key={label}
          label={label}
          size="small"
          disabled={disabled === true}
          onClick={onClick}
        >
          {icon}
        </IconButton>
      ))}
    </span>
  );
}
