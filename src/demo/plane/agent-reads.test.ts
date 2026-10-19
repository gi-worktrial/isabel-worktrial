import { expect, test } from "vitest";

import { getEvalsBranchById, RUN_EVALS_JOB } from "#src/sdk/index";
import { AGENT, ISSUE, tinyClient } from "#test/tiny-seed";

import { emptyLayer } from "./client.ts";

test("memory run lists filter by job, branch and status before array pagination", async () => {
  const { client, advance } = tinyClient();
  const own = await client.jobs.dispatch({
    agent: AGENT,
    job: RUN_EVALS_JOB,
    ref: getEvalsBranchById(ISSUE),
  });
  advance(1000);
  await client.jobs.dispatch({ agent: AGENT, job: "annotate-traces" });
  const page = (number: number) =>
    client.jobs.listRuns({ agent: AGENT, job: RUN_EVALS_JOB, per_page: 1, page: number });
  expect((await page(1)).map((run) => run.id)).toEqual([own.id]);
  const all = await client.jobs.listRuns({ agent: AGENT, job: RUN_EVALS_JOB });
  expect((await page(2)).map((run) => run.id)).toEqual(all.slice(1, 2).map((run) => run.id));
  expect(await page(all.length + 1)).toEqual([]);
  const onBranch = await client.jobs.listRuns({ agent: AGENT, branch: "issue/*/evals" });
  expect(onBranch.every((run) => run.ref === getEvalsBranchById(ISSUE))).toBe(true);
  const active = await client.jobs.listRuns({
    agent: AGENT,
    job: RUN_EVALS_JOB,
    status: "in_progress",
  });
  expect(active.map((run) => run.id)).toEqual([own.id]);
  await expect(client.jobs.listRuns({ agent: "another-agent" })).rejects.toMatchObject({
    status: 404,
  });
});

test("Pebble's threads are plain titled threads that survive a reload", async () => {
  const layer = emptyLayer();
  const { client } = tinyClient({ layer });
  const created = await client.pebble.threads.create({ title: "Refunds" });
  await client.pebble.threads.update(created.id, { title: "Refund limit" });
  const restored = tinyClient({ layer: structuredClone(layer) });
  expect((await restored.client.pebble.threads.list()).threads.map(({ title }) => title)).toEqual([
    "Refund limit",
  ]);
});

test("a rename moves a thread to the top, and get reads one thread", async () => {
  const { client, advance } = tinyClient();
  const first = await client.pebble.threads.create({ title: "Refunds" });
  advance(1000);
  await client.pebble.threads.create({ title: "Latency" });
  advance(1000);
  const renamed = await client.pebble.threads.update(first.id, { title: "Refund limit" });
  expect(renamed.updated_at > renamed.created_at).toBe(true);
  expect((await client.pebble.threads.list()).threads.map(({ title }) => title)).toEqual([
    "Refund limit",
    "Latency",
  ]);
  expect(await client.pebble.threads.get(first.id)).toEqual(renamed);
  await expect(client.pebble.threads.get("missing")).rejects.toMatchObject({ status: 404 });
});

test("an archived thread leaves the list, keeps its place, and still reads by id", async () => {
  const { client, advance } = tinyClient();
  const first = await client.pebble.threads.create({ title: "Refunds" });
  advance(1000);
  await client.pebble.threads.create({ title: "Latency" });
  advance(1000);
  const archived = await client.pebble.threads.update(first.id, { archived: true });
  expect(archived).toMatchObject({ archived: true, title: "Refunds" });
  expect(archived.updated_at).toBe(first.updated_at);
  expect((await client.pebble.threads.list()).threads.map(({ title }) => title)).toEqual([
    "Latency",
  ]);
  expect(await client.pebble.threads.get(first.id)).toEqual(archived);
  await expect(client.pebble.threads.update(first.id, {})).rejects.toThrow(
    "Expected title or archived",
  );
});

test("sandbox usage counts each unfinished run's reservation and each chat used lately", async () => {
  const { client, advance } = tinyClient();
  const before = await client.sandboxes.usage();
  const run = await client.jobs.dispatch({
    agent: AGENT,
    job: RUN_EVALS_JOB,
    ref: getEvalsBranchById(ISSUE),
  });
  await client.pebble.threads.create({ title: "Refunds" });
  const usage = await client.sandboxes.usage();
  expect(usage.used).toBeLessThanOrEqual(usage.limit);
  expect(usage.reservations.find((held) => held.run === run.id)?.sandboxes).toBeGreaterThan(1);
  expect(usage.sandboxes.filter(({ actor }) => actor === "cobblestone")).toHaveLength(1);
  expect(usage.used - before.used).toBe(
    (usage.reservations.find((held) => held.run === run.id)?.sandboxes ?? 0) + 1,
  );
  // a chat's sandbox pauses after a while, and stops counting
  advance(60 * 60_000);
  expect(
    (await client.sandboxes.usage()).sandboxes.filter(({ actor }) => actor === "cobblestone"),
  ).toEqual([]);
});
