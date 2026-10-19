import { createLink } from "@tanstack/react-router";
import type { ComponentPropsWithRef, ReactNode } from "react";

import { cn } from "#/ui/cn";

const TAB =
  "flex h-8 min-w-0 items-center gap-1 rounded-xs px-3 type-label-13 font-medium text-muted hover:bg-fill hover:text-ink aria-[current=page]:bg-fill aria-[current=page]:text-ink aria-[current=true]:bg-fill aria-[current=true]:text-ink";

export function Tabs({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <nav aria-label={label} className={cn("flex border-b border-divider pb-2", className)}>
      <div className="flex min-w-0 flex-1 gap-1">{children}</div>
    </nav>
  );
}

function TabAnchor({ className, ...props }: ComponentPropsWithRef<"a">) {
  return <a className={cn(TAB, "group/tab", className)} {...props} />;
}

export const Tab = createLink(TabAnchor);

export function TabButton({ className, ...props }: ComponentPropsWithRef<"button">) {
  return <button type="button" className={cn(TAB, className)} {...props} />;
}
