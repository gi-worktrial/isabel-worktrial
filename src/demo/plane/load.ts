import type { z } from "zod";

import type { Trace } from "#src/sdk/index";

import { type AgentCatalogEntry, AgentCatalogSchema } from "./seed/catalog.ts";
import { SeedFileSchemas } from "./seed/files.ts";
import { OtlpLogsSchema, OtlpTracesSchema, decodeEvaluations, decodeTraces } from "./seed/otlp.ts";
import type { Seed } from "./seed/types.ts";
import { indexedTraces, isRecording } from "./traces.ts";

async function readJson<Schema extends z.ZodType>(
  path: string,
  schema: Schema,
): Promise<z.output<Schema>> {
  const response = await fetch(`/scenarios/${path}`);
  // the dev server answers a missing file with the app's page, so only json counts as found
  if (!response.ok || !(response.headers.get("Content-Type") ?? "").includes("json")) {
    throw new Error(`No /scenarios/${path}, so run pnpm build in demo-data.`);
  }
  return schema.parse(await response.json());
}

export async function listAgents(): Promise<readonly AgentCatalogEntry[]> {
  return (await readJson("index.json", AgentCatalogSchema)).agents;
}

/** A scenario's Walkthroughs, read with the schema of the actions their Pebble answers offer. */
export const walkthroughFile = <Schema extends z.ZodType>(agentId: string, schema: Schema) =>
  readJson(`${encodeURIComponent(agentId)}/walkthroughs.json`, schema);

/** A scenario's Pebble answers to its suggested prompts, read with the schema of Pebble's answers. */
export const answersFile = <Schema extends z.ZodType>(agentId: string, schema: Schema) =>
  readJson(`${encodeURIComponent(agentId)}/answers.json`, schema);

export async function scenarioFiles(agentId: string, orgId: string): Promise<{ seed: Seed }> {
  const folder = encodeURIComponent(agentId);
  const [scenario, repo, pulls, traces, runs, outcomes, grades, jobs] = await Promise.all([
    readJson(`${folder}/seed/scenario.json`, SeedFileSchemas.scenario),
    readJson(`${folder}/seed/repo.json`, SeedFileSchemas.repo),
    readJson(`${folder}/seed/pulls.json`, SeedFileSchemas.pulls),
    readJson(`${folder}/seed/traces.json`, SeedFileSchemas.traces),
    readJson(`${folder}/seed/runs.json`, SeedFileSchemas.runs),
    readJson(`${folder}/seed/outcomes.json`, SeedFileSchemas.outcomes),
    readJson(`${folder}/seed/recordings/grades.json`, SeedFileSchemas.grades),
    readJson(`${folder}/seed/jobs.json`, SeedFileSchemas.jobs),
  ]);
  // each annotated run's evaluations, from the OTLP logs file the collector would have taken from it
  const evaluations = Object.fromEntries(
    await Promise.all(
      runs
        .filter((run) => run.annotated === true)
        .map(
          async (run) =>
            [
              run.id,
              decodeEvaluations(
                await readJson(`${folder}/seed/logs/${run.id}.json`, OtlpLogsSchema),
              ),
            ] as const,
        ),
    ),
  );
  const indexed = indexedTraces(traces, scenario.agent);
  // a recorded trial a run replays lives outside traces/, which holds what platform's collector would
  const recordings = new Set(indexed.filter(isRecording).map((trace) => trace.trace_id));
  const files = new Map<string, Promise<Map<string, Trace>>>();
  const tracesIn = (path: string) => {
    let file = files.get(path);
    if (file === undefined) {
      file = readJson(path, OtlpTracesSchema)
        .then((body) => new Map(decodeTraces(body).map((trace) => [trace.trace_id, trace])))
        .catch((error: unknown) => {
          files.delete(path);
          throw error;
        });
      files.set(path, file);
    }
    return file;
  };
  const loadTrace = async (id: string) => {
    if (recordings.has(id)) {
      return (await tracesIn(`${folder}/seed/recordings/traces.json`)).get(id);
    }
    const bucket = /^[0-9a-f]{2}/u.exec(id)?.[0];
    return bucket === undefined
      ? undefined
      : (await tracesIn(`${folder}/seed/traces/${bucket}.json`)).get(id);
  };
  return {
    seed: {
      ...scenario,
      org_id: orgId,
      repo,
      pulls,
      traces: indexed,
      runs,
      outcomes,
      grades,
      jobs,
      evaluations,
      loadTrace,
    },
  };
}
