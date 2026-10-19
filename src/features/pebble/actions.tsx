import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouteContext } from "@tanstack/react-router";
import { Check, ListMinus, ListPlus, RotateCcw, SquareArrowOutUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import { agentKey, agentsQuery, issueQuery } from "#/queries";
import { Button } from "#/ui/button";
import { recordName, recordRoute, traceLabel } from "#src/features/pebble/records";
import type { PebbleAction } from "#src/pebble/wire";
import { errorMessage } from "#src/ui/format-extra";
import { Busy } from "#src/ui/progress";

/** One action's identity within its answer, as the chat records it once run. */
export const actionKey = (action: PebbleAction) => JSON.stringify(action);

function chip(action: PebbleAction): { label: string; icon: ReactNode } {
  switch (action.kind) {
    case "open":
      return { label: `Open ${recordName(action.ref)}`, icon: <SquareArrowOutUpRight /> };
    case "rerun":
      return { label: `Rerun Evals for ${action.candidate}`, icon: <RotateCcw /> };
    case "include_trace":
      return {
        label: `Add Trace ${traceLabel(action.trace)} to ${action.issue}`,
        icon: <ListPlus />,
      };
    case "exclude_trace":
      return {
        label: `Remove Trace ${traceLabel(action.trace)} from ${action.issue}`,
        icon: <ListMinus />,
      };
  }
}

type Run = { status: "idle" | "running" } | { status: "failed"; error: string };

/** An answer's chips, each running platform's own call for the Agent in view only when clicked. */
export function PebbleActions({
  orgId,
  agent,
  actions,
  done,
  onDone,
}: {
  orgId: string;
  agent: string | undefined;
  actions: readonly PebbleAction[];
  /** The `actionKey`s of the chips the engineer ran. */
  done: ReadonlySet<string>;
  onDone(action: PebbleAction): void;
}) {
  return (
    actions.length > 0 && (
      <div role="group" aria-label="Pebble's actions" className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <ActionChip
            key={actionKey(action)}
            orgId={orgId}
            agent={agent}
            action={action}
            done={done.has(actionKey(action))}
            onDone={() => onDone(action)}
          />
        ))}
      </div>
    )
  );
}

function ActionChip({
  orgId,
  agent,
  action,
  done,
  onDone,
}: {
  orgId: string;
  agent: string | undefined;
  action: PebbleAction;
  done: boolean;
  onDone(): void;
}) {
  const { client } = useRouteContext({ from: "/$orgId" });
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const repo = useQuery({ ...agentsQuery({ orgId }), enabled: agent !== undefined }).data?.find(
    ({ name }) => name === agent,
  )?.repo;
  const [run, setRun] = useState<Run>({ status: "idle" });
  const { label, icon } = chip(action);

  async function perform(agentName: string, repoName: string) {
    if (action.kind === "open") {
      await navigate(recordRoute(orgId, agentName, action.ref));
      return;
    }
    const params = { orgId, agent: agentName, issue: action.issue };
    if (action.kind === "rerun") {
      await client.issues.rerunCandidate({
        agent: agentName,
        repo: repoName,
        id: action.issue,
        candidate: action.candidate,
      });
    } else {
      // the change applies to the Issue as it is now, never to an older read
      const issue = await queryClient.fetchQuery({ ...issueQuery(params), staleTime: 0 });
      await client.issues.update({
        agent: agentName,
        repo: repoName,
        id: action.issue,
        expectedHeadOid: issue.head_oid,
        action: action.kind,
        trace: action.trace,
      });
    }
    onDone();
    // a commit moves the Issue, its Candidates, Evals and runs, so every open view of the Agent reads again at once
    await queryClient.invalidateQueries({ queryKey: agentKey(params) });
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Button
        size="small"
        disabled={agent === undefined || repo === undefined || run.status === "running" || done}
        onClick={() => {
          if (agent === undefined || repo === undefined) {
            return;
          }
          setRun({ status: "running" });
          perform(agent, repo).then(
            () => setRun({ status: "idle" }),
            (error: unknown) => setRun({ status: "failed", error: errorMessage(error) }),
          );
        }}
        className="[&_svg]:size-3.5"
      >
        {run.status === "running" ? <Busy label="Working" /> : done ? <Check /> : icon}
        {label}
      </Button>
      {run.status === "failed" && (
        <span role="alert" className="type-meta-12 text-danger">
          {run.error}
        </span>
      )}
    </span>
  );
}

/** What running an action did, in the past tense, with a link to the record it changed. */
export function DoneAction({
  orgId,
  agent,
  action,
}: {
  orgId: string;
  agent: string;
  action: Exclude<PebbleAction, { kind: "open" }>;
}) {
  const issue = { orgId, agent, issue: action.issue };
  switch (action.kind) {
    case "rerun":
      return (
        <>
          Reran Evals for{" "}
          <Link
            to="/$orgId/agents/$agent/issues/$issue/candidates/$candidate"
            params={{ ...issue, candidate: action.candidate }}
            className="inline-link"
          >
            {action.candidate}
          </Link>
        </>
      );
    case "include_trace":
    case "exclude_trace":
      return (
        <>
          {action.kind === "include_trace" ? "Added" : "Removed"} Trace {traceLabel(action.trace)}{" "}
          {action.kind === "include_trace" ? "to" : "from"}{" "}
          <Link
            to="/$orgId/agents/$agent/issues/$issue/traces"
            params={issue}
            className="inline-link"
          >
            {action.issue}
          </Link>
        </>
      );
  }
}
