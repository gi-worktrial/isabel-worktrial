import type { ReactNode } from "react";

import { cn } from "#/ui/cn";

export function Kbd({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-xs bg-inset px-1 font-sans type-meta-12 text-muted",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
