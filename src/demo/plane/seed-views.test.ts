import { afterEach, assert, describe, expect, it, vi } from "vitest";

import { canShip } from "#src/sdk/index";
import { AGENTS, scenarioFetch } from "#test/scenarios";

import { emptyLayer, memoryClient } from "./client.ts";
import { scenarioFiles } from "./load.ts";

afterEach(() => vi.unstubAllGlobals());

async function opened(agent: string, now?: () => number) {
  vi.stubGlobal("fetch", scenarioFetch);
  const { seed } = await scenarioFiles(agent, "org-one");
  const client = memoryClient(seed, emptyLayer(), { now });
  return { client, at: { agent: seed.agent, repo: seed.agent } };
}

describe.each(AGENTS.map(({ agentId }) => agentId))("the %s seed", (agent) => {
  it("reads every Issue through platform's library, each Candidate with a finished run", async () => {
    const { client, at } = await opened(agent);
    const listed = await client.issues.list(at);
    expect(new Set(listed.map((issue) => issue.state))).toEqual(
      new Set(["detected", "reviewing", "resolved", "dismissed"]),
    );
    expect(listed.some((issue) => issue.status === "resurfaced")).toBe(true);
    for (const { id } of listed) {
      const issue = await client.issues.get({ ...at, id });
      expect(issue.body, id).not.toBe("");
      for (const candidate of await client.issues.listCandidates({ ...at, id })) {
        expect(candidate.results?.run.conclusion, `${id} ${candidate.id}`).toBe("success");
      }
    }
    const statuses = await client.evals.listStatuses(at);
    expect(statuses.run?.status).toBe("completed");
    expect(statuses.evals.every((status) => status.passed !== undefined)).toBe(true);
  });
});

describe("the first seed in use", () => {
  it("ships the approved Issue, which puts another open Issue's evals branch behind main until Sync", async () => {
    const clock = Date.parse("2026-10-01T00:00:00Z");
    const { client, at } = await opened(AGENTS[0]?.agentId ?? "", () => clock);
    const listed = await client.issues.list(at);
    const issues = await Promise.all(listed.map(({ id }) => client.issues.get({ ...at, id })));
    const ready = issues.find(canShip);
    assert(ready !== undefined, "The seed has an approved Issue to ship");
    await client.issues.update({
      ...at,
      id: ready.id,
      expectedHeadOid: ready.head_oid,
      action: "ship",
    });
    expect(await client.issues.get({ ...at, id: ready.id })).toMatchObject({ state: "resolved" });
    const reviewing = issues.filter(
      (issue) => issue.id !== ready.id && issue.state === "reviewing",
    );
    const withCandidates = await Promise.all(
      reviewing.map(async (issue) => ({
        issue,
        candidates: await client.issues.listCandidates({ ...at, id: issue.id }),
      })),
    );
    const open = withCandidates.find(({ candidates }) => candidates.length > 0);
    assert(open !== undefined, "The seed has another reviewing Issue with a Candidate");
    const {
      issue: other,
      candidates: [candidate],
    } = open;
    assert(candidate !== undefined);
    const read = () => client.issues.getCandidate({ ...at, id: other.id, candidate: candidate.id });
    expect((await read())?.evals_behind).toBe(true);
    await client.issues.syncEvals({ ...at, id: other.id });
    expect((await read())?.evals_behind).toBe(false);
  });
});
