import type { ProductClient } from "#src/queries/client";
import { type InputValue, type Job, type JobRun, RUN_EVALS_JOB } from "#src/sdk/index";

import { must, type Plane, VIEWER } from "./access.ts";
import { liveRuns, replay } from "./automations.ts";
import { GitError, gitDate, type MemoryGit } from "./git.ts";
import { matches } from "./glob.ts";
import {
  concurrencyGroup,
  decodeJobDefinition,
  type Definition,
  InputError,
  resolveInputs,
  runStepNames,
  stepName,
} from "./job-definition.ts";
import { jobToml, MAIN } from "./paths.ts";
import type { pullsService } from "./pulls.ts";
import { TASKS } from "./registry.ts";
import {
  evalRunAt,
  jobRunAt,
  type Played,
  queuedRun,
  recordingsOf,
  runSteps,
  type Submitted,
} from "./runs.ts";
import type { PullRecord } from "./seed/types.ts";
import { rootOf } from "./traces.ts";

const active = (run: JobRun) => run.status !== "completed";

/** Every job on main, Grounded's and the team's, by name. */
const jobNames = (git: MemoryGit) =>
  [...git.files(git.resolve(MAIN)).keys()].flatMap((path) => {
    const grounded = /^\.grounded\/jobs\/([^/]+)\/job\.toml$/u.exec(path)?.[1];
    const own = /^jobs\/([^/]+)\/job\.toml$/u.exec(path)?.[1];
    return grounded !== undefined ? [`grounded/${grounded}`] : own !== undefined ? [own] : [];
  });

const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 100;

// a job's definition on main as the jobs service reads it, invalid when its job.toml or prompt-file is
function jobOnMain(
  git: MemoryGit,
  name: string,
):
  | Extract<Job, { state: "invalid" }>
  | (Extract<Job, { state: "active" }> & Pick<Definition, "inputs">) {
  const entry = git.entryAt(git.resolve(MAIN), jobToml(name));
  if (entry === undefined) {
    throw new GitError(`No job ${name} on main`, 404);
  }
  try {
    const definition = decodeJobDefinition(git.text(entry.sha));
    // a prompt-file is read from main when the run queues, as platform reads it at the definition's commit
    for (const step of definition.steps) {
      const file =
        "prompt-file" in step ? git.entryAt(git.resolve(MAIN), step["prompt-file"]) : null;
      if (file === undefined || (file !== null && git.text(file.sha).trim() === "")) {
        throw new Error(
          `${"prompt-file" in step ? step["prompt-file"] : ""}: missing or empty prompt-file`,
        );
      }
    }
    return {
      name,
      state: "active",
      display_name: definition.name ?? null,
      model: definition.model ?? null,
      on: definition.on,
      inputs: definition.inputs,
      permissions: Object.fromEntries(
        Object.entries(definition.permissions).flatMap(([resource, access]) =>
          access === undefined ? [] : [[resource, access]],
        ),
      ),
      concurrency: definition.concurrency,
      timeout_minutes: definition["timeout-minutes"],
      concurrent_sandboxes: definition["concurrent-sandboxes"],
      vcpus: definition.vcpus,
      mem_mib: definition["mem-mib"],
      steps: definition.steps.map((step) =>
        "run" in step
          ? {
              name: stepName(step),
              run: step.run,
              exclude_from_context: step["exclude-from-context"],
            }
          : "prompt" in step
            ? { name: stepName(step), prompt: step.prompt }
            : { name: stepName(step), prompt_file: step["prompt-file"] },
      ),
    };
  } catch (error) {
    return {
      name,
      state: "invalid",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

type Request = Pick<JobRun, "job" | "trigger" | "ref" | "sha" | "inputs">;

/** The jobs service: the seed's recorded runs, the runs under way when the demo opens and the viewer's, replayed. */
export function jobsService(
  { seed, git, now, head, read, write }: Plane,
  layer: { runs: Submitted[] },
  pulls: Pick<ReturnType<typeof pullsService>, "records" | "view" | "recordOf">,
) {
  const main = () => must(head(MAIN), "The repo has no main");
  const recorded = new Map(seed.traces.map((trace) => [trace.trace_id, trace]));
  const recordings = recordingsOf(git, seed.outcomes);
  const stepNamesOf = (job: string) => {
    const definition = jobOnMain(git, job);
    return runStepNames(definition.state === "active" ? definition.steps : []);
  };
  const tasksAt = (commit: string) => {
    const listed = git.entryAt(commit, TASKS) === undefined ? [] : git.getContent(TASKS, commit);
    return Array.isArray(listed)
      ? listed.flatMap((entry) => (entry.type === "dir" ? [entry.name] : []))
      : [];
  };

  const playedRun = (submitted: Submitted): Played =>
    submitted.run.job === RUN_EVALS_JOB
      ? evalRunAt(
          submitted,
          now(),
          seed.run_step_ms,
          submitted.run.ref === MAIN ? "Baseline" : submitted.run.ref,
          (task) => recordings.at(submitted.run.sha, task),
          (task) => {
            const trace = recorded.get(recordings.at(submitted.run.sha, task)?.trace_id ?? "");
            return trace === undefined ? undefined : rootOf(trace).duration_ns / 1e6;
          },
        )
      : jobRunAt(submitted, now());
  const live = liveRuns(seed.jobs, seed.agent, main, now(), (job, trigger, ref) => {
    const definition = jobOnMain(git, job);
    const group =
      definition.state === "active"
        ? concurrencyGroup(definition.concurrency.group, { job, trigger, ref, inputs: {} })
        : job;
    return { group, steps: stepNamesOf(job) };
  });
  const seededRuns: Played[] = seed.runs.map(
    ({ trials, logs, result, annotated: _annotated, annotation_kind: _kind, ...run }) => ({
      run: {
        ...run,
        steps: runSteps(
          stepNamesOf(run.job),
          run.started_at,
          run.completed_at === null || run.conclusion === null
            ? null
            : { at: run.completed_at, conclusion: run.conclusion },
        ),
      },
      trials: (trials ?? []).map(({ trace_id, task, ...trial }) => ({
        ...trial,
        task: task.replace(new RegExp(`^${TASKS}/`, "u"), ""),
        recorded: trace_id,
      })),
      logs,
      result,
    }),
  );
  const runs = () => [...seededRuns, ...[...live, ...layer.runs].map(playedRun)];
  const findRun = (id: string) =>
    must(
      runs().find((entry) => entry.run.id === id),
      "Run not found",
    );
  const artifacts = (id: string) => {
    const { result } = findRun(id);
    return new Map(
      result === undefined
        ? []
        : [["result.json", new TextEncoder().encode(JSON.stringify(result))]],
    );
  };

  // platform's job service creates triggered runs as `jobs`, and a person's run as their bare user id
  const enqueue = (request: Request, actor = "jobs"): JobRun => {
    const created = now();
    const definition = jobOnMain(git, request.job);
    if (definition.state === "invalid") {
      throw new GitError(definition.error, 422);
    }
    // a new run cancels the older one in its job.toml's concurrency group
    const group = concurrencyGroup(definition.concurrency.group, request);
    const id = crypto.randomUUID();
    for (const older of [...live, ...layer.runs]) {
      const { run } = playedRun(older);
      if (
        run.concurrency_group === group &&
        run.status !== "completed" &&
        (run.status === "queued" || definition.concurrency["cancel-in-progress"])
      ) {
        older.cancelled_ms = created;
        if (run.status === "queued") {
          older.run.replaced_by = id;
        }
      }
    }
    // a run records its inputs with the job.toml defaults filled in, as platform's job service does
    const inputs = resolveInputs(definition.inputs, request.inputs);
    const asked = Array.isArray(inputs.tasks) ? inputs.tasks : [];
    const submitted: Submitted = {
      run: queuedRun(
        {
          ...request,
          inputs,
          id,
          agent: seed.agent,
          definition_commit: main(),
          concurrency_group: group,
          created_by: actor,
          created_at: gitDate(created),
        },
        runStepNames(definition.steps),
      ),
      created_ms: created,
      ...(request.job === RUN_EVALS_JOB
        ? { tasks: asked.length > 0 ? asked : tasksAt(request.sha) }
        : { recipe: replay(seed.jobs[request.job], git, request.job, main()) }),
    };
    layer.runs.push(submitted);
    return playedRun(submitted).run;
  };

  // the job runner's triggers, from each job.toml's `on` on main
  const definitions = () =>
    jobNames(git).flatMap((name) => {
      const definition = jobOnMain(git, name);
      return definition.state === "active" ? [{ name, on: definition.on }] : [];
    });
  const opened = async (pull: PullRecord) => {
    const view = await pulls.view(pull);
    if (view.state !== "open" || view.merge_commit_sha === null) {
      return;
    }
    for (const { name, on } of definitions()) {
      if (on.pull_request?.branches?.some((glob) => matches(glob, pull.base)) === true) {
        enqueue({
          job: name,
          trigger: "pull_request",
          ref: `refs/pull/${pull.number}/merge`,
          sha: view.merge_commit_sha,
          inputs: {},
        });
      }
    }
  };
  const pushed = async (branch: string, before: string | null, after: string) => {
    const changed = git.changedPaths(before, after);
    for (const { name, on } of definitions()) {
      const push = on.push;
      if (
        push !== undefined &&
        (push.branches ?? ["**"]).some((glob) => matches(glob, branch)) &&
        (push.paths === undefined ||
          changed.some((path) => push.paths?.some((glob) => matches(glob, path)) === true))
      ) {
        enqueue({ job: name, trigger: "push", ref: branch, sha: after, inputs: {} });
      }
    }
    for (const pull of pulls.records().filter((record) => record.head === branch)) {
      // oxlint-disable-next-line react-doctor/async-await-in-loop -- each PR's test merge is its own
      await opened(pull);
    }
  };

  const resource: ProductClient["jobs"] = {
    list: ({ agent }) => read(() => jobNames(git).map((name) => jobOnMain(git, name)), agent),
    get: ({ agent, job }) => read(() => jobOnMain(git, job), agent),
    dispatch: ({ agent, job, ref = MAIN, inputs = {} }) =>
      write(async () => {
        const definition = jobOnMain(git, job);
        if (definition.state === "invalid") {
          throw new GitError(definition.error, 422);
        }
        if (definition.on.workflow_dispatch === undefined) {
          throw new GitError("Job does not support workflow_dispatch", 422);
        }
        const pull = /^refs\/pull\/(\d+)\/merge$/u.exec(ref)?.[1];
        const view =
          pull === undefined ? undefined : await pulls.view(pulls.recordOf(Number(pull)));
        const sha =
          view === undefined
            ? git.resolve(ref)
            : view.state === "open"
              ? view.merge_commit_sha
              : null;
        if (sha === null) {
          throw new GitError("The pull request has no test merge", 422);
        }
        let supplied: Record<string, InputValue>;
        try {
          supplied = resolveInputs(definition.inputs, inputs);
        } catch (error) {
          if (error instanceof InputError) {
            throw new GitError(error.message, 422);
          }
          throw error;
        }
        // explicit dispatch reuses the demo trigger's identical queued work without changing its trigger
        const queued = runs().find(
          ({ run }) =>
            run.job === job &&
            run.ref === ref &&
            run.sha === sha &&
            run.definition_commit === git.resolve(MAIN) &&
            run.status === "queued" &&
            JSON.stringify(Object.entries(run.inputs).toSorted()) ===
              JSON.stringify(Object.entries(supplied).toSorted()),
        );
        return (
          queued?.run ??
          enqueue({ job, trigger: "workflow_dispatch", ref, sha, inputs: supplied }, VIEWER)
        );
      }, agent),
    listRuns: ({ agent, job, status, branch, page = 1, per_page = DEFAULT_PAGE_SIZE }) =>
      read(() => {
        if (
          !Number.isInteger(page) ||
          page < 1 ||
          !Number.isInteger(per_page) ||
          per_page < 1 ||
          per_page > MAX_PAGE_SIZE
        ) {
          throw new GitError("Invalid run pagination", 422);
        }
        const all = runs()
          .map(({ run }) => run)
          .filter(
            (run) =>
              (job === undefined || run.job === job) &&
              (status === undefined || run.status === status) &&
              (branch === undefined || matches(branch, run.ref)),
          )
          // on a tie the run recorded later is newer
          .toReversed()
          .toSorted((left, right) => right.created_at.localeCompare(left.created_at));
        return all.slice((page - 1) * per_page, page * per_page);
      }, agent),
    getRun: ({ agent, run }) => read(() => findRun(run).run, agent),
    cancelRun: ({ agent, run }) =>
      write(() => {
        const current = findRun(run).run;
        if (!active(current)) {
          throw new GitError("The run has already completed", 409);
        }
        const found = [...live, ...layer.runs].find((entry) => entry.run.id === run);
        if (found !== undefined) {
          found.cancelled_ms = now();
          return current.status === "queued"
            ? playedRun(found).run
            : { ...current, cancel_requested_at: new Date(found.cancelled_ms).toISOString() };
        }
        return current;
      }, agent),
    // a recording is the first run step's output, and setup and any later steps print nothing
    logs: ({ agent, run }, step, { offset = 0 } = {}) =>
      read(() => {
        const found = findRun(run);
        if (!found.run.steps.some((entry) => entry.number === step)) {
          throw new GitError(`No step ${step}`, 404);
        }
        const log = step === 1 ? found.logs.join("\n") : "";
        return new TextEncoder().encode(log).subarray(offset);
      }, agent),
    listArtifacts: ({ agent, run }) =>
      read(
        () => [...artifacts(run)].map(([path, bytes]) => ({ path, size: bytes.byteLength })),
        agent,
      ),
    getArtifact: ({ agent, run, path }) =>
      read(() => must(artifacts(run).get(path), `No artifact ${path}`), agent),
    downloadArtifacts: ({ agent, run }) => read(() => artifacts(run), agent),
    streamArtifact: ({ agent, run, path }) =>
      read(() => {
        const bytes = must(artifacts(run).get(path), `No artifact ${path}`);
        return new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(bytes);
            controller.close();
          },
        });
      }, agent),
  };
  return { resource, runs, opened, pushed, reset: () => recordings.clear() };
}
