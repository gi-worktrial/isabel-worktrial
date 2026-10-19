import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentPropsWithRef } from "react";

import { cn } from "#/ui/cn";

const tagVariants = cva(
  "enter-fade inline-flex h-5 max-w-full min-w-0 shrink-0 items-center gap-1 rounded-xs px-2 type-meta-12 font-medium whitespace-nowrap tabular-nums [&_svg]:size-3 [&_svg]:shrink-0",
  {
    variants: {
      tone: {
        neutral: "bg-inset text-ink dark:text-ink/80",
        accent: "bg-accent-tint text-accent-ink",
        success: "bg-success-tint text-success-ink",
        warning: "bg-warning-tint text-warning-ink",
        danger: "bg-danger-tint text-danger",
        teal: "bg-teal-tint text-teal",
        purple: "bg-purple-tint text-purple",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export function Tag({
  tone,
  className,
  ...rest
}: ComponentPropsWithRef<"span"> & VariantProps<typeof tagVariants>) {
  return <span className={cn(tagVariants({ tone }), className)} {...rest} />;
}
