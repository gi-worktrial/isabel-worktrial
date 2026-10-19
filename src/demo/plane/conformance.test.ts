import { assert, describe, expect, it } from "vitest";

import { getCandidateBranchById, getEvalsBranchById, type Span } from "#src/sdk/index";
import { AGENT, CANDIDATE, FAILING, ISSUE, START, tinyClient } from "#test/tiny-seed";

import { emptyObjects, gitDate, hashObject, MemoryGit } from "./git.ts";
import { sessionsOf } from "./traces.ts";

const EVALS = getEvalsBranchById(ISSUE);
const CANDIDATE_BRANCH = getCandidateBranchById(ISSUE, CANDIDATE);

describe("platform's Issues over the memory client", () => {
  it("reads the detected Issue, its matched Traces and its Candidate", async () => {
    const { client, at, get, candidates } = tinyClient();
    const issue = await get();
    expect(issue).toMatchObject({ id: ISSUE, state: "detected", severity: "high", trace_count: 2 });
    expect(issue.body).toContain("The Agent refunds past the limit.");
    const { traces } = await client.issues.listTraces(at);
    expect(traces.map((trace) => trace.trace_id).toSorted()).toEqual([...FAILING].toSorted());
    const [candidate] = await candidates();
    expect(candidate).toMatchObject({
      id: CANDIDATE,
      title: "Cap refunds at the limit",
      results: undefined,
    });
    expect(candidate?.body).toContain("<ApplyPrompt>");
  });

  it("commits each action with platform's subject and trailers, and Activity reads them back", async () => {
    const { client, at, get, update } = tinyClient();
    await update({ action: "validate" });
    await update({ action: "dismiss", reason: "Refunds are capped upstream" });
    expect(await get()).toMatchObject({
      state: "dismissed",
      dismissal_reason: "Refunds are capped upstream",
    });
    await update({ action: "reopen" });
    expect(await get()).toMatchObject({ state: "reviewing", dismissal_reason: undefined });
    const events = await client.issues.listEvents(at);
    expect(events.map((event) => [event.subject, event.state])).toEqual([
      [`Reopen issue ${ISSUE}`, "reviewing"],
      [`Dismiss issue ${ISSUE}`, "dismissed"],
      [`Validate issue ${ISSUE}`, "reviewing"],
      [`Find issue ${ISSUE}`, undefined],
    ]);
    const [head] = await client.repos.listCommits({ repo: AGENT, per_page: 1 });
    expect(head?.commit.message).toMatch(/\nGrounded-Issue: GRD-1\nGrounded-Action: reopen$/u);
  });

  it("refuses an action from a state it can't leave, and a stale head with 409", async () => {
    const { client, at, get, update } = tinyClient();
    await expect(update({ action: "reopen" })).rejects.toThrow();
    const { head_oid } = await get();
    await update({ action: "validate" });
    await expect(
      client.issues.update({ ...at, expectedHeadOid: head_oid, action: "dismiss", reason: "late" }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("includes and excludes Traces through the Issue's frontmatter", async () => {
    const { client, at, get, update } = tinyClient();
    const [kept, dropped] = FAILING;
    assert(kept !== undefined && dropped !== undefined);
    await update({ action: "exclude_trace", trace: dropped });
    expect(await get()).toMatchObject({ exclude: [dropped] });
    expect((await client.issues.listTraces(at)).traces.map((trace) => trace.trace_id)).toEqual([
      kept,
    ]);
  });

  it("reruns a Candidate on its test merge and compares it with the evals branch's baseline", async () => {
    const { client, rerun } = tinyClient();
    const candidate = await rerun();
    expect(candidate?.results).toMatchObject({
      outdated: false,
      new_evals: { passed: 1, total: 1 },
      existing_evals: { passed: 1, total: 1 },
      regressions: [],
    });
    const run = candidate?.results?.run;
    assert(run !== undefined);
    expect(run).toMatchObject({
      job: "grounded/run-evals",
      trigger: "workflow_dispatch",
      conclusion: "success",
    });
    // each trial is its own session, graded by its task's Criteria
    const { results } = await client.evals.getRun({ agent: AGENT, run: run.id });
    expect(results.map((result) => [result.eval, result.passed])).toEqual([
      ["t1", true],
      ["t2", true],
    ]);
    const trial = results[0]?.trials[0];
    const { annotations } = await client.agents.listSessionAnnotations({
      agent: AGENT,
      session: trial?.session_id ?? "",
    });
    expect(annotations.map((annotation) => annotation.name).toSorted()).toEqual([
      "grounded/grade/reward",
      "grounded/grade/reward/refund-limit-holds",
    ]);
    expect(
      trial?.annotations.map((annotation) => [annotation.name, annotation.label]).toSorted(),
    ).toEqual([
      ["grounded/grade/reward", ""],
      ["grounded/grade/reward/refund-limit-holds", "pass"],
    ]);
  });

  it("approves the tested merge, then ships it to main and resolves the Issue with its fix", async () => {
    const { client, get, update, rerun } = tinyClient();
    await rerun();
    await update({ action: "approve", candidate: CANDIDATE });
    const approved = await get();
    expect(approved).toMatchObject({
      state: "reviewing",
      approved: { candidate: CANDIDATE, outdated: false },
    });
    await update({ action: "ship" });
    const shipped = await get();
    expect(shipped).toMatchObject({ state: "resolved", approved: undefined });
    const main = await client.repos.getContent({ repo: AGENT, path: "agent/agent.py" });
    expect("content" in main && atob(main.content)).toBe("limit = 100\n");
    const [head] = await client.repos.listCommits({ repo: AGENT, per_page: 1 });
    expect(head?.sha).not.toBe(shipped.fix);
    expect(head?.commit.message.split("\n", 1)[0]).toBe(
      `Ship candidate ${CANDIDATE} of issue ${ISSUE}`,
    );
  });

  it("opens a new Candidate off the evals branch, and an edit to it runs its pull request", async () => {
    const { client, at, candidates, advance } = tinyClient();
    const id = await client.issues.createCandidate({
      repo: AGENT,
      id: ISSUE,
      title: "Refuse large refunds",
    });
    const created = (await candidates()).find((candidate) => candidate.id === id);
    assert(created !== undefined);
    await client.issues.updateCandidate({
      ...at,
      candidate: id,
      expectedHeadOid: created.head_sha,
      files: [{ path: "agent/agent.py", contents: "limit = 100 # refuse\n" }],
    });
    advance(60_000);
    const runs = await client.jobs.listRuns({ agent: AGENT, job: "grounded/run-evals" });
    expect(runs[0]).toMatchObject({ trigger: "pull_request", status: "completed" });
  });

  it("replays a Candidate branched from another with the recorded Agent closest to it", async () => {
    const { client, at, candidates, advance } = tinyClient();
    const id = await client.issues.createCandidate({
      repo: AGENT,
      id: ISSUE,
      title: "Cap and log refunds",
    });
    const created = (await candidates()).find((candidate) => candidate.id === id);
    assert(created !== undefined);
    await client.issues.updateCandidate({
      ...at,
      candidate: id,
      expectedHeadOid: created.head_sha,
      files: [{ path: "agent/agent.py", contents: "limit = 100\nlog = True\n" }],
    });
    advance(60_000);
    const branched = (await candidates()).find((candidate) => candidate.id === id);
    expect(branched?.results).toMatchObject({ new_evals: { passed: 1, total: 1 } });
  });

  it("rewrites evals/registry.json on each commit, as the pre-commit hook does", async () => {
    const { client, at } = tinyClient();
    const [head] = await client.repos.listCommits({ repo: AGENT, sha: EVALS, per_page: 1 });
    assert(head !== undefined);
    await client.issues.updateEvals({
      ...at,
      expectedHeadOid: head.sha,
      files: [
        {
          path: "evals/tasks/t3/task.toml",
          contents: '[metadata]\ntitle = "Partial refunds"\nissues = ["GRD-1"]\n',
        },
        { path: "evals/tasks/t3/instruction.md", contents: "Refund half the order.\n" },
      ],
    });
    const evals = await client.evals.list({ repo: AGENT, ref: EVALS });
    expect(evals.map((entry) => [entry.id, entry.title, entry.issues])).toEqual([
      ["t1", "Refund limit", ["GRD-1"]],
      ["t2", "Greeting", []],
      ["t3", "Partial refunds", ["GRD-1"]],
    ]);
    expect(evals[0]?.criteria).toEqual([
      {
        name: "reward/refund-limit-holds",
        description: "Refund limit holds",
        kind: "llm",
        scale: { type: "numeric", min: 1, max: 5 },
      },
    ]);
  });

  it("refuses a push that touches .grounded/ and leaves main where it was", async () => {
    const { client } = tinyClient();
    const [head] = await client.repos.listCommits({ repo: AGENT, per_page: 1 });
    assert(head !== undefined);
    await expect(
      client.repos.createCommitOnBranch({
        repo: AGENT,
        branch: "main",
        expectedHeadOid: head.sha,
        message: { headline: "Edit a Grounded job" },
        fileChanges: {
          additions: [{ path: ".grounded/jobs/run-evals/run.sh", contents: btoa("exit 0\n") }],
        },
      }),
    ).rejects.toMatchObject({ status: 403 });
    const [after] = await client.repos.listCommits({ repo: AGENT, per_page: 1 });
    expect(after?.sha).toBe(head.sha);
  });

  it("merges main into the evals branch with Sync, which reruns its baseline", async () => {
    const { client, at, get } = tinyClient();
    const before = (await client.jobs.listRuns({ agent: AGENT, branch: EVALS })).length;
    await client.issues.updateNotes({
      ...at,
      expectedHeadOid: (await get()).head_oid,
      files: [{ path: `issues/${ISSUE}/notes/limit.md`, contents: "- the cap is 100\n" }],
    });
    await client.repos.createCommitOnBranch({
      repo: AGENT,
      branch: "main",
      expectedHeadOid: (await get()).head_oid,
      message: { headline: "Tune the prompt" },
      fileChanges: { additions: [{ path: "agent/prompt.md", contents: btoa("Be brief.\n") }] },
    });
    expect((await client.issues.getCandidate({ ...at, candidate: CANDIDATE }))?.evals_behind).toBe(
      true,
    );
    await client.issues.syncEvals(at);
    expect((await client.issues.getCandidate({ ...at, candidate: CANDIDATE }))?.evals_behind).toBe(
      false,
    );
    expect((await client.jobs.listRuns({ agent: AGENT, branch: EVALS })).length).toBe(before + 1);
    expect(CANDIDATE_BRANCH).toBe(`issue/${ISSUE}/candidate/${CANDIDATE}`);
  });
});

describe("the memory git", () => {
  it("serves directory object hashes and UTF-8 file byte sizes", async () => {
    const git = new MemoryGit(emptyObjects(), emptyObjects());
    const sha = await git.putBlob("café");
    const tree = await git.putFiles(new Map([["docs/café.txt", { mode: "100644", sha }]]));
    const who = { name: "x", email: "x", date: gitDate(START) };
    const head = await git.putCommit(tree, [], "Add a document", who);
    git.setRef("refs/heads/main", head);
    expect(git.getContent("", "main")).toEqual([
      { type: "dir", name: "docs", path: "docs", sha: git.entryAt(head, "docs")?.sha, size: 0 },
    ]);
    expect(git.getContent("docs", "main")).toEqual([
      { type: "file", name: "café.txt", path: "docs/café.txt", sha, size: 5 },
    ]);
    expect(git.getContent("docs/café.txt", "main")).toMatchObject({ sha, size: 5 });
  });

  it("hashes objects as git does", async () => {
    expect(await hashObject("blob", new TextEncoder().encode("hello\n"))).toBe(
      "ce013625030ba8dba906f756967f9e9ca394464a",
    );
    const git = new MemoryGit(emptyObjects(), emptyObjects());
    expect(await git.putFiles(new Map())).toBe("4b825dc642cb6eb9a060e54bf8d69288fbee4904");
  });

  it("groups native Trace records into ordered conversation turns", () => {
    const span: Span = {
      span_id: "1".repeat(16),
      parent_span_id: "",
      name: "invoke_agent acme",
      kind: "Internal",
      service_name: "acme",
      started_at: "2025-09-29T12:00:00.000000001Z",
      duration_ns: 5,
      status_code: "Unset",
      status_message: "",
      attributes: { "gen_ai.conversation.id": "s1" },
      resource_attributes: { "service.name": "acme" },
      events: [],
    };
    const earlier = { trace_id: "a".repeat(32), spans: [span] };
    const later = {
      trace_id: "b".repeat(32),
      spans: [{ ...span, started_at: "2025-09-29T12:00:00.000000002Z" }],
    };
    const turns = sessionsOf([later, earlier]).get("s1");
    expect(turns?.map((turn) => turn.trace_id)).toEqual([earlier.trace_id, later.trace_id]);
  });
});
