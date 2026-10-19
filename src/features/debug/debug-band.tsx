import { Link, linkOptions } from "@tanstack/react-router";
import { ArrowLeft, Bug } from "lucide-react";

import { useIssueParams } from "#/issue-view";
import { buttonVariants } from "#/ui/button";
import { cn } from "#/ui/cn";
import { Tooltip } from "#/ui/tooltip";
import type { Issue } from "#src/sdk/index";
import { Chip } from "#src/ui/chip";
import { KeyHint } from "#src/ui/kbd";

/** Debug's tinted band, so it reads as a mode, with the Issue and Back to Issue, which goes where Esc does. */
export function DebugBand({ issue, candidate }: { issue: Issue; candidate?: string }) {
  const params = useIssueParams();
  const back =
    candidate === undefined
      ? linkOptions({ to: "/$orgId/agents/$agent/issues/$issue/evals", params })
      : linkOptions({
          to: "/$orgId/agents/$agent/issues/$issue/candidates/$candidate",
          params: { ...params, candidate },
        });

  return (
    <section
      aria-label="Debugging"
      className="-mx-3 flex h-10 shrink-0 items-center gap-3 rounded-sm bg-accent-tint px-3"
    >
      <span className="flex shrink-0 items-center gap-2 type-label-13 font-medium text-accent-ink">
        <Bug aria-hidden="true" className="size-4" />
        Debugging
      </span>
      <Chip kind="issue">{issue.id}</Chip>
      <span className="min-w-0 flex-1 truncate type-label-13 text-ink" title={issue.title}>
        {issue.title}
      </span>
      <Tooltip label={<KeyHint label="Back to Issue" keys="Esc" />}>
        <Link
          {...back}
          className={cn(buttonVariants({ variant: "outline", size: "small" }), "bg-surface")}
        >
          <ArrowLeft aria-hidden="true" className="size-3.5" />
          Back to Issue
        </Link>
      </Tooltip>
    </section>
  );
}
