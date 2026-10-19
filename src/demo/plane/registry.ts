// the agent template's pre-commit hook, which rewrites evals/registry.json from evals/tasks on each commit
import { parse } from "smol-toml";
import { z } from "zod";

import { EVAL_REGISTRY_PATH, type EvalRegistry } from "#src/sdk/index";

export const TASKS = "evals/tasks";
export const CRITERIA_FILE = "tests/criteria.toml";

const scaleSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("binary") }),
  z.object({ kind: z.literal("likert"), points: z.number().int().min(3) }),
  z.object({ kind: z.literal("numeric"), min: z.number(), max: z.number() }),
  z.object({ kind: z.literal("rubric"), levels: z.array(z.string().min(1)).min(2) }),
]);
const criterionSchema = z.object({
  name: z.string().min(1),
  kind: z.enum(["check", "judge"]),
  scale: scaleSchema,
  pass_mark: z.number(),
  definition: z.string(),
});
const criteriaSchema = z.object({ criterion: z.array(criterionSchema).default([]) });
const manifestSchema = z.object({
  metadata: z
    .object({ title: z.string().optional(), issues: z.array(z.string()).optional() })
    .default({}),
});

/** One rewardkit Criterion from a task's `tests/criteria.toml`, as its grade reads it. */
type TaskCriterion = z.infer<typeof criterionSchema> & { grade: string };

/** The Grade a Criterion's annotation is named by after `grounded/grade/`, like `reward/read-input-in-update`. */
const gradeOf = (name: string) =>
  `reward/${name
    .toLowerCase()
    .replaceAll(/['’]/gu, "")
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replaceAll(/^-|-$/gu, "")}`;

export function readTaskCriteria(text: string | undefined): TaskCriterion[] {
  return text === undefined
    ? []
    : criteriaSchema
        .parse(parse(text))
        .criterion.map((criterion) => ({ ...criterion, grade: gradeOf(criterion.name) }));
}

/** Whether a Grade's value passes its Criterion. */
export const passes = ({ pass_mark }: Pick<TaskCriterion, "pass_mark">, value: number) =>
  value >= pass_mark;

const scaleOf = ({
  scale,
}: TaskCriterion): EvalRegistry["evals"][number]["criteria"][number]["scale"] => {
  switch (scale.kind) {
    case "binary":
      return { type: "binary" };
    case "likert":
      return { type: "numeric", min: 1, max: scale.points };
    case "numeric":
      return { type: "numeric", min: scale.min, max: scale.max };
    case "rubric":
      return { type: "categorical", levels: scale.levels };
  }
};

// SHA-256 in plain code, so the browser and demo-data's synchronous builder hash a task the same way
const K = Uint32Array.from(
  "428a2f98 71374491 b5c0fbcf e9b5dba5 3956c25b 59f111f1 923f82a4 ab1c5ed5 d807aa98 12835b01 243185be 550c7dc3 72be5d74 80deb1fe 9bdc06a7 c19bf174 e49b69c1 efbe4786 0fc19dc6 240ca1cc 2de92c6f 4a7484aa 5cb0a9dc 76f988da 983e5152 a831c66d b00327c8 bf597fc7 c6e00bf3 d5a79147 06ca6351 14292967 27b70a85 2e1b2138 4d2c6dfc 53380d13 650a7354 766a0abb 81c2c92e 92722c85 a2bfe8a1 a81a664b c24b8b70 c76c51a3 d192e819 d6990624 f40e3585 106aa070 19a4c116 1e376c08 2748774c 34b0bcb5 391c0cb3 4ed8aa4a 5b9cca4f 682e6ff3 748f82ee 78a5636f 84c87814 8cc70208 90befffa a4506ceb bef9a3f7 c67178f2"
    .split(" ")
    .map((word) => Number.parseInt(word, 16)),
);

const rotate = (value: number, by: number) => (value >>> by) | (value << (32 - by));

function sha256(bytes: Uint8Array): string {
  const length = bytes.length;
  const padded = new Uint8Array(Math.ceil((length + 9) / 64) * 64);
  padded.set(bytes);
  padded[length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 4, length * 8);
  view.setUint32(padded.length - 8, Math.floor(length / 0x20000000));
  const hash = Uint32Array.from([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const words = new Uint32Array(64);
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let index = 0; index < 64; index++) {
      if (index < 16) {
        words[index] = view.getUint32(offset + index * 4);
      } else {
        const [early, late] = [words[index - 15]!, words[index - 2]!];
        const s0 = rotate(early, 7) ^ rotate(early, 18) ^ (early >>> 3);
        const s1 = rotate(late, 17) ^ rotate(late, 19) ^ (late >>> 10);
        words[index] = (words[index - 16]! + s0 + words[index - 7]! + s1) >>> 0;
      }
    }
    let [a, b, c, d, e, f, g, h] = hash as unknown as number[];
    for (let index = 0; index < 64; index++) {
      const t1 =
        (h! +
          (rotate(e!, 6) ^ rotate(e!, 11) ^ rotate(e!, 25)) +
          ((e! & f!) ^ (~e! & g!)) +
          K[index]! +
          words[index]!) >>>
        0;
      const t2 =
        ((rotate(a!, 2) ^ rotate(a!, 13) ^ rotate(a!, 22)) +
          ((a! & b!) ^ (a! & c!) ^ (b! & c!))) >>>
        0;
      [h, g, f, e, d, c, b, a] = [g, f, e, (d! + t1) >>> 0, c, b, a, (t1 + t2) >>> 0];
    }
    for (const [index, value] of [a, b, c, d, e, f, g, h].entries()) {
      hash[index] = (hash[index]! + value!) >>> 0;
    }
  }
  return Array.from(hash, (word) => word.toString(16).padStart(8, "0")).join("");
}

const digestOf = (files: ReadonlyArray<readonly [string, string]>) =>
  `sha256:${sha256(new TextEncoder().encode(files.map(([path, contents]) => `${path}\0${contents}\0`).join("")))}`;

/** `evals/registry.json` for a tree's files (path to text), or undefined when it has no tasks. */
export function registryOf(files: ReadonlyMap<string, string>): string | undefined {
  const byTask = new Map<string, Array<readonly [string, string]>>();
  for (const [path, text] of files) {
    const task = new RegExp(`^${TASKS}/([^/]+)/(.+)$`, "u").exec(path);
    if (task?.[1] !== undefined && task[2] !== undefined) {
      byTask.set(task[1], [...(byTask.get(task[1]) ?? []), [task[2], text] as const]);
    }
  }
  if (byTask.size === 0) {
    return undefined;
  }
  const evals = [...byTask]
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([id, own]) => {
      const read = (name: string) => own.find(([path]) => path === name)?.[1];
      const { metadata } = manifestSchema.parse(parse(read("task.toml") ?? ""));
      return {
        id,
        title: metadata.title ?? id,
        path: `${TASKS}/${id}`,
        issues: metadata.issues ?? [],
        prompt: read("instruction.md") ?? "",
        digest: digestOf(own.toSorted(([left], [right]) => left.localeCompare(right))),
        criteria: readTaskCriteria(read(CRITERIA_FILE)).map((criterion) => ({
          name: criterion.grade,
          description: criterion.name,
          kind: criterion.kind === "check" ? ("code" as const) : ("llm" as const),
          scale: scaleOf(criterion),
        })),
      };
    });
  return `${JSON.stringify({ format: 1, evals } satisfies EvalRegistry, null, 2)}\n`;
}

export { EVAL_REGISTRY_PATH };
