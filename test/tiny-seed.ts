// the tiny scenario every unit test reads from demo-data's build: main with one detected Issue, its evals branch
// with one New Eval and a baseline run, one Candidate PR on it, two failing turns in two conversations and one team job
import { emptyLayer, type Layer, memoryClient, type Seed } from "#src/demo/plane/client";
import { TinyFixtureSchema } from "#src/demo/plane/seed/fixture";
import type { IssueChange } from "#src/sdk/index";

import tiny from "../../demo-data/public/scenarios/tiny/fixture.json" with { type: "json" };

const TINY = TinyFixtureSchema.parse(tiny);

export const START = Date.parse(TINY.facts.start);
export const AGENT = TINY.facts.agent;
export const ISSUE = TINY.facts.issue;
export const CANDIDATE = TINY.facts.candidate;
export const FAILING = TINY.facts.failing;

/** A fresh copy of the tiny seed, which a test may change. */
export const tinySeed = (): Seed => structuredClone(TINY.seed);

/** The tiny scenario's client on a clock the test moves, with the Issue's own calls bound. */
export function tinyClient({ seed, layer }: { seed?: Seed; layer?: Layer } = {}) {
  let clock = START;
  const client = memoryClient(seed ?? tinySeed(), layer ?? emptyLayer(), { now: () => clock });
  const at = { agent: AGENT, repo: AGENT, id: ISSUE };
  const get = () => client.issues.get(at);
  const update = async (change: IssueChange) => {
    const { head_oid } = await get();
    clock += 1000;
    await client.issues.update({ ...at, expectedHeadOid: head_oid, ...change });
  };
  const candidates = () => client.issues.listCandidates(at);
  // the seeded Candidate rerun on its test merge and its run finished
  const rerun = async () => {
    await client.issues.rerunCandidate({ ...at, candidate: CANDIDATE });
    clock += 60_000;
    return (await candidates()).find((candidate) => candidate.id === CANDIDATE);
  };
  return { client, at, get, update, candidates, rerun, advance: (ms: number) => (clock += ms) };
}
