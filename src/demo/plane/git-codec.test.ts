import { expect, test } from "vitest";

import { blobBytes, commitBytes, objectBytes, splitTree, type Entry } from "./git-codec.ts";
import { emptyObjects, hashObject, MemoryGit } from "./git.ts";

const author = { name: "Person", email: "person@example.test", date: "2026-10-02T10:00:00.999Z" };
const committer = { name: "Bot", email: "bot@example.test", date: "2026-10-02T10:00:02.999Z" };

test("frames a blob by UTF-8 byte length, including a NUL in its content", () => {
  expect(new TextDecoder().decode(objectBytes("blob", blobBytes("café\0")))).toBe("blob 6\0café\0");
});

test.each(["subject", "subject\n", "subject\n\n", "\nsubject\r\n\n"])(
  "keeps exact commit message bytes (%j), parent order and separate signatures",
  (message) => {
    const bytes = commitBytes({
      tree: "1".repeat(40),
      parents: ["2".repeat(40), "3".repeat(40)],
      message,
      author,
      committer,
    });
    expect(new TextDecoder().decode(bytes)).toBe(
      [
        `tree ${"1".repeat(40)}`,
        `parent ${"2".repeat(40)}`,
        `parent ${"3".repeat(40)}`,
        "author Person <person@example.test> 1790935200 +0000",
        "committer Bot <bot@example.test> 1790935202 +0000",
        "",
        message,
      ].join("\n"),
    );
  },
);

test("keeps the raw commit's known object identity", async () => {
  expect(
    await hashObject(
      "commit",
      commitBytes({
        tree: "1".repeat(40),
        parents: ["2".repeat(40), "3".repeat(40)],
        message: "\nsubject\r\n\n",
        author,
        committer,
      }),
    ),
  ).toBe("5c8df057e51865090ec798773fcc09adcc8d53e3");
});

test("partitions paths without reordering files or the first-seen directories", () => {
  const files = new Map([
    ["z/inner/a", "first"],
    ["root", "second"],
    ["a/file", "third"],
    ["z/file", "fourth"],
  ]);
  const parts = splitTree(files);
  expect([...parts.blobs]).toEqual([["root", "second"]]);
  expect([...parts.trees].map(([name, child]) => [name, [...child]])).toEqual([
    [
      "z",
      [
        ["inner/a", "first"],
        ["file", "fourth"],
      ],
    ],
    ["a", [["file", "third"]]],
  ]);
  expect([...files.keys()]).toEqual(["z/inner/a", "root", "a/file", "z/file"]);
});

test("the memory store preserves its existing Unicode order and executable modes", async () => {
  const layer = emptyObjects();
  const git = new MemoryGit(emptyObjects(), layer);
  const sha = await git.putBlob("café\n");
  const tree = await git.putFiles(
    new Map([
      ["\uE000.txt", { mode: "100755", sha }],
      ["😀.txt", { mode: "100755", sha }],
    ]),
  );
  expect(tree).toBe("85e95fbfef7c87ed13831cfa9efed9007ea3359b");
  expect(layer.trees[tree]).toEqual([
    { name: "😀.txt", mode: "100755", type: "blob", sha },
    { name: "\uE000.txt", mode: "100755", type: "blob", sha },
  ] satisfies Entry[]);
});
