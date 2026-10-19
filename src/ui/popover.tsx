import { Popover as Radix } from "radix-ui";
import type { ComponentProps, ReactNode, RefObject } from "react";

import { cn } from "#/ui/cn";
import { useReturnFocus } from "#src/ui/dom-hooks";

// anchored rather than triggered, so closing hands focus back to `opener`, else to what opened it
export function Popover({
  anchor,
  opener,
  open,
  onOpenChange,
  className,
  children,
  ...content
}: ComponentProps<typeof Radix.Content> & {
  anchor: ReactNode;
  opener?: RefObject<HTMLElement | null>;
  open: boolean;
  onOpenChange(open: boolean): void;
}) {
  const returnFocus = useReturnFocus(open, opener);
  return (
    <Radix.Root open={open} onOpenChange={onOpenChange}>
      <Radix.Anchor asChild>{anchor}</Radix.Anchor>
      <Radix.Portal>
        <Radix.Content
          className={cn("float-layer z-30 rounded-sm text-ink outline-none", className)}
          onCloseAutoFocus={returnFocus}
          {...content}
        >
          {children}
        </Radix.Content>
      </Radix.Portal>
    </Radix.Root>
  );
}
