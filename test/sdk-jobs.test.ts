import { afterEach, expect, test, vi } from "vitest";

import { Api } from "#src/sdk/api";
import { Jobs, type Job, type JobRun } from "#src/sdk/jobs";
import { jobRun } from "#test/job-run";

function jobs(response: (url: URL, init: RequestInit) => Response) {
  const fetch = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async (url, init) =>
    response(new URL(url), init),
  );
  vi.stubGlobal("fetch", fetch);
  return {
    resource: new Jobs(new Api({ type: "network", baseUrl: "http://test.local" })),
    fetch,
  };
}

afterEach(() => vi.unstubAllGlobals());

test("job definitions retain active inputs and permissions alongside invalid manifests", async () => {
  const definitions: Job[] = [
    {
      name: "run-evals",
      state: "active",
      display_name: "Run Evals",
      on: { workflow_dispatch: {} },
      inputs: { tasks: { type: "array", required: false, default: ["t1"] } },
      permissions: { agent: "read", repo: "read" },
      concurrency: { "group": "evals", "cancel-in-progress": true },
      timeout_minutes: 60,
      concurrent_sandboxes: 6,
      vcpus: 2,
      mem_mib: 4096,
      model: "model",
      steps: [
        { name: "Run Evals", run: "harbor run", exclude_from_context: false },
        { name: "Review the failures", prompt_file: "jobs/run-evals/review.md" },
      ],
    },
    { name: "broken", state: "invalid", error: "Invalid job.toml" },
  ];
  const { resource, fetch } = jobs(() => Response.json({ jobs: definitions }));

  expect(await resource.list({ agent: "acme" })).toEqual(definitions);
  expect(fetch.mock.calls.map(([url]) => url)).toEqual(["http://test.local/agents/acme/jobs"]);
});

test("dispatch queues an Agent run and sends only its ref and typed inputs", async () => {
  const run = jobRun({ status: "queued", conclusion: null, phase: "queued", exit_code: null });
  const { resource, fetch } = jobs(() => Response.json(run));
  const inputs = { tasks: ["t1", "t2"], retries: 2, verbose: true, note: "Review" };

  expect(await resource.dispatch({ agent: "acme", job: "run-evals", ref: "main", inputs })).toEqual(
    run,
  );
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0]?.[0]).toBe("http://test.local/agents/acme/jobs/run-evals/dispatches");
  expect(fetch.mock.calls[0]?.[1]).toMatchObject({
    method: "POST",
    body: JSON.stringify({ ref: "main", inputs }),
  });
});

test.each<Partial<JobRun>>([
  { status: "queued", conclusion: null, phase: "queued", exit_code: null },
  { status: "in_progress", conclusion: null, phase: "running", exit_code: null },
  { status: "completed", conclusion: "failure", phase: "done", exit_code: 1 },
])("reading a $status run preserves the full lifecycle record", async (lifecycle) => {
  const run = jobRun(lifecycle);
  const { resource, fetch } = jobs(() => Response.json(run));

  expect(await resource.getRun({ agent: run.agent, run: run.id })).toEqual(run);
  expect(fetch.mock.calls.map(([url]) => url)).toEqual([
    `http://test.local/agents/acme/runs/${run.id}`,
  ]);
});

test("run lists return arrays and send numbered pagination and status filters", async () => {
  const run = jobRun();
  const { resource, fetch } = jobs(() => Response.json({ runs: [run] }));

  expect(
    await resource.listRuns({
      agent: "acme",
      job: "run-evals",
      status: "completed",
      page: 2,
      per_page: 100,
    }),
  ).toEqual([run]);
  expect(fetch.mock.calls.map(([url]) => url)).toEqual([
    "http://test.local/agents/acme/runs?job=run-evals&status=completed&page=2&per_page=100",
  ]);
});

test("artifacts retain raw bytes and nested paths when fetched or downloaded together", async () => {
  const target = { agent: "acme", run: jobRun().id };
  const binaryPath = "out dir/bytes #1.bin";
  const binary = new Uint8Array([0, 255, 128, 10]);
  const summary = new TextEncoder().encode('[{"task":"evals/tasks/t1"}]');
  const contents = new Map([
    [binaryPath, binary],
    ["summary.json", summary],
  ]);
  const artifacts = [...contents].map(([path, bytes]) => ({ path, size: bytes.byteLength }));
  const base = `/agents/acme/runs/${target.run}/artifacts`;
  const { resource, fetch } = jobs(({ pathname }) => {
    if (pathname === base) {
      return Response.json({ artifacts });
    }
    const bytes = contents.get(decodeURIComponent(pathname.slice(base.length + 1)));
    return bytes === undefined
      ? Response.json({ message: "Missing artifact" }, { status: 404 })
      : new Response(bytes);
  });

  expect(await resource.listArtifacts(target)).toEqual(artifacts);
  const downloaded = await resource.getArtifact({ ...target, path: binaryPath });
  expect(downloaded).toBeInstanceOf(Uint8Array);
  expect(downloaded).toEqual(binary);
  expect(fetch.mock.calls[1]?.[0]).toBe(`http://test.local${base}/out%20dir/bytes%20%231.bin`);
  expect(await resource.downloadArtifacts(target)).toEqual(contents);
  await expect(resource.getArtifact({ ...target, path: "missing" })).rejects.toMatchObject({
    status: 404,
    message: "Missing artifact",
  });
});

test("logs read one step's output from a byte offset", async () => {
  const run = jobRun();
  const { resource, fetch } = jobs(() => new Response("ran"));

  expect(
    new TextDecoder().decode(
      await resource.logs({ agent: run.agent, run: run.id }, 1, { offset: 4 }),
    ),
  ).toBe("ran");
  expect(fetch.mock.calls.map(([url]) => url)).toEqual([
    `http://test.local/agents/acme/runs/${run.id}/steps/1/logs?offset=4`,
  ]);
});
