import { useId, type ReactNode } from "react";

import { cn } from "#/ui/cn";

/** A labeled control (`above` puts the label over it in muted words). */
export function Field({
  label,
  htmlFor,
  above = false,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  above?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div
      role={htmlFor === undefined ? "group" : undefined}
      aria-labelledby={htmlFor === undefined ? id : undefined}
      className={cn(
        "grid min-w-0",
        above ? "gap-2" : "gap-x-6 gap-y-1 md:grid-cols-[200px_minmax(0,1fr)]",
        className,
      )}
    >
      {/* Beside the control, the label centers on its first 32px line. */}
      <div className={cn("flex min-w-0", !above && "min-h-8 items-center self-start")}>
        {htmlFor === undefined ? (
          <span id={id} className={labelClass(above)}>
            {label}
          </span>
        ) : (
          <label htmlFor={htmlFor} className={labelClass(above)}>
            {label}
          </label>
        )}
      </div>
      <div className={cn("flex min-w-0 flex-col gap-2", !above && "min-h-8 justify-center")}>
        {children}
      </div>
    </div>
  );
}

const labelClass = (above: boolean) =>
  above ? "type-label-13 text-muted" : "type-label-13 font-medium text-ink";

export function FieldGroup({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col">
      <h2 id={id} className="pb-2 type-heading-15 text-[16px]/[24px] text-ink">
        {title}
      </h2>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}
