import type { ReactNode } from "react";

import { cn } from "#/ui/cn";
import { Count } from "#src/ui/count";

/** A titled part of a page: its title, its count as a `Count` or a muted detail, and its actions at the right, over its content. */
export function Section({
  title,
  count,
  detail,
  actions,
  className,
  children,
}: {
  title: string;
  count?: number | undefined;
  detail?: string | undefined;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className={cn("flex min-w-0 flex-col gap-2", className)}>
      <div className="flex h-8 min-w-0 items-center gap-2">
        <h2 className="type-heading-15 text-ink">{title}</h2>
        {count !== undefined && <Count>{count}</Count>}
        {detail !== undefined && <span className="type-label-13 text-muted">{detail}</span>}
        {actions !== undefined && (
          <div data-edge="end" className="ml-auto flex items-center gap-2">
            {actions}
          </div>
        )}
      </div>
      {children}
    </section>
  );
}
