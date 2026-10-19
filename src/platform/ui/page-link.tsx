import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { IconButton, buttonVariants } from "#/ui/button";
import { cn } from "#/ui/cn";
import { Tooltip } from "#/ui/tooltip";

/** A link to another page of the current route's results, so hovering it preloads the page, or a disabled button when there's none. */
export function PageLink({
  label,
  search,
  children,
}: {
  label: string;
  search: { afters: string[] | undefined } | { page: number | undefined } | undefined;
  children: ReactNode;
}) {
  if (search === undefined) {
    return (
      <IconButton label={label} size="small" disabled>
        {children}
      </IconButton>
    );
  }

  return (
    <Tooltip label={label}>
      <Link
        to="."
        search={(prev) => ({ ...prev, ...search })}
        aria-label={label}
        className={cn(buttonVariants({ variant: "quiet", size: null }), "size-7 px-0")}
      >
        {children}
      </Link>
    </Tooltip>
  );
}
