import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type { ComponentPropsWithRef } from "react";

import { cn } from "#/ui/cn";
import { Tooltip } from "#/ui/tooltip";
import { KeyHint } from "#src/ui/kbd";

export const buttonVariants = cva(
  "relative inline-flex shrink-0 items-center justify-center rounded-control whitespace-nowrap focus-visible:-outline-offset-2 not-disabled:active:scale-[0.98] disabled:cursor-default disabled:text-faint motion-safe:transition-[color,background-color,scale]",
  {
    variants: {
      variant: {
        primary: "bg-primary text-on-primary not-disabled:hover:bg-primary/85 disabled:bg-fill",
        secondary: "bg-fill text-ink not-disabled:hover:bg-inset",
        outline: "border border-divider text-ink not-disabled:hover:bg-fill",
        quiet: "text-muted not-disabled:hover:bg-fill not-disabled:hover:text-ink",
        danger: "bg-danger text-surface not-disabled:hover:bg-danger/90 disabled:bg-fill",
      },
      size: {
        small: "h-7 gap-1 px-2 type-meta-12 font-medium",
        default: "h-8 gap-2 px-3 type-label-13 font-medium",
      },
    },
    // A text button that ends an actions row bleeds its padding, so its words end on the column's right edge.
    compoundVariants: [
      { variant: "quiet", size: "small", class: "in-data-[edge=end]:last:-mr-2" },
      { variant: "quiet", size: "default", class: "in-data-[edge=end]:last:-mr-3" },
    ],
    defaultVariants: { variant: "secondary", size: "default" },
  },
);

type ButtonProps = ComponentPropsWithRef<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean };

export function Button({ variant, size, asChild = false, className, ...rest }: ButtonProps) {
  const Root = asChild ? Slot.Root : "button";
  return (
    <Root
      {...(asChild ? {} : { type: "button" })}
      className={cn(buttonVariants({ variant, size }), className)}
      {...rest}
    />
  );
}

const ICON_SIZES = { default: "size-8 px-0", small: "size-7 px-0" } as const;

/** A square icon button, named by its tooltip. */
export function IconButton({
  label,
  shortcut,
  variant = "quiet",
  size = "default",
  className,
  ...rest
}: ComponentPropsWithRef<"button"> & {
  label: string;
  shortcut?: string;
  variant?: "quiet" | "secondary";
  size?: keyof typeof ICON_SIZES;
}) {
  return (
    <Tooltip label={shortcut === undefined ? label : <KeyHint label={label} keys={shortcut} />}>
      <button
        type="button"
        aria-label={label}
        className={cn(
          buttonVariants({ variant, size: null }),
          ICON_SIZES[size],
          className,
        )}
        {...rest}
      />
    </Tooltip>
  );
}
