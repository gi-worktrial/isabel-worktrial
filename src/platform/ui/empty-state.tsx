import { ChartNoAxesColumn, CircleAlert, SearchX } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "#/ui/button";

/** Placeholder for a list with no rows. Pass `onClear` when filters emptied the list, to add a "Clear filters" button. */
export function EmptyState({
  title,
  description,
  onClear,
  action,
  role = "status",
}: {
  title: string;
  description?: string | undefined;
  role?: "status" | "alert";
} & (
  | { onClear?: (() => void) | undefined; action?: never }
  | { onClear?: never; action?: ReactNode }
)) {
  const Icon =
    role === "alert" ? CircleAlert : onClear === undefined ? ChartNoAxesColumn : SearchX;
  return (
    <div
      role={role}
      className="enter-fade flex min-h-40 w-full flex-col items-center justify-center px-6 py-8 text-center"
    >
      <Icon className={role === "alert" ? "size-5 text-danger" : "size-5 text-muted"} />
      <p className="mt-3 type-label-13 font-medium text-ink">{title}</p>
      {description !== undefined && (
        <p className="mt-1 max-w-80 type-meta-12 text-muted">{description}</p>
      )}
      {onClear !== undefined && (
        <Button size="small" onClick={onClear} className="mt-4">
          Clear filters
        </Button>
      )}
      {action !== undefined && <div className="mt-4">{action}</div>}
    </div>
  );
}
