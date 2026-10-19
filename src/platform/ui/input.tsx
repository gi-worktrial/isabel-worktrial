import type { ComponentPropsWithRef } from "react";

import { cn } from "#/ui/cn";

export function Input({ className, ...props }: ComponentPropsWithRef<"input">) {
  return <input className={cn("field-control", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentPropsWithRef<"textarea">) {
  return <textarea className={cn("field-control resize-y", className)} {...props} />;
}
