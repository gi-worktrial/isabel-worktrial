import { Check, LoaderCircle, X } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "#/ui/cn";

// only the current or running step takes color, done and dismissed go grey, and failed is a red x
const MARKS = {
  current: {
    look: "border-2 border-accent",
    mark: <span className="size-1.5 rounded-full bg-accent" />,
  },
  waiting: { look: "border border-divider-strong", mark: null },
  done: { look: "bg-inset text-muted", mark: <Check className="size-2.5" strokeWidth={3.5} /> },
  dismissed: { look: "bg-inset text-muted", mark: <X className="size-2.5" strokeWidth={3.5} /> },
  failed: {
    look: "border border-danger text-danger",
    mark: <X className="size-2.5" strokeWidth={3.5} />,
  },
} as const;

type StepState = keyof typeof MARKS | "running";

export function StepMark({ state }: { state: StepState }) {
  if (state === "running") {
    return (
      <LoaderCircle
        aria-hidden="true"
        className="size-4 shrink-0 text-accent motion-safe:animate-spin"
      />
    );
  }
  const { look, mark } = MARKS[state];
  return (
    <span
      aria-hidden="true"
      className={cn("inline-flex size-4 shrink-0 items-center justify-center rounded-full", look)}
    >
      {mark}
    </span>
  );
}

export function Steps({ label, children }: { label: string; children: ReactNode }) {
  return (
    <ol aria-label={label} className="flex flex-col">
      {children}
    </ol>
  );
}
