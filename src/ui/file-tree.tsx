import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { ReactNode } from "react";

import { IconButton } from "#/ui/button";

export function RailToggle({ shown, onToggle }: { shown: boolean; onToggle(): void }) {
  return (
    <IconButton
      label={shown ? "Hide files" : "Show files"}
      size="small"
      className="text-muted"
      onClick={onToggle}
    >
      {shown ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
    </IconButton>
  );
}

// a rail of files beside a pane, with the pane's own rows as children
export function FileRail({
  label,
  title,
  onHide,
  className = "w-60",
  children,
}: {
  label: string;
  title?: ReactNode;
  onHide?: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <nav
      aria-label={label}
      className={`flex shrink-0 flex-col border-r border-divider ${className}`}
    >
      {(onHide !== undefined || title !== undefined) && (
        <div className="flex h-10 shrink-0 items-center gap-1 border-b border-divider px-2">
          {onHide === undefined ? null : <RailToggle shown onToggle={onHide} />}
          {title}
        </div>
      )}
      {children}
    </nav>
  );
}
