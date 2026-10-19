import type { ProductClient } from "#src/queries/client";
import {
  type Agent,
  type Annotation,
  type ApiKey,
  type CreatedApiKey,
  RUN_EVALS_JOB,
  type Trace,
} from "#src/sdk/index";

import { must, type Plane, refusal } from "./access.ts";
import { GitError } from "./git.ts";
import { TASKS } from "./registry.ts";
import type { Played } from "./runs.ts";
import {
  annotationCounts,
  AnnotationIndex,
  isRecording,
  latestAnnotations,
  listedOf,
  page,
  passes,
  rootOf,
  rowsOf,
  sessionsOf,
  sessionSummary,
  turnOf,
} from "./traces.ts";
import {
  asTrial,
  criteriaPath,
  evaluationAnnotation,
  gradeEvaluations,
  stableHex,
  trialTraceId,
} from "./trials.ts";

/** A stable UUID (version 8) for an Agent from its name, so records naming an Agent's id tell the Agents apart. */
export function agentIdOf(name: string): string {
  const hex = stableHex(name, [0x811c9dc5, 0x050c5d1f, 0x2c3b6a9d, 0x6b8b4567]);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`;
}

// a stored trial row names its task under evals/tasks/, as jobs.ts reads it
const taskOf = (task: string) => task.replace(new RegExp(`^${TASKS}/`, "u"), "");

const newestFirst = (left: Trace, right: Trace) =>
  rootOf(right).started_at.localeCompare(rootOf(left).started_at) ||
  right.trace_id.localeCompare(left.trace_id);

/** The agents service for the demo's one Agent, over the seed's traces and each played Eval run's trials. */
export function agentsResource(
  { seed, git, now, read, write }: Plane,
  agent: Agent,
  runs: () => readonly Played[],
): ProductClient["agents"] {
  // the stored runs' trials are Traces of their own, as the collector holds them; a recorded trial stays out of
  // listings, and a run played during the demo gets a session of the recording it replays
  const indexed = new Map(seed.traces.map((trace) => [trace.trace_id, trace]));
  const seededTraces = seed.traces.filter((trace) => !isRecording(trace));
  const stored = new Map(seed.runs.map((run) => [run.id, run]));
  const loaded = async (id: string) =>
    seed.loadTrace === undefined ? indexed.get(id) : await seed.loadTrace(id);
  const playedTrials = () =>
    runs().flatMap(({ run, trials }) =>
      stored.has(run.id)
        ? []
        : trials.flatMap((row) =>
            row.recorded === null || !indexed.has(row.recorded)
              ? []
              : [{ run, row, id: trialTraceId(run.id, row.task), recorded: row.recorded }],
          ),
    );
  const traces = () => [
    ...seededTraces,
    ...playedTrials().map(({ run, row, id, recorded }) =>
      asTrial(must(indexed.get(recorded), "Trace not found"), id, run.id, row),
    ),
  ];
  const full = async (id: string) => {
    const played = playedTrials().find((entry) => entry.id === id);
    if (played === undefined) {
      return must(indexed.has(id) ? await loaded(id) : undefined, "Trace not found");
    }
    const recorded = must(await loaded(played.recorded), "Trace not found");
    return asTrial(recorded, id, played.run.id, played.row);
  };

  // each stored run's exported evaluations, stamped with the run as the collector stamps its job token, a trial's
  // grades under its own session
  const seededAnnotations = latestAnnotations(
    seed.runs.flatMap((run) => {
      const trials = new Map(
        (run.trials ?? []).map((row) => [trialTraceId(run.id, taskOf(row.task)), row.trial]),
      );
      return (seed.evaluations?.[run.id] ?? []).map((evaluation) =>
        evaluationAnnotation(evaluation, {
          session:
            evaluation.target.kind === "trace" ? (trials.get(evaluation.target.trace) ?? "") : "",
          kind: run.annotation_kind,
          job: run.job,
          commit: run.sha,
          at: run.completed_at ?? run.created_at,
        }),
      );
    }),
  );
  let cached: { key: string; index: AnnotationIndex } | undefined;
  const annotations = () => {
    const played = playedTrials();
    const key = played.map((entry) => entry.id).join(",");
    if (cached?.key !== key) {
      const graded: Annotation[] = played.flatMap(({ run, row, id, recorded }) => {
        const criteria = git.entryAt(run.sha, criteriaPath(row.task));
        return gradeEvaluations({
          traceId: id,
          spanId: rootOf(must(indexed.get(recorded), "Trace not found")).span_id,
          details: seed.grades[recorded],
          criteriaText: criteria === undefined ? undefined : git.text(criteria.sha),
        }).map((evaluation) =>
          evaluationAnnotation(evaluation, {
            session: row.trial,
            job: RUN_EVALS_JOB,
            commit: run.sha,
            at: row.finished_at,
          }),
        );
      });
      cached = { key, index: new AnnotationIndex([...seededAnnotations, ...graded]) };
    }
    return cached.index;
  };

  // the key the Agent's deployment exports its traces with, named by their environment and made with the Agent
  const environment = seededTraces
    .map((trace) => rootOf(trace).resource_attributes["deployment.environment.name"])
    .find((name) => name !== undefined && name !== "eval");
  const keys: ApiKey[] =
    environment === undefined
      ? []
      : [
          {
            id: agentIdOf(`${agent.name}:${environment}:key`),
            name: environment,
            prefix: `gk_${agentIdOf(`${agent.name}:${environment}:secret`).slice(0, 7)}`,
            created_by: agent.created_by,
            created_at: agent.created_at,
          },
        ];
  const refuse = () => read(refusal("The demo can't change its Agents"));
  // a call naming another Agent answers 404
  const own = <Value>(gate: Plane["read"], name: string, answer: () => Value | Promise<Value>) =>
    gate(() => {
      if (name !== agent.name) {
        throw new GitError("Agent not found", 404);
      }
      return answer();
    });
  return {
    list: () => read(() => [agent]),
    get: ({ agent: name }) => own(read, name, () => agent),
    create: refuse,
    delete: refuse,
    listKeys: ({ agent: name }) => own(read, name, () => keys),
    createKey: ({ agent: name, name: label }) =>
      own(write, name, () => {
        const secret = `gk_${crypto.randomUUID().replaceAll("-", "")}`;
        const key: CreatedApiKey = {
          id: crypto.randomUUID(),
          name: label,
          prefix: secret.slice(0, 10),
          created_by: agent.created_by,
          created_at: new Date(now()).toISOString(),
          key: secret,
        };
        const { key: _secret, ...listed } = key;
        keys.unshift(listed);
        return key;
      }),
    deleteKey: ({ agent: name, key }) =>
      own(write, name, () => {
        const at = keys.findIndex((entry) => entry.id === key);
        if (at < 0) {
          throw new GitError("Key not found", 404);
        }
        keys.splice(at, 1);
      }),
    listTraces: ({ agent: name, limit, after, ...filters }) =>
      own(read, name, () => {
        const index = annotations();
        const rows = traces()
          .filter((trace) => passes([trace], rowsOf(index.ofTrace(trace.trace_id)), filters))
          .toSorted(newestFirst);
        const found = page(rows, (trace) => trace.trace_id, limit, after);
        return {
          traces: found.rows.map((trace) => listedOf(trace, index)),
          has_more: found.has_more,
          total: rows.length,
        };
      }),
    listSessions: ({ agent: name, limit, after, ...filters }) =>
      own(read, name, () => {
        const index = annotations();
        const sessions = [...sessionsOf(traces())]
          .map(([id, turns]) => ({ turns, summary: sessionSummary(id, turns, index) }))
          .filter(({ turns, summary }) => passes(turns, summary.annotations, filters))
          .map(({ summary }) => summary)
          .toSorted(
            (left, right) =>
              right.last_turn_at.localeCompare(left.last_turn_at) ||
              right.session_id.localeCompare(left.session_id),
          );
        const found = page(sessions, (summary) => summary.session_id, limit, after);
        return { sessions: found.rows, has_more: found.has_more, total: sessions.length };
      }),
    getSession: ({ agent: name, session, limit, after }) =>
      own(read, name, async () => {
        const index = annotations();
        const all = must(sessionsOf(traces()).get(session), "Session not found");
        const found = page(all, (trace) => trace.trace_id, limit ?? 10, after);
        const start = all.indexOf(found.rows[0] ?? all[0]!);
        const turns = await Promise.all(
          found.rows.map(async (trace, offset) =>
            turnOf(await full(trace.trace_id), start + offset + 1, index),
          ),
        );
        return { session: sessionSummary(session, all, index), turns, has_more: found.has_more };
      }),
    getTrace: ({ agent: name, trace }) => own(read, name, () => full(trace)),
    annotate: refuse,
    exportSpans: refuse,
    listAnnotations: ({ agent: name, trace }) =>
      own(read, name, () => ({ trace_id: trace, annotations: annotations().ofTrace(trace) })),
    listSessionAnnotations: ({ agent: name, session }) =>
      own(read, name, () => {
        const turns = sessionsOf(traces()).get(session) ?? [];
        return {
          session_id: session,
          annotations: annotations().ofSession(
            session,
            turns.map((trace) => trace.trace_id),
          ),
        };
      }),
    annotationCounts: ({ agent: name }) =>
      own(read, name, () => {
        const started = new Map(
          traces().map((trace) => [trace.trace_id, rootOf(trace).started_at]),
        );
        return annotationCounts(annotations().all, (id) => started.get(id));
      }),
  };
}
