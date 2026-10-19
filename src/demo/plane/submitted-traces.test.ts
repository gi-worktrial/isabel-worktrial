import { assert, expect, test } from "vitest";

import { AGENT, tinyClient } from "#test/tiny-seed";

import { emptyLayer } from "./client.ts";

// the rerun Candidate's trials, each a session of its own Trace
async function trialsOf(client: ReturnType<typeof tinyClient>["client"], run: string) {
  const { results } = await client.evals.getRun({ agent: AGENT, run });
  return results.flatMap((result) => result.trials);
}

test("a replayed trial is its own session, unchanged after reload", async () => {
  const layer = emptyLayer();
  const { client, rerun } = tinyClient({ layer });
  const run = (await rerun())?.results?.run.id;
  assert(run !== undefined);
  const [trial] = await trialsOf(client, run);
  assert(trial !== undefined, "The completed run has a trial");
  const trace = await client.agents.getTrace({ agent: AGENT, trace: trial.trace_id });
  const session = await client.agents.getSession({ agent: AGENT, session: trial.session_id });
  expect(session.turns.map((turn) => turn.trace_id)).toEqual([trace.trace_id]);
  const reloaded = tinyClient({ layer });
  reloaded.advance(60_000);
  expect(await trialsOf(reloaded.client, run)).toEqual(await trialsOf(client, run));
  expect(await reloaded.client.agents.getTrace({ agent: AGENT, trace: trial.trace_id })).toEqual(
    trace,
  );
});

test("repeated runs replay the same recording as different trials", async () => {
  const { client, rerun } = tinyClient();
  const first = (await rerun())?.results?.run.id;
  const second = (await rerun())?.results?.run.id;
  assert(first !== undefined && second !== undefined && first !== second);
  const [a, b] = await Promise.all([trialsOf(client, first), trialsOf(client, second)]);
  expect(a[0]?.trace_id).not.toBe(b[0]?.trace_id);
  const spans = await Promise.all(
    [a[0], b[0]].map(
      async (trial) =>
        (await client.agents.getTrace({ agent: AGENT, trace: trial?.trace_id ?? "" })).spans,
    ),
  );
  expect(spans[0]?.map((span) => span.name)).toEqual(spans[1]?.map((span) => span.name));
});
