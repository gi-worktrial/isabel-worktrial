// what Pebble reads with a question: the screen, then the records in view and the ones mentioned, from platform's reads
import type { QueryClient } from "@tanstack/react-query";

import {
  candidateQuery,
  candidatesQuery,
  evalQuery,
  issueEvalsQuery,
  issueQuery,
  issueTracesQuery,
} from "#/queries";
import { flat } from "#/ui/format";
import type { Mention } from "#src/features/pebble/mentions";
import { traceLabel } from "#src/features/pebble/records";
import type { ReadRecord } from "#src/pebble/wire";
import { FAIL_LABEL, PASS_LABEL, type RegisteredEval } from "#src/sdk/evals";
import { messageText } from "#src/sdk/genai";
import type { CandidateSummary, Issue, IssueTracePage } from "#src/sdk/issues";
import { clipped } from "#src/ui/format-extra";

const TRACE_LIMIT = 20;
const BODY_LIMIT = 4000;
const PATCH_LIMIT = 12_000;
const LINE_LIMIT = 200;

/** The records a page shows, from its route's params. */
export type InView = {
  issue?: string | undefined;
  candidate?: string | undefined;
  eval?: string | undefined;
};

type Scope = { orgId: string; agent: string };

// a record's block in the context, with the record and its name for the chat's activity
type Read = { block: string; read: ReadRecord };

const attributes = (fields: Record<string, string | number | undefined>) =>
  Object.entries(fields)
    .flatMap(([name, value]) => (value === undefined ? [] : [`${name}="${value}"`]))
    .join(" ");

const outcome = (annotations: ReadonlyArray<{ label: string }>) =>
  annotations.some(({ label }) => label === FAIL_LABEL)
    ? "Failed"
    : annotations.some(({ label }) => label === PASS_LABEL)
      ? "Passed"
      : "Not graded";

const tally = (name: string, figures: { passed: number; total: number } | undefined) =>
  figures === undefined ? [] : [`${name} ${figures.passed}/${figures.total}`];

function candidateLine({ id, title, recommended, results }: CandidateSummary) {
  const facts =
    results === undefined
      ? ["Not run"]
      : [
          ...tally("New", results.new_evals),
          ...tally("Existing", results.existing_evals),
          ...(results.regressions?.length ? [`regressions ${results.regressions.join(", ")}`] : []),
          ...(results.outdated ? ["out of date"] : []),
          ...(results.run.completed_at === null ? ["running"] : []),
        ];
  const why = recommended === undefined ? "" : ` Recommended: ${recommended}.`;
  return `- ${title} (candidate ${id}): ${facts.join(", ")}.${why}`;
}

function issueBlock(
  issue: Issue,
  traces: IssueTracePage | undefined,
  evals: RegisteredEval[] | null | undefined,
  candidates: CandidateSummary[] | undefined,
) {
  const head = attributes({
    id: issue.id,
    title: issue.title,
    state: issue.state,
    severity: issue.severity,
    traces: issue.trace_count,
    first_seen: issue.first_seen_at,
    last_seen: issue.last_seen_at,
    approved: issue.approved?.candidate,
    approval: issue.approved?.outdated === true ? "out of date" : undefined,
    dismissed_because: issue.dismissal_reason,
    shipped: issue.fix === undefined ? undefined : "yes",
  });
  const lines = [
    `<issue ${head}>`,
    clipped(issue.body.trim(), BODY_LIMIT),
    ...(traces === undefined
      ? []
      : [
          `Traces (the newest ${traces.traces.length} of ${issue.trace_count}):`,
          ...traces.traces.map(
            ({ trace_id, session_id, input, annotations }) =>
              `- Trace ${traceLabel(trace_id)} (trace ${trace_id}, session ${session_id}): "${clipped(flat(messageText(input)), LINE_LIMIT)}" ${outcome(annotations)}`,
          ),
        ]),
    ...(evals === null || evals === undefined
      ? []
      : ["Evals:", ...evals.map(({ id, title }) => `- ${title} (eval ${id})`)]),
    ...(candidates === undefined ? [] : ["Candidates:", ...candidates.map(candidateLine)]),
    "</issue>",
  ];
  return lines.join("\n");
}

function evalBlock({ id, title, prompt, criteria }: RegisteredEval) {
  return [
    `<eval ${attributes({ id, title })}>`,
    clipped(prompt.trim(), BODY_LIMIT),
    ...criteria.map(
      ({ name, kind, description }) => `- Criterion ${name} (${kind}): ${description}`,
    ),
    "</eval>",
  ].join("\n");
}

// a read that fails leaves its record out rather than the question
const settled = async <T>(read: Promise<T>) => {
  try {
    return await read;
  } catch {
    return undefined;
  }
};

async function readIssue(client: QueryClient, scope: Scope, id: string): Promise<Read[]> {
  const params = { ...scope, issue: id };
  const [issue, traces, evals, candidates] = await Promise.all([
    settled(client.fetchQuery(issueQuery(params))),
    settled(
      client.fetchQuery(issueTracesQuery({ ...params, after: undefined, limit: TRACE_LIMIT })),
    ),
    settled(client.fetchQuery(issueEvalsQuery(params))),
    settled(client.fetchQuery(candidatesQuery(params))),
  ]);
  return issue === undefined
    ? []
    : [
        {
          block: issueBlock(issue, traces, evals, candidates),
          read: { ref: { record: "issue", issue: id }, label: id },
        },
      ];
}

async function readCandidate(
  client: QueryClient,
  scope: Scope,
  issue: string,
  id: string,
): Promise<Read[]> {
  const candidate = await settled(
    client.fetchQuery(candidateQuery({ ...scope, issue, candidate: id })),
  );
  if (candidate === undefined) {
    return [];
  }
  const changes = candidate.files.map(({ filename, patch = "" }) => `--- ${filename}\n${patch}`);
  return [
    {
      block: [
        `<candidate ${attributes({ issue, id, title: candidate.title })}>`,
        candidateLine(candidate),
        clipped(candidate.body.trim(), BODY_LIMIT),
        clipped(changes.join("\n"), PATCH_LIMIT),
        "</candidate>",
      ].join("\n"),
      read: { ref: { record: "candidate", issue, candidate: id }, label: candidate.title },
    },
  ];
}

async function readEval(client: QueryClient, scope: Scope, id: string): Promise<Read[]> {
  const task = await settled(client.fetchQuery(evalQuery({ ...scope, eval: id })));
  return task === undefined
    ? []
    : [{ block: evalBlock(task), read: { ref: { record: "eval", eval: id }, label: task.title } }];
}

/**
 * The text written ahead of a question (platform's screen line, then each record in view or mentioned once), with
 * the records it read.
 */
export async function pebbleContext(
  client: QueryClient,
  {
    orgId,
    agent,
    workspace,
    screen,
    view,
    mentions,
  }: {
    orgId: string;
    agent: string | undefined;
    /** The Agent's repository when the chat works in it, as platform's chat names it. */
    workspace: string | undefined;
    screen: string;
    view: InView;
    mentions: readonly Mention[];
  },
): Promise<{ text: string; read: ReadRecord[] }> {
  // platform's screen line: the Agent and, when the chat works in it, its repository
  const screenOf = attributes({
    agent,
    repository: workspace === undefined ? undefined : `/workspace/${workspace}`,
  });
  const opening = `<screen${screenOf === "" ? "" : ` ${screenOf}`}>\n${screen}\n</screen>`;
  if (agent === undefined) {
    return { text: opening, read: [] };
  }
  const scope = { orgId, agent };
  const refs = [
    ...(view.issue === undefined ? [] : [{ record: "issue", issue: view.issue } as const]),
    ...(view.issue === undefined || view.candidate === undefined
      ? []
      : [{ record: "candidate", issue: view.issue, candidate: view.candidate } as const]),
    ...(view.eval === undefined ? [] : [{ record: "eval", eval: view.eval } as const]),
    ...mentions.map(({ ref }) => ref),
  ];
  const unique = [...new Map(refs.map((ref) => [JSON.stringify(ref), ref])).values()];
  const blocks = await Promise.all(
    unique.map((ref) => {
      switch (ref.record) {
        case "issue":
          return readIssue(client, scope, ref.issue);
        case "candidate":
          return readCandidate(client, scope, ref.issue, ref.candidate);
        case "eval":
          return readEval(client, scope, ref.eval);
        case "trace": {
          const named = mentions.find((mention) => mention.ref === ref);
          const label = `Trace ${traceLabel(ref.trace)}`;
          return [
            {
              block: `<trace ${attributes({ label, id: ref.trace, session: ref.session })}>${named?.detail ?? ""}</trace>`,
              read: { ref, label },
            },
          ];
        }
      }
    }),
  );
  const reads = blocks.flat();
  return {
    text: [opening, ...reads.map(({ block }) => block)].join("\n"),
    read: reads.map(({ read }) => read),
  };
}
