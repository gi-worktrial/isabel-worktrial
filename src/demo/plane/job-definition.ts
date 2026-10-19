import { parse } from "smol-toml";
import { z } from "zod";

import type { InputValue, JobRun } from "#src/sdk/index";

// native job definition and input rules from platform PR113 and PR133
/** Leaves margin under the job token's six-hour cap for launching, collection, and cleanup. */
const MAX_TIMEOUT_MINUTES = 330;
const DEFAULT_TIMEOUT_MINUTES = 60;
const DEFAULT_VCPUS = 2;
const DEFAULT_MEM_MIB = 4096;
export const DEFAULT_CONCURRENCY_GROUP = "{job}-{trigger}-{ref}";

const filterSchema = z
  .strictObject({
    "branches": z.array(z.string()),
    "branches-ignore": z.array(z.string()),
    "paths": z.array(z.string()),
    "paths-ignore": z.array(z.string()),
  })
  .partial();

const MAX_INPUTS = 50;

const inputNameSchema = z.string().regex(/^[a-z][a-z0-9_]{0,62}$/);
const inputBase = {
  description: z.string().optional(),
  required: z.boolean().default(false),
};
const inputSchema = z.discriminatedUnion("type", [
  z.strictObject({ ...inputBase, type: z.literal("string"), default: z.string().optional() }),
  z.strictObject({ ...inputBase, type: z.literal("number"), default: z.number().optional() }),
  z.strictObject({ ...inputBase, type: z.literal("boolean"), default: z.boolean().optional() }),
  z
    .strictObject({
      ...inputBase,
      type: z.literal("choice"),
      options: z.array(z.string()).min(1),
      default: z.string().optional(),
    })
    .refine((input) => input.default === undefined || input.options.includes(input.default), {
      message: "default must be one of options",
    }),
  z.strictObject({
    ...inputBase,
    type: z.literal("array"),
    default: z.array(z.string()).optional(),
  }),
]);
type InputDefinition = z.infer<typeof inputSchema>;

/** A job's `[inputs.<name>]` tables. */
const inputsSchema = z
  .record(inputNameSchema, inputSchema)
  .refine((inputs) => Object.keys(inputs).length <= MAX_INPUTS, {
    message: `at most ${MAX_INPUTS} inputs`,
  })
  .default({});

export class InputError extends Error {
  override name = "InputError";
}

/** Checks `provided` against the definition, filling in defaults (in the definition's order). */
export function resolveInputs(
  inputs: z.output<typeof inputsSchema>,
  provided: Record<string, InputValue>,
): Record<string, InputValue> {
  for (const name of Object.keys(provided)) {
    if (!(name in inputs)) {
      throw new InputError(`Unknown input ${name}`);
    }
  }

  const resolved: Record<string, InputValue> = {};
  for (const [name, input] of Object.entries(inputs)) {
    const value = provided[name] ?? input.default;
    if (value === undefined) {
      if (input.required) {
        throw new InputError(`Input ${name} is required`);
      }

      continue;
    }

    const parsed = valueSchema(input).safeParse(value);
    if (!parsed.success) {
      throw new InputError(`Input ${name}: ${z.prettifyError(parsed.error)}`);
    }

    resolved[name] = parsed.data;
  }

  return resolved;
}

function valueSchema(input: InputDefinition): z.ZodType<InputValue> {
  switch (input.type) {
    case "string":
      return z.string();
    case "number":
      return z.number();
    case "boolean":
      return z.boolean();
    case "choice":
      return z.literal(input.options);
    case "array":
      return z.array(z.string());
  }
}

const permissionsSchema = z
  .strictObject({
    repo: z.enum(["read", "write"]),
    agent: z.enum(["read"]),
    trace: z.enum(["write"]),
    sandbox: z.enum(["read", "write"]),
    model: z.enum(["read"]),
    image: z.enum(["write"]),
    job: z.enum(["read", "write"]),
  })
  .partial()
  .default({ repo: "read", agent: "read" });

const definitionObject = z.strictObject({
  "name": z.string().optional(),
  "on": z
    .strictObject({
      workflow_dispatch: z.strictObject({}).optional(),
      push: filterSchema.optional(),
      pull_request: filterSchema.optional(),
      schedule: z.array(z.strictObject({ cron: z.string() })).optional(),
    })
    .default({ workflow_dispatch: {} }),
  "inputs": inputsSchema,
  "permissions": permissionsSchema,
  "concurrency": z
    .strictObject({
      "group": z.string().min(1).default(DEFAULT_CONCURRENCY_GROUP),
      "cancel-in-progress": z.boolean().default(false),
    })
    .default({ "group": DEFAULT_CONCURRENCY_GROUP, "cancel-in-progress": false }),
  "timeout-minutes": z.int().min(1).max(MAX_TIMEOUT_MINUTES).default(DEFAULT_TIMEOUT_MINUTES),
  // a count, or `"{inputs.<name>}"` as GitHub's `max-parallel: ${{ inputs.<name> }}`
  "concurrent-sandboxes": z
    .union([z.int().min(0), z.string().regex(/^\{inputs\.[^{}]+\}$/)])
    .default(0),
  "vcpus": z.int().min(1).default(DEFAULT_VCPUS),
  "mem-mib": z.int().min(1).default(DEFAULT_MEM_MIB),
  // the gateway model a prompt step runs Pebble on
  "model": z.string().trim().min(1).optional(),
  // GitHub's steps plus prompts to Pebble, where a step without a name is named after its run, prompt or prompt-file
  "steps": z
    .array(
      z.union([
        z.strictObject({
          "name": z.string().min(1).optional(),
          "run": z.string().min(1),
          "exclude-from-context": z.boolean().default(false),
        }),
        z.strictObject({ name: z.string().min(1).optional(), prompt: z.string().regex(/\S/) }),
        z.strictObject({ "name": z.string().min(1).optional(), "prompt-file": z.string().min(1) }),
      ]),
    )
    .min(1),
});
export type Definition = z.infer<typeof definitionObject>;
const jobDefinitionSchema = definitionObject
  .superRefine(validateConcurrencyGroup)
  .superRefine(validateSandboxPermission)
  .superRefine(validatePromptSteps);

function validateConcurrencyGroup(definition: Definition, ctx: z.RefinementCtx) {
  for (const [, name = ""] of definition.concurrency.group.matchAll(/\{([^{}]+)\}/gu)) {
    const input = name.startsWith("inputs.") ? name.slice("inputs.".length) : undefined;
    if (!["job", "trigger", "ref"].includes(name) && !(input && input in definition.inputs)) {
      ctx.addIssue({
        code: "custom",
        path: ["concurrency", "group"],
        message: `unknown placeholder {${name}}`,
      });
    }
  }
}

function validateSandboxPermission(definition: Definition, ctx: z.RefinementCtx) {
  const sandboxes = definition["concurrent-sandboxes"];
  if (
    (typeof sandboxes === "string" || sandboxes > 0) &&
    definition.permissions.sandbox !== "write"
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["permissions", "sandbox"],
      message: 'concurrent-sandboxes needs sandbox = "write"',
    });
  }
}

/** Pebble prompts the job's model and runs its tools in the run's sandbox with the run's token. */
function validatePromptSteps(definition: Definition, ctx: z.RefinementCtx) {
  if (!definition.steps.some((step) => !("run" in step))) {
    return;
  }
  const missing = [
    ...(definition.model === undefined ? [["model", "prompt steps need a model"]] : []),
    ...(definition.permissions.model === "read"
      ? []
      : [["permissions", 'prompt steps need model = "read"']]),
    ...(definition.permissions.sandbox === "write"
      ? []
      : [["permissions", 'prompt steps need sandbox = "write"']]),
  ];
  for (const [path = "", message = ""] of missing) {
    ctx.addIssue({ code: "custom", path: [path], message });
  }
}

/** A step's name, else its run, prompt or prompt-file. */
export const stepName = (step: Definition["steps"][number]): string =>
  step.name ?? ("run" in step ? step.run : "prompt" in step ? step.prompt : step["prompt-file"]);

/** Step 0, which clones the repository, installs its tools, and runs its `setup` task. */
const SETUP_STEP = "Set up job";

/** The names a run's steps take, from "Set up job" at 0. */
export function runStepNames(steps: ReadonlyArray<{ name: string }>): string[] {
  return [SETUP_STEP, ...steps.map((step) => step.name)];
}

/** Reads a native job.toml with the runner's defaults and validation. */
export function decodeJobDefinition(text: string): Definition {
  return jobDefinitionSchema.parse(parse(text));
}

/** A run's concurrency group, from its job.toml's template. */
export function concurrencyGroup(
  template: string,
  run: Pick<JobRun, "job" | "trigger" | "ref" | "inputs">,
) {
  return template.replaceAll(/\{([^{}]+)\}/gu, (_, name: string) => {
    const value = name.startsWith("inputs.")
      ? run.inputs[name.slice("inputs.".length)]
      : name === "job"
        ? run.job
        : name === "trigger"
          ? run.trigger
          : name === "ref"
            ? run.ref
            : undefined;
    return value === undefined ? "" : Array.isArray(value) ? value.join(",") : String(value);
  });
}
