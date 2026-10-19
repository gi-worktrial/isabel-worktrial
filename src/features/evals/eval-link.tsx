import type { RegisteredEval } from "@grounded-intelligence/grounded-sdk";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { evalsQuery } from "#/queries";

type EvalLinkProps = {
  orgId: string;
  agent: string;
  task: RegisteredEval;
  issue?: string | undefined;
};

const ROW = "row-action block truncate";

/** An Eval's row link: its Eval page, or for an Issue's Eval not yet on main, the Issue's Debug Evals open on it, since the Eval page reads main. */
export function EvalLink({ issue, ...props }: EvalLinkProps) {
  return issue === undefined ? (
    <MainEvalLink {...props} />
  ) : (
    <IssueEvalLink {...props} issue={issue} />
  );
}

function MainEvalLink({ orgId, agent, task }: EvalLinkProps) {
  return (
    <Link
      to="/$orgId/agents/$agent/evals/$eval"
      params={{ orgId, agent, eval: task.id }}
      className={ROW}
    >
      {task.title}
    </Link>
  );
}

function IssueEvalLink({ orgId, agent, task, issue }: EvalLinkProps & { issue: string }) {
  const main = useSuspenseQuery(evalsQuery({ orgId, agent })).data;
  if (main.some(({ id }) => id === task.id)) {
    return <MainEvalLink orgId={orgId} agent={agent} task={task} />;
  }
  return (
    <Link
      to="/$orgId/agents/$agent/issues/$issue/debug/evals"
      params={{ orgId, agent, issue }}
      search={{ file: `${task.path}/instruction.md` }}
      className={ROW}
    >
      {task.title}
    </Link>
  );
}
