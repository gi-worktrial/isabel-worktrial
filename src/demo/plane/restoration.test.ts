import { expect, test, vi } from "vitest";

import { snapshotViewer } from "#src/demo/reset";
import type { IssueChange } from "#src/sdk/index";
import { AGENT, ISSUE, tinySeed } from "#test/tiny-seed";

import { emptyLayer, type Layer, memoryClient } from "./client.ts";

const at = { agent: AGENT, repo: AGENT, id: ISSUE };

test("restoration keeps the same objects and client, full records, and the next persisted write", async () => {
  const seed = tinySeed();
  const layer = emptyLayer();
  let saved = "";
  const client = memoryClient(seed, layer, { saved: (next) => (saved = JSON.stringify(next)) });
  const update = async (change: IssueChange) =>
    client.issues.update({
      ...at,
      expectedHeadOid: (await client.issues.get(at)).head_oid,
      ...change,
    });
  await update({ action: "validate" });
  const run = await client.jobs.dispatch({ agent: AGENT, job: "annotate-traces", ref: "main" });
  await client.pebble.threads.create({ title: "Refunds" });
  const before = structuredClone(layer);
  const objects = layer.objects;
  const refs = await client.repos.listBranches({ repo: AGENT });
  const restore = snapshotViewer(client);
  await update({ action: "dismiss", reason: "Tour" });
  await client.jobs.cancelRun({ agent: AGENT, run: run.id });
  await client.pebble.threads.create({ title: "After" });
  restore();
  expect(layer.objects).toBe(objects);
  expect(layer).toEqual(before);
  expect(await client.repos.listBranches({ repo: AGENT })).toEqual(refs);
  expect((await client.issues.get(at)).state).toBe("reviewing");
  await client.issues.updateNotes({
    ...at,
    expectedHeadOid: (await client.issues.get(at)).head_oid,
    body: "After restore\n",
    files: [],
  });
  expect(saved).toBe(JSON.stringify(layer));
  const reloaded = memoryClient(seed, structuredClone(layer));
  expect((await reloaded.issues.get(at)).body).toBe("After restore\n");
});

test("a write hashing its objects when the viewer restores can't write or save", async () => {
  const layer = emptyLayer();
  const saved = vi.fn<(next: Layer) => void>();
  const client = memoryClient(tinySeed(), layer, { saved });
  const restore = snapshotViewer(client);
  const { head_oid } = await client.issues.get(at);
  const { promise: began, resolve: started } = Promise.withResolvers<void>();
  const { promise: resume, resolve: release } = Promise.withResolvers<void>();
  const digest = crypto.subtle.digest.bind(crypto.subtle);
  const spy = vi.spyOn(crypto.subtle, "digest").mockImplementation(async (...args) => {
    started();
    await resume;
    return digest(...args);
  });
  try {
    const writing = client.issues.updateNotes({
      ...at,
      expectedHeadOid: head_oid,
      files: [{ path: `issues/${ISSUE}/notes/x.md`, contents: "- x\n" }],
    });
    await began;
    restore();
    const saves = saved.mock.calls.length;
    release();
    await expect(writing).rejects.toMatchObject({ name: "AbortError" });
    expect(layer).toEqual(emptyLayer());
    expect(saved).toHaveBeenCalledTimes(saves);
  } finally {
    release();
    spy.mockRestore();
  }
});
