import type { PebbleRecord } from "#src/pebble/wire";

/** A Trace's short label, as chips and Pebble's context name it. */
export const traceLabel = (trace: string) => trace.slice(0, 8);

/** A record's name on a chip: the Issue's id, else the record's kind and id. */
export function recordName(ref: PebbleRecord) {
  switch (ref.record) {
    case "issue":
      return ref.issue;
    case "candidate":
      return `Candidate ${ref.candidate}`;
    case "eval":
      return `Eval ${ref.eval}`;
    case "trace":
      return `Trace ${traceLabel(ref.trace)}`;
  }
}

/** The route a record Pebble names opens at, under the Agent in view. */
export function recordRoute(orgId: string, agent: string, ref: PebbleRecord) {
  switch (ref.record) {
    case "issue":
      return {
        to: "/$orgId/agents/$agent/issues/$issue",
        params: { orgId, agent, issue: ref.issue },
      } as const;
    case "candidate":
      return {
        to: "/$orgId/agents/$agent/issues/$issue/candidates/$candidate",
        params: { orgId, agent, issue: ref.issue, candidate: ref.candidate },
      } as const;
    case "eval":
      return {
        to: "/$orgId/agents/$agent/evals/$eval",
        params: { orgId, agent, eval: ref.eval },
      } as const;
    case "trace":
      return {
        to: "/$orgId/agents/$agent/traces/$session/$trace",
        params: { orgId, agent, session: ref.session, trace: ref.trace },
      } as const;
  }
}
