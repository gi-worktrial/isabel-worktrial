import type { EvalStatus, RegisteredEval } from "@grounded-intelligence/grounded-sdk";
import { Link } from "@tanstack/react-router";

import { Tag } from "#/ui/tag";
import { Tooltip } from "#/ui/tooltip";
import { EvalLink } from "#src/features/evals/eval-link";
import { Chip } from "#src/ui/chip";
import { NotRun } from "#src/ui/result-tag";
import { TimeTag } from "#src/ui/time-tag";

type Criterion = RegisteredEval["criteria"][number];

const KIND_WORDS = { code: "Code check", llm: "LLM judge" } as const;

const figure = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(2));

/** A criterion's scale as a tag, such as "Pass or fail", "1 to 5", or "3 levels" with the levels in its tooltip. */
function ScaleTag({ scale }: { scale: Criterion["scale"] }) {
  switch (scale?.type) {
    case "binary":
      return <Tag>Pass or fail</Tag>;
    case "numeric":
      return <Tag>{`${figure(scale.min)} to ${figure(scale.max)}`}</Tag>;
    case "categorical":
      return (
        <Tooltip label={scale.levels.join(", ")}>
          <Tag tabIndex={0}>{`${scale.levels.length} levels`}</Tag>
        </Tooltip>
      );
    case undefined:
      return null;
  }
}

/** A Grade name's last segment, which names the criterion under its dimension and components. */
export const criterionTitle = (name: string) => name.split("/").at(-1) ?? name;

export function CriteriaList({ criteria }: { criteria: readonly Criterion[] }) {
  return (
    <ul className="flex flex-col py-2">
      {criteria.map((criterion) => (
        <li
          key={criterion.name}
          aria-label={criterion.name}
          className="flex min-w-0 items-center gap-3 py-2"
        >
          <p className="min-w-0 flex-1 type-label-13 text-ink" title={criterion.name}>
            {criterion.description || criterionTitle(criterion.name)}
          </p>
          <ScaleTag scale={criterion.scale} />
          <Tag tone={criterion.kind === "llm" ? "purple" : "teal"}>
            {KIND_WORDS[criterion.kind]}
          </Tag>
        </li>
      ))}
    </ul>
  );
}

export function IssueLinks({
  orgId,
  agent,
  issues,
}: {
  orgId: string;
  agent: string;
  issues: readonly string[];
}) {
  return issues.map((issue) => (
    <Chip key={issue} asChild code>
      <Link to="/$orgId/agents/$agent/issues/$issue" params={{ orgId, agent, issue }}>
        {issue}
      </Link>
    </Chip>
  ));
}

function ResultTag({ passed }: { passed: boolean | undefined }) {
  if (passed === undefined) {
    return <NotRun />;
  }

  return passed ? <Tag tone="success">Passed</Tag> : <Tag tone="danger">Failed</Tag>;
}

/** Evals as rows of their title, the Issues they reproduce, and their criteria count, plus their result and when they last passed when `statuses` is given. */
export function EvalTable({
  orgId,
  agent,
  evals,
  statuses,
  issue,
}: {
  orgId: string;
  agent: string;
  evals: readonly RegisteredEval[];
  statuses?: ReadonlyMap<string, EvalStatus> | undefined;
  issue?: string | undefined;
}) {
  return (
    <table aria-label="Evals" className="record-table">
      <thead>
        <tr>
          <th className="w-full">Eval</th>
          {statuses && <th>Result</th>}
          {statuses && <th className="@max-lg:hidden">Last passed</th>}
          <th>Issues</th>
          <th className="@max-lg:hidden">Criteria</th>
        </tr>
      </thead>
      <tbody>
        {evals.map((task) => {
          const status = statuses?.get(task.id);
          return (
            <tr key={task.id}>
              <td className="max-w-0 text-ink">
                <EvalLink orgId={orgId} agent={agent} task={task} issue={issue} />
              </td>
              {statuses && (
                <td>
                  <ResultTag passed={status?.passed} />
                </td>
              )}
              {statuses && (
                <td className="text-muted @max-lg:hidden">
                  {status?.passed_at === undefined ? "Never" : <TimeTag at={status.passed_at} />}
                </td>
              )}
              <td>
                <span className="flex gap-1">
                  <IssueLinks orgId={orgId} agent={agent} issues={task.issues} />
                </span>
              </td>
              <td className="tabular-nums @max-lg:hidden">{task.criteria.length}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
