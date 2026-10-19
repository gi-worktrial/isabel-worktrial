import { useSuspenseQuery } from "@tanstack/react-query";
import { sessionQuery } from "#/queries";
import { Link, createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { formatCost } from "../../../../../../traces";
import { tokenCount } from "#/session-table";
import {
  OutcomeTag,
  TraceTurns,
  issuesOf,
  scoreText,
  sessionGrades,
} from "../../../../../../trace-view";
import { sessionTitle } from "#/titles";
import { IssueLinks } from "../../../../../../evals";
import { usePebblePage } from "#/pebble/page";
import { SESSION_VIEW_SEARCH } from "#src/features/traces/search";
import { FailureSummary, StepPlacesOf } from "#src/features/traces/failure";
import {
  TraceViewBar,
  otherFailures,
  sessionPebblePage,
  useSessionView,
} from "#src/features/traces/session-page";
import { TraceFlow } from "#src/features/traces/trace-flow";
import { crumbTitle } from "#src/features/traces/crumbs";
import { Chip } from "#src/ui/chip";
import { CopyButton } from "#/ui/copy-button";
import { Fact, Facts } from "#/ui/facts";
import { formatDuration } from "#src/features/traces/duration";
import { Tag } from "#/ui/tag";
import { Tooltip } from "#/ui/tooltip";
import { crumbs } from "#/crumbs";
import { TimeTag } from "#src/ui/time-tag";

export const Route = createFileRoute("/$orgId/agents/$agent/traces/$session/")({
  validateSearch: z.object({
    after: z.string().optional(),
    ...SESSION_VIEW_SEARCH,
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context: { queryClient }, params, deps }) => {
    const { page } = await queryClient.ensureQueryData(
      sessionQuery({ ...params, after: deps.after }),
    );
    return crumbs(
      { label: "Traces", to: "/$orgId/agents/$agent/traces" },
      {
        label: crumbTitle(sessionTitle(page.session)),
        to: "/$orgId/agents/$agent/traces/$session",
      },
    );
  },
  component: SessionPage,
});

function SessionPage() {
  const { orgId, agent, session } = Route.useParams();
  const { after } = Route.useSearch();
  const { page, annotations } = useSuspenseQuery(
    sessionQuery({ orgId, agent, session, after }),
  ).data;
  const summary = page.session;
  const labels = summary.annotations;
  const issues = issuesOf(labels);
  const tokens = tokenCount(summary.input_tokens, summary.output_tokens);
  const last = page.turns.at(-1);
  const { criteria, dimensions } = sessionGrades(annotations, page.turns);
  const graded = new Set([...criteria, ...dimensions].map(({ name }) => name));
  const ungraded = otherFailures(labels, graded);
  const trial = page.turns[0]?.spans.find((span) => span.parent_span_id === "")?.attributes;
  const task = trial?.["grounded.task.name"];
  const cost = trial?.["grounded.cost_usd"];
  usePebblePage(...sessionPebblePage({ session, task, title: sessionTitle(summary), criteria }));
  const { step, view, onView } = useSessionView();

  return (
    <article aria-label="Trace" className="flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        <h1 className="line-clamp-2 type-title-18 text-ink">{sessionTitle(summary)}</h1>
        <Facts label="Trace details">
          <Fact label="Session">
            <Chip code title={session} className="max-w-28">
              {session}
            </Chip>
            <CopyButton label="Copy session ID" text={session} />
          </Fact>
          <Fact label="Outcome">
            <OutcomeTag annotations={labels} />
            {ungraded.map((name) => (
              <Tag key={name} tone="danger">
                {name}
              </Tag>
            ))}
          </Fact>
          {task && (
            <Fact label="Eval">
              <Link to="/$orgId/agents/$agent/evals/$eval" params={{ orgId, agent, eval: task }}>
                {task}
              </Link>
            </Fact>
          )}
          {dimensions.map((grade) => (
            <Fact key={`${grade.name}:${grade.source.id}`} label={grade.criterion}>
              {scoreText(grade) ?? <OutcomeTag annotations={[grade]} />}
            </Fact>
          ))}
          {issues.length > 0 && (
            <Fact label="Issues">
              <IssueLinks orgId={orgId} agent={agent} issues={issues} />
            </Fact>
          )}
          {summary.errors > 0 && (
            <Fact label="Status">
              <Tag tone="danger">
                {summary.errors === 1 ? "1 error" : `${summary.errors} errors`}
              </Tag>
            </Fact>
          )}
          <Fact label="Time">
            <TimeTag at={summary.started_at} />
          </Fact>
          <Fact label="Duration">
            <Tag>{formatDuration(summary.duration_ns)}</Tag>
          </Fact>
          {tokens && (
            <Fact label="Usage">
              <Tooltip label={tokens.breakdown}>
                <Tag tabIndex={0}>{`${tokens.total} tokens`}</Tag>
              </Tooltip>
            </Fact>
          )}
          {cost && <Fact label="Cost">{formatCost(Number(cost))}</Fact>}
        </Facts>
      </header>
      <FailureSummary annotations={annotations} turns={page.turns} />
      <TraceViewBar view={view} onView={onView} />
      <StepPlacesOf turns={page.turns}>
        {view === "flow" ? (
          <TraceFlow annotations={annotations} turns={page.turns} />
        ) : (
          <TraceTurns
            key={[after, step].join()}
            step={step}
            annotations={annotations}
            turns={page.turns}
          />
        )}
      </StepPlacesOf>
      <p className="flex gap-4 type-label-13">
        {after && (
          <Link to="/$orgId/agents/$agent/traces/$session" params={{ orgId, agent, session }} state>
            First turns
          </Link>
        )}
        {page.has_more && last && (
          <Link
            to="/$orgId/agents/$agent/traces/$session"
            params={{ orgId, agent, session }}
            search={{ after: last.trace_id }}
            state
          >
            Later turns
          </Link>
        )}
      </p>
    </article>
  );
}
