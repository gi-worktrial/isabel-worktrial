import { useRouter } from "@tanstack/react-router";
import { type ComponentProps, createContext, type MouseEvent, type ReactNode, use } from "react";

import { Chip } from "#src/ui/chip";
import { type RecordHref, recordHrefName } from "#src/ui/record-href";

/** Draws a linked record's current state beside its chip, such as an Issue's state; the app provides it. */
export const RecordStates = createContext<((record: RecordHref) => ReactNode) | undefined>(
  undefined,
);

const RECORD_KINDS = {
  issue: "issue",
  candidate: "candidates",
  trace: "traces",
  eval: "evals",
  run: "run",
} as const satisfies Record<RecordHref["record"], string>;

// a plain click stays in the app, and a modified one opens a tab as any link does
const plainClick = (event: MouseEvent) =>
  event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

/** A Markdown link to an in-app record as its chip; the body keeps a normal link, so platform draws it as one. */
export function RecordLink({
  href,
  record,
  children,
}: ComponentProps<"a"> & { record: RecordHref }) {
  const router = useRouter();
  const state = use(RecordStates);
  // an autolink's words are its URL, so the chip names the record instead
  const words =
    typeof children === "string" && children !== href ? children : recordHrefName(record);
  return (
    <span className="inline-flex max-w-full items-center gap-1">
      <Chip kind={RECORD_KINDS[record.record]} asChild>
        <a
          href={record.href}
          onClick={(event) => {
            if (plainClick(event)) {
              event.preventDefault();
              void router.navigate({ href: record.href });
            }
          }}
        >
          <span className="min-w-0 truncate">{words}</span>
        </a>
      </Chip>
      {state?.(record)}
    </span>
  );
}
