import { Link } from "@tanstack/react-router";

import { useIssueParams, useStartIssueWork } from "#/issue-view";
import { usePebbleDock } from "#/pebble/page";
import { Button } from "#/ui/button";
import { PebbleMark } from "#/ui/marks";
import { Tooltip } from "#/ui/tooltip";
import { TabActions } from "#src/ui/tab-actions";

/** What Pebble is asked when an Issue needs a New Eval, which Debug Evals' New Eval asks too. */
export const NEW_EVAL_PROMPT = "Write a New Eval for this Issue: ";

/** Add Evals: Pebble writes an Issue its first Evals, the one next step while it has none. */
export function AddEvals({ variant }: { variant?: "outline" }) {
  const pebble = usePebbleDock();
  const startWork = useStartIssueWork();
  return (
    <Button
      size="small"
      variant={variant}
      onClick={() => {
        startWork();
        pebble.prefill(NEW_EVAL_PROMPT);
      }}
    >
      <PebbleMark />
      Add Evals
    </Button>
  );
}

/** Debug Evals at the right end of the Issue's tab row, disabled with its reason until the Issue has an evals branch. */
export function DebugEvalsAction({ exists }: { exists: boolean }) {
  const params = useIssueParams();
  const startWork = useStartIssueWork();
  return (
    <TabActions>
      {exists ? (
        <Button size="small" asChild>
          <Link
            to="/$orgId/agents/$agent/issues/$issue/debug/evals"
            params={params}
            onClick={startWork}
          >
            Debug Evals
          </Link>
        </Button>
      ) : (
        <Tooltip label="This Issue has no Evals to debug yet">
          <span tabIndex={0} className="rounded-sm">
            <Button size="small" disabled>
              Debug Evals
            </Button>
          </span>
        </Tooltip>
      )}
    </TabActions>
  );
}
