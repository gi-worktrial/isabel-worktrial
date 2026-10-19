import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentPropsWithRef } from "react";

import { Button } from "#/ui/button";
import { cn } from "#/ui/cn";

export function InputGroup({ className, ...props }: ComponentPropsWithRef<"div">) {
  return (
    <div
      role="group"
      data-slot="input-group"
      className={cn(
        "group/input-group relative flex w-full min-w-0 items-center rounded-md border border-divider bg-surface transition-[border-color,box-shadow] has-[>[data-align=block-end]]:flex-col has-[[data-slot=input-group-control]:focus-visible]:border-ring has-[[data-slot=input-group-control]:focus-visible]:ring-2 has-[[data-slot=input-group-control]:focus-visible]:ring-ring/20",
        className,
      )}
      {...props}
    />
  );
}

const inputGroupAddonVariants = cva("flex shrink-0 items-center gap-2 text-muted", {
  variants: {
    align: {
      "inline-start": "order-first pl-3",
      "inline-end": "order-last pr-3",
      "block-end": "order-last w-full px-3 pb-3",
    },
  },
});

type InputGroupAddonProps = ComponentPropsWithRef<"div"> &
  VariantProps<typeof inputGroupAddonVariants>;

export function InputGroupAddon({
  className,
  align = "inline-start",
  ...props
}: InputGroupAddonProps) {
  return (
    <div
      role="group"
      data-slot="input-group-addon"
      data-align={align}
      className={cn(inputGroupAddonVariants({ align }), className)}
      {...props}
    />
  );
}

export function InputGroupButton({ className, ...props }: ComponentPropsWithRef<typeof Button>) {
  return (
    <Button variant="quiet" size="small" className={cn("rounded-full", className)} {...props} />
  );
}

export function InputGroupInput({ className, ...props }: ComponentPropsWithRef<"input">) {
  return (
    <input
      data-slot="input-group-control"
      className={cn(
        "min-w-0 flex-1 rounded-none border-0 bg-transparent h-8 px-3 type-label-13 text-ink shadow-none outline-none placeholder:text-faint disabled:text-faint",
        className,
      )}
      {...props}
    />
  );
}

export function InputGroupTextarea({ className, ...props }: ComponentPropsWithRef<"textarea">) {
  return (
    <textarea
      data-slot="input-group-control"
      className={cn(
        "field-sizing-content block max-h-48 min-h-12 w-full min-w-0 resize-none rounded-none border-0 bg-transparent px-3 py-3 type-copy-14 text-ink shadow-none outline-none placeholder:text-muted focus-visible:outline-none disabled:text-faint",
        className,
      )}
      {...props}
    />
  );
}
