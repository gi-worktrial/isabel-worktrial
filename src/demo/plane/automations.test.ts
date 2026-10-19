import { assert, expect, it } from "vitest";

import { RUN_EVALS_JOB } from "#src/sdk/index";
import { AGENT, START, tinySeed } from "#test/tiny-seed";

import { liveRuns } from "./automations.ts";
import { emptyLayer, memoryClient } from "./client.ts";
import { rebased } from "./clock.ts";

const job = "annotate-traces";
const path = `jobs/${job}/job.toml`;

// Trace annotation recorded at main's head, which Run now replays while its code matches
async function fixture(
  recording = {
    duration_ms: 1200,
    logs: ["1 of 4 Traces failed a Criterion", "0:00 Listed 4 new Traces", "0:01 Graded 4 Traces"],
  },
) {
  let clock = START;
  const seed = tinySeed();
  const client = memoryClient(seed, emptyLayer(), { now: () => clock });
  const [head] = await client.repos.listCommits({ repo: AGENT, per_page: 1 });
  assert(head !== undefined);
  const commit = head.sha;
  seed.jobs[job] = { source_commit: commit, ...recording, result: { traces: 4, failed: 1 } };
  const read = async (file: string) => {
    const content = await client.repos.getContent({ repo: AGENT, path: file });
    return "content" in content
      ? new TextDecoder().decode(Uint8Array.from(atob(content.content), (c) => c.charCodeAt(0)))
      : "";
  };
  // a change to main's files, as the Automations page saves one
  const save = async (files: Record<string, string>) => {
    const [tip] = await client.repos.listCommits({ repo: AGENT, per_page: 1 });
    const result = await client.repos.createCommitOnBranch({
      repo: AGENT,
      branch: "main",
      expectedHeadOid: tip?.sha ?? "",
      message: { headline: `Edit ${job}` },
      fileChanges: {
        additions: Object.entries(files).map(([file, text]) => ({
          path: file,
          contents: btoa(text),
        })),
      },
    });
    return result.commit.oid;
  };
  // the run with its last step's log lines, newest summary first as the recording keeps them
  const runOf = async (run: string) => {
    const target = { agent: AGENT, run };
    const got = await client.jobs.getRun(target);
    const last = got.steps.length - 1;
    const text = last < 1 ? "" : new TextDecoder().decode(await client.jobs.logs(target, last));
    return { ...got, logs: text === "" ? [] : text.split("\n") };
  };
  return { client, commit, read, save, runOf, advance: (ms: number) => (clock += ms) };
}

it("a manual run pins its revision, reports progress, and keeps its result after edits", async () => {
  const { client, commit, read, save, runOf, advance } = await fixture();
  const run = await client.jobs.dispatch({ agent: AGENT, job, ref: commit });
  expect(run).toMatchObject({ sha: commit, status: "queued", trigger: "workflow_dispatch" });
  advance(600);
  expect(await runOf(run.id)).toMatchObject({
    status: "in_progress",
    error: null,
    logs: ["0:00 Listed 4 new Traces", "0:00 Grading Traces, 0 of 4"],
  });
  advance(600);
  const completed = await runOf(run.id);
  expect(completed).toMatchObject({
    status: "completed",
    conclusion: "success",
    exit_code: 0,
    error: null,
    logs: ["1 of 4 Traces failed a Criterion", "0:00 Listed 4 new Traces", "0:01 Graded 4 Traces"],
  });
  // what it changed is the recording's result.json
  const result = await client.jobs.getArtifact({ agent: AGENT, run: run.id, path: "result.json" });
  expect(JSON.parse(new TextDecoder().decode(result))).toEqual({ traces: 4, failed: 1 });
  // a new schedule is no new code, so it still replays
  const saved = await save({ [path]: (await read(path)).replace("0 2 * * *", "0 3 * * *") });
  const scheduled = await client.jobs.dispatch({ agent: AGENT, job, ref: saved });
  advance(1200);
  expect(await client.jobs.getRun({ agent: AGENT, run: scheduled.id })).toMatchObject({
    sha: saved,
    status: "completed",
    conclusion: "success",
  });
  expect(await runOf(run.id)).toEqual(completed);
});

// the recorded job.toml's executable part, with `edit` applied
const manifest = (edit: string) =>
  `name = "Trace annotation"\n\n[permissions]\nagent = "read"\ntrace = "write"\n\n[concurrency]\ngroup = "annotate-traces"\ncancel-in-progress = true\n\n[on.workflow_dispatch]\n\n[[on.schedule]]\ncron = "0 2 * * *"\n\n${edit}\n`;
it.each([
  { [path]: manifest('[[steps]]\nname = "Grade"\nrun = "grade --all"') },
  { [`jobs/${job}/helper.py`]: "print('unrecorded')\n" },
  {
    [path]: manifest('[[steps]]\nname = "Grade"\nrun = "grade"').replace(
      'trace = "write"',
      'trace = "write"\nrepo = "write"',
    ),
  },
])("edited steps, helpers or executable config cannot replay success (%j)", async (change) => {
  const { client, save, runOf, advance } = await fixture();
  const run = await client.jobs.dispatch({ agent: AGENT, job, ref: await save(change) });
  advance(1500);
  const missing = "No recorded result for this Automation's edited code";
  expect(await runOf(run.id)).toMatchObject({
    status: "completed",
    conclusion: "failure",
    logs: [missing],
    error: missing,
  });
  await expect(client.jobs.dispatch({ agent: "other", job, ref: "main" })).rejects.toMatchObject({
    status: 404,
  });
});

it("a new run cancels the older one in its job.toml concurrency group", async () => {
  const { client, commit, advance } = await fixture();
  const first = await client.jobs.dispatch({ agent: AGENT, job, ref: commit });
  advance(100);
  const second = await client.jobs.dispatch({ agent: AGENT, job, ref: "main" });
  const status = async (run: string) =>
    (await client.jobs.getRun({ agent: AGENT, run })).conclusion;
  expect(await status(first.id)).toBe("cancelled");
  // run-evals groups by trigger and ref, so another ref's run keeps going
  const evals = await client.jobs.dispatch({ agent: AGENT, job: RUN_EVALS_JOB, ref: "main" });
  const other = await client.jobs.dispatch({
    agent: AGENT,
    job: RUN_EVALS_JOB,
    ref: "issue/GRD-1/evals",
  });
  expect([await status(second.id), await status(evals.id), await status(other.id)]).not.toContain(
    "cancelled",
  );
});

it("a step that checks Issues counts as it goes, as grading does", async () => {
  const { client, commit, runOf, advance } = await fixture({
    duration_ms: 10_000,
    logs: ["No matches", "0:09 Checked 9 Issues, none matched a new Trace"],
  });
  const run = await client.jobs.dispatch({ agent: AGENT, job, ref: commit });
  advance(500 + 3000);
  expect(await runOf(run.id)).toMatchObject({
    status: "in_progress",
    logs: ["0:03 Checking Issues, 3 of 9"],
  });
});

it("a live run keeps the real pace of what it already ran and stretches only what is left", () => {
  const opened = START;
  const [live] = liveRuns(
    {
      [job]: {
        source_commit: "recorded",
        duration_ms: 100_000,
        logs: ["Done", "0:10 Listed 4 new Traces", "1:00 Graded 4 Traces"],
        result: {},
        live: { id: "live", trigger: "schedule", created_by: "jobs", elapsed_ms: 20_000 },
      },
    },
    AGENT,
    () => "main",
    opened,
  );
  // the 80 seconds left stretch over half an hour, 22.5 times
  expect(live?.created_ms).toBe(opened - 20_000);
  expect(live?.recipe).toMatchObject({
    duration_ms: 20_000 + 80_000 * 22.5,
    logs: ["Done", "0:10 Listed 4 new Traces", "15:20 Graded 4 Traces"],
  });
});

it("the demo clock puts last night's loop on the last night and drops scheduled runs not due yet", async () => {
  const seed = tinySeed();
  const [recorded] = seed.runs;
  assert(recorded !== undefined, "Fixture needs a recorded run");
  // Sep 29 PDT, the loop at 02:00, a 6-hourly spot check, the 09:00 digest and a 09:01 suggestion
  const run = (name: string, at: string) => ({
    ...recorded,
    id: `${name}-${at}`,
    job: name,
    created_at: `2026-09-29T${at}:00Z`,
    started_at: `2026-09-29T${at}:01Z`,
    completed_at: `2026-09-29T${at}:30Z`,
  });
  seed.runs = [
    run("annotate-traces", "09:00"),
    run("grounded/match-issues", "09:05"),
    run("mine-issues", "09:10"),
    ...["01:00", "07:00", "13:00"].map((at) => run("spot-check", at)),
    run("slack-digest", "16:00"),
  ];
  seed.pulls = seed.pulls.map((pull) => ({ ...pull, updated_at: "2026-09-29T16:01:00Z" }));
  // Oct 02 05:20 PT
  const now = Date.parse("2026-10-02T12:20:00Z");
  const { seed: moved, at } = rebased(seed, now);
  const times = (name: string) =>
    moved.runs.filter((entry) => entry.job === name).map((entry) => entry.created_at);
  expect(times("annotate-traces")).toEqual(["2026-10-02T09:00:00Z"]);
  // Oct 01 18:00 and Oct 02 00:00 PT, with the 06:00 spot check and 09:00 digest not yet due
  expect(times("spot-check")).toEqual(["2026-10-02T01:00:00Z", "2026-10-02T07:00:00Z"]);
  expect(times("slack-digest")).toEqual([]);
  // what the seed did after the loop lands between the loop and now, in order
  const after = [
    ...moved.pulls.map((pull) => pull.updated_at),
    ...moved.traces.flatMap((trace) => trace.spans.map((span) => span.started_at)),
    ...Object.values(seed.repo.commits).map((commit) => at(commit.committer.date)),
  ].map(Date.parse);
  expect(Math.max(...after)).toBeLessThanOrEqual(now);
  expect(Math.min(...after)).toBeGreaterThan(Date.parse("2026-10-02T09:10:00Z"));
});

it("the demo clock spreads the day after the loop up to an evening now and keeps hourly runs to the hour before it", () => {
  const seed = tinySeed();
  const [recorded] = seed.runs;
  assert(recorded !== undefined, "Fixture needs a recorded run");
  const run = (name: string, at: string) => ({
    ...recorded,
    id: `${name}-${at}`,
    job: name,
    trigger: "schedule" as const,
    created_at: `2026-09-29T${at}:00Z`,
    started_at: `2026-09-29T${at}:01Z`,
    completed_at: `2026-09-29T${at}:04Z`,
  });
  // the loop at 02:10 PDT, then hourly roll-repos runs until 09:00 PDT
  seed.runs = [
    run("mine-issues", "09:10"),
    ...["08:00", "12:00", "16:00"].map((at) => run("grounded/roll-repos", at)),
  ];
  seed.pulls = seed.pulls.map((pull) => ({ ...pull, updated_at: "2026-09-29T16:01:00Z" }));
  // Oct 02 20:47 PT
  const now = Date.parse("2026-10-03T03:47:00Z");
  const { seed: moved, at } = rebased(seed, now);
  const times = (name: string) =>
    moved.runs.filter((entry) => entry.job === name).map((entry) => entry.created_at);
  expect(times("mine-issues")).toEqual(["2026-10-02T09:10:00Z"]);
  expect(times("grounded/roll-repos")).toEqual([
    "2026-10-02T19:00:00Z",
    "2026-10-02T23:00:00Z",
    "2026-10-03T03:00:00Z",
  ]);
  // the newest pull sits at the last whole 10 minutes, not at 09:01 PT
  expect(moved.pulls.map((pull) => pull.updated_at)).toContain("2026-10-03T03:40:00Z");
  const after = [
    ...moved.pulls.map((pull) => pull.updated_at),
    ...moved.traces.flatMap((trace) => trace.spans.map((span) => span.started_at)),
    ...Object.values(seed.repo.commits).map((commit) => at(commit.committer.date)),
  ].map(Date.parse);
  expect(Math.max(...after)).toBeLessThanOrEqual(now);
});

it("Jobs exposes parsed definitions, scoped raw artifacts and queued dispatch deduplication", async () => {
  const { client, commit, advance } = await fixture();
  const definition = await client.jobs.get({ agent: AGENT, job });
  expect(definition).toMatchObject({
    name: job,
    state: "active",
    display_name: "Trace annotation",
    timeout_minutes: 60,
    concurrent_sandboxes: 0,
  });
  expect(await client.jobs.list({ agent: AGENT })).toContainEqual(definition);
  const first = await client.jobs.dispatch({ agent: AGENT, job, ref: commit });
  const repeated = await client.jobs.dispatch({ agent: AGENT, job, ref: commit });
  expect(repeated).toEqual(first);
  expect(first).toMatchObject({
    agent: AGENT,
    sha: commit,
    definition_commit: commit,
    priority: 2,
  });
  advance(1200);
  const artifacts = await client.jobs.downloadArtifacts({ agent: AGENT, run: first.id });
  const bytes = artifacts.get("result.json");
  assert(bytes !== undefined, "The recorded run has a result artifact");
  expect(bytes).toBeInstanceOf(Uint8Array);
  expect(new TextDecoder().decode(bytes)).toBe(JSON.stringify({ traces: 4, failed: 1 }));
  expect(await client.jobs.listArtifacts({ agent: AGENT, run: first.id })).toContainEqual({
    path: "result.json",
    size: bytes.byteLength,
  });
  await expect(client.jobs.getRun({ agent: "other", run: first.id })).rejects.toMatchObject({
    status: 404,
  });
  await expect(
    client.jobs.getArtifact({ agent: "other", run: first.id, path: "result.json" }),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    client.jobs.downloadArtifacts({ agent: "other", run: first.id }),
  ).rejects.toMatchObject({ status: 404 });
  await expect(client.jobs.cancelRun({ agent: AGENT, run: first.id })).rejects.toMatchObject({
    status: 409,
  });
});

it("Jobs returns invalid definitions with the parse error and refuses to dispatch them", async () => {
  const { client, save } = await fixture();
  await save({ [path]: "name = [" });
  const invalid = await client.jobs.get({ agent: AGENT, job });
  expect(invalid).toMatchObject({ name: job, state: "invalid", error: expect.any(String) });
  expect(await client.jobs.list({ agent: AGENT })).toContainEqual(invalid);
  await expect(client.jobs.dispatch({ agent: AGENT, job })).rejects.toMatchObject({ status: 422 });
});

it("manual dispatch requires workflow_dispatch when a native trigger table is present", async () => {
  const { client, read, save } = await fixture();
  await save({ [path]: (await read(path)).replace("[on.workflow_dispatch]\n", "") });
  expect(await client.jobs.get({ agent: AGENT, job })).toMatchObject({
    state: "active",
    on: { schedule: [{ cron: "0 2 * * *" }] },
  });
  await expect(client.jobs.dispatch({ agent: AGENT, job })).rejects.toMatchObject({
    status: 422,
    message: expect.stringContaining("workflow_dispatch"),
  });
});

it("cancelling a running job returns the request before replay concludes it", async () => {
  const { client, advance } = await fixture();
  const run = await client.jobs.dispatch({ agent: AGENT, job });
  advance(600);
  const requested = await client.jobs.cancelRun({ agent: AGENT, run: run.id });
  expect(requested).toMatchObject({
    status: "in_progress",
    conclusion: null,
    cancel_requested_at: expect.any(String),
  });
  advance(1);
  expect(await client.jobs.getRun({ agent: AGENT, run: run.id })).toMatchObject({
    status: "completed",
    conclusion: "cancelled",
    cancel_requested_at: requested.cancel_requested_at,
  });
});

it("runs filter by branch glob and report steps whose logs read from a byte offset, as platform's jobs API does", async () => {
  const { client, advance } = await fixture();
  const run = await client.jobs.dispatch({ agent: AGENT, job, ref: "main" });
  expect(run.steps.map(({ name, status }) => [name, status])).toEqual([
    ["Set up job", "queued"],
    ["Grade", "queued"],
  ]);
  const target = { agent: AGENT, run: run.id };
  advance(600);
  expect((await client.jobs.getRun(target)).steps.map((step) => step.status)).toEqual([
    "completed",
    "in_progress",
  ]);
  advance(600);
  expect((await client.jobs.getRun(target)).steps.map((step) => step.conclusion)).toEqual([
    "success",
    "success",
  ]);
  const listed = await client.jobs.listRuns({ agent: AGENT, job, branch: "main" });
  expect(listed.map((entry) => entry.id)).toContain(run.id);
  expect(await client.jobs.listRuns({ agent: AGENT, job, branch: "issue/**" })).toEqual([]);
  expect(await client.jobs.logs(target, 0)).toHaveLength(0);
  const log = new TextDecoder().decode(await client.jobs.logs(target, 1));
  const head = new TextEncoder().encode(log.split("\n")[0] ?? "").byteLength;
  const rest = await client.jobs.logs(target, 1, { offset: head });
  expect(new TextDecoder().decode(rest)).toBe(log.slice(log.indexOf("\n")));
  await expect(client.jobs.logs(target, 2)).rejects.toThrow("No step 2");
});
