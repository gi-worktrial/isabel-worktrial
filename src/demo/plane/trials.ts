// run-evals' trials as the agents service holds them: one session per trial, graded by grounded/grade annotations
import type { Evaluation } from "#src/sdk/genai";
import type { Annotation, Trace } from "#src/sdk/index";

import { CRITERIA_FILE, passes, readTaskCriteria, TASKS } from "./registry.ts";
import { isoNanos, nanosIso } from "./seed/otlp.ts";
import {
  annotation,
  CONVERSATION_ATTRIBUTE,
  RUN_ATTRIBUTE,
  rootOf,
  TASK_ATTRIBUTE,
  TRIAL_ATTRIBUTE,
} from "./traces.ts";

/** A trial a run played: its task, the recorded trace it replays, and when it ran. */
export type TrialRow = {
  trial: string;
  task: string;
  /** The recorded trial trace this one replays, null when the revision has no recording. */
  recorded: string | null;
  started_at: string;
  finished_at: string;
  cost_usd: number | null;
};

/** Four FNV-1a passes over `text`, one per seed, as a stable 128-bit hex ID. */
export function stableHex(text: string, seeds: readonly number[]): string {
  return seeds
    .map((seed) => {
      let hash = seed;
      for (const char of text) {
        hash = Math.imul(hash ^ char.codePointAt(0)!, 0x01000193) >>> 0;
      }
      return hash.toString(16).padStart(8, "0");
    })
    .join("");
}

/** A played trial's trace ID, stable for its run and task. */
export const trialTraceId = (run: string, task: string) =>
  stableHex(`${run}/${task}`, [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b]);

/** A recorded trace relabeled as the run's own trial, keeping every span. */
export function asTrial(recorded: Trace, traceId: string, run: string, row: TrialRow): Trace {
  const root = rootOf(recorded);
  // shifted in nanoseconds, so spans a nanosecond apart keep their order
  const shift = isoNanos(row.started_at) - isoNanos(root.started_at);
  const at = (time: string) => nanosIso(isoNanos(time) + shift);
  return {
    trace_id: traceId,
    spans: recorded.spans.map((span) => ({
      ...span,
      started_at: at(span.started_at),
      events: span.events.map((event) => ({ ...event, timestamp: at(event.timestamp) })),
      attributes:
        span.parent_span_id === ""
          ? {
              ...span.attributes,
              [CONVERSATION_ATTRIBUTE]: row.trial,
              [RUN_ATTRIBUTE]: run,
              [TRIAL_ATTRIBUTE]: row.trial,
              [TASK_ATTRIBUTE]: row.task,
            }
          : span.attributes,
    })),
  };
}

/**
 * The Grades run-evals records on a trial, as the evaluations it exports: `grounded/grade/reward` for the whole trial,
 * valued 1 or 0, then one `grounded/grade/reward/<criterion>` per Criterion, labeled pass or fail by its pass mark. The
 * collector stamps when and from which run, and the session is the trial's own, so neither is written here.
 */
export function gradeEvaluations({
  traceId,
  spanId,
  details,
  criteriaText,
}: {
  traceId: string;
  spanId: string;
  details: GradeDetails | undefined;
  criteriaText: string | undefined;
}): Evaluation[] {
  if (details === undefined) {
    return [];
  }
  const target = { kind: "trace" as const, trace: traceId, span: spanId };
  // platform's Harbor export labels only yes-or-no criteria, but its Evals read a trial as passed only from labels, so
  // the demo labels every criterion against its pass mark (a gap listed for Connor); the reward keeps platform's bare
  // value, so a trial's Grades tally counts its Criteria
  const rows = readTaskCriteria(criteriaText).flatMap((criterion) => {
    const graded = details[criterion.name];
    if (graded === undefined) {
      return [];
    }
    return [
      {
        target,
        name: `grounded/grade/${criterion.grade}`,
        value: graded.value,
        label: passes(criterion, graded.value) ? "pass" : "fail",
        ...(graded.reasoning === null ? {} : { explanation: graded.reasoning }),
        description: criterion.name,
        ...(graded.raw === null ? {} : { raw: graded.raw }),
      },
    ];
  });
  const passedAll = rows.length > 0 && rows.every((row) => row.label === "pass");
  return [
    {
      target,
      name: "grounded/grade/reward",
      value: passedAll ? 1 : 0,
    },
    ...rows,
  ];
}

/** A Criterion's grade on one recorded trial: its score, the grader's own score and its reasoning. */
export type GradeDetails = Record<
  string,
  { value: number; raw: string | null; description: string; reasoning: string | null }
>;

/** An evaluation as the agents service stores it, stamped with the run that wrote it and when. */
export function evaluationAnnotation(
  { target, name, value, label, explanation, description, raw }: Evaluation,
  {
    session,
    kind = "code",
    job,
    commit,
    at,
  }: {
    session: string;
    kind?: "code" | "llm" | undefined;
    job: string;
    commit: string;
    at: string;
  },
): Annotation {
  return annotation({
    trace_id: target.kind === "trace" ? target.trace : "",
    span_id: target.kind === "trace" ? (target.span ?? "") : "",
    session_id: target.kind === "session" ? target.session : session,
    name,
    value: value ?? null,
    label: label ?? "",
    explanation: explanation ?? "",
    description: description ?? "",
    raw: raw ?? "",
    source: { kind, id: job, commit },
    annotated_at: at,
  });
}

export const criteriaPath = (task: string) => `${TASKS}/${task}/${CRITERIA_FILE}`;
