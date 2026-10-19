import { Command as CommandPrimitive } from "cmdk";
import { Search } from "lucide-react";
import type { ComponentProps } from "react";

import { cn } from "#/ui/cn";

export function Command({ className, ...props }: ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      data-slot="command"
      className={cn("flex w-full flex-col overflow-hidden rounded-md text-ink", className)}
      {...props}
    />
  );
}

export function CommandInput({
  className,
  ...props
}: ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <div
      data-slot="command-input-wrapper"
      className="mx-1 mb-1 flex h-8 items-center gap-2 rounded-control bg-fill px-2 has-[input:focus-visible]:outline-2 has-[input:focus-visible]:-outline-offset-2 has-[input:focus-visible]:outline-ring"
    >
      <Search className="size-3.5 shrink-0 text-muted" />
      <CommandPrimitive.Input
        data-slot="command-input"
        className={cn(
          "min-w-0 flex-1 bg-transparent type-label-13 outline-none placeholder:text-faint disabled:text-faint",
          className,
        )}
        {...props}
      />
    </div>
  );
}

export function CommandList({ className, ...props }: ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      data-slot="command-list"
      className={cn(
        "max-h-96 scroll-py-1 overflow-x-hidden overflow-y-auto [&_[cmdk-list-sizer]]:flex [&_[cmdk-list-sizer]]:flex-col [&_[cmdk-list-sizer]]:gap-1",
        className,
      )}
      {...props}
    />
  );
}

export function CommandEmpty({
  className,
  ...props
}: ComponentProps<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      className={cn("px-3 py-2 type-label-13 text-muted", className)}
      {...props}
    />
  );
}

export function CommandItem({ className, ...props }: ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      className={cn("menu-item select-none data-[disabled=true]:pointer-events-none", className)}
      {...props}
    />
  );
}
