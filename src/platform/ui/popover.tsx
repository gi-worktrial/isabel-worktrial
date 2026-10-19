import { Popover as PopoverPrimitive } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "#/ui/cn";

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;

export function PopoverContent({
  className,
  sideOffset = 4,
  ...props
}: ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        sideOffset={sideOffset}
        className={cn("menu-panel rounded-md", className)}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}
