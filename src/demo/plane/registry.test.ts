import { createHash } from "node:crypto";

import { expect, test } from "vitest";

import { registryOf } from "./registry.ts";

test("the registry lists each task with its criteria and a sha256 digest of its files", () => {
  const files = new Map([
    [
      "evals/tasks/refund/task.toml",
      '[metadata]\ntitle = "Refund in window"\nissues = ["ACME-1"]\n',
    ],
    ["evals/tasks/refund/instruction.md", "Refund the leaking machine.\n".repeat(20)],
    [
      "evals/tasks/refund/tests/criteria.toml",
      '[[criterion]]\nname = "Refunds the machine"\nkind = "check"\nscale = { kind = "binary" }\npass_mark = 1\ndefinition = "x"\n',
    ],
    ["agent/agent.py", "pass\n"],
  ]);
  const [entry] = JSON.parse(registryOf(files) ?? "").evals;
  const own = [...files]
    .filter(([path]) => path.startsWith("evals/tasks/refund/"))
    .map(([path, text]) => [path.slice("evals/tasks/refund/".length), text] as const)
    .toSorted(([left], [right]) => left.localeCompare(right));
  const expected = createHash("sha256")
    .update(own.map(([path, text]) => `${path}\0${text}\0`).join(""))
    .digest("hex");
  expect(entry).toEqual({
    id: "refund",
    title: "Refund in window",
    path: "evals/tasks/refund",
    issues: ["ACME-1"],
    prompt: "Refund the leaking machine.\n".repeat(20),
    digest: `sha256:${expected}`,
    criteria: [
      {
        name: "reward/refunds-the-machine",
        description: "Refunds the machine",
        kind: "code",
        scale: { type: "binary" },
      },
    ],
  });
  expect(registryOf(new Map([["agent/agent.py", "pass\n"]]))).toBeUndefined();
});
