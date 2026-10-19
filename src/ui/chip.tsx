import {
  Activity,
  Bot,
  ClipboardCheck,
  Clock,
  FileCode2,
  FileText,
  Hammer,
  LayoutDashboard,
  Play,
  Workflow,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { Slot } from "radix-ui";
import type { ComponentPropsWithRef } from "react";

import { cn } from "#/ui/cn";

const KIND_ICONS = {
  issue: LayoutDashboard,
  editor: FileCode2,
  document: FileText,
  traces: Activity,
  evals: ClipboardCheck,
  candidates: Wrench,
  run: Play,
  automation: Workflow,
  agent: Bot,
  history: Clock,
  tool: Hammer,
} as const satisfies Record<string, LucideIcon>;
type ChipKind = keyof typeof KIND_ICONS;

export function KindIcon({ kind, className = "size-3.5" }: { kind: ChipKind; className?: string }) {
  const Icon = KIND_ICONS[kind];
  return <Icon aria-hidden="true" className={cn("shrink-0", className)} />;
}

// an id, sha or run id reads as code, and names and "Trace 24" stay in the sans
export const isCode = (text: unknown) =>
  typeof text === "string" &&
  /^(?:[A-Z]+-\d+|[0-9a-f]{7,40}|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/u.test(text);

// a linked record as a light blue-grey chip, opening the record when it holds a click or a link
export function Chip({
  kind,
  asChild = false,
  code,
  className,
  children,
  ...rest
}: ComponentPropsWithRef<"button"> & { kind?: ChipKind; asChild?: boolean; code?: boolean }) {
  const opens = asChild || rest.onClick !== undefined;
  const Root = asChild ? Slot.Root : opens ? "button" : "span";
  return (
    <Root
      {...(Root === "button" ? { type: "button" } : {})}
      className={cn(
        "inline-flex h-5 max-w-full min-w-0 shrink-0 items-center gap-1 rounded-[3px] bg-link px-2 text-left whitespace-nowrap text-link-ink tabular-nums",
        (code ?? isCode(children)) ? "type-mono-12" : "type-meta-12",
        opens && "cursor-pointer no-underline hover:bg-inset",
        className,
      )}
      {...rest}
    >
      {kind === undefined ? null : <KindIcon kind={kind} className="size-3" />}
      {asChild ? (
        <Slot.Slottable>{children}</Slot.Slottable>
      ) : (
        <span className="min-w-0 truncate">{children}</span>
      )}
    </Root>
  );
}
