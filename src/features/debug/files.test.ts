import { describe, expect, it } from "vitest";

import type { NestedEntry, PullFile } from "#src/sdk/index";

import { branchFiles, entryText } from "./files.ts";

const file = (path: string, text: string | undefined): NestedEntry => ({
  type: "file",
  name: path.slice(path.lastIndexOf("/") + 1),
  path,
  sha: "",
  size: text?.length ?? 0,
  content: text === undefined ? undefined : btoa(text),
});

const change = (filename: string, status: PullFile["status"]) => ({ filename, status });

describe("branchFiles", () => {
  const head = [file("agent/a.py", "a = 1\n"), file("agent/b.py", "b = 1\n")];

  it("copies each changed file at the head with the edits over them, leaving deletions behind", () => {
    expect(
      branchFiles(
        head,
        [
          change("agent/a.py", "modified"),
          change("agent/b.py", "added"),
          change("gone.py", "removed"),
        ],
        [
          { path: "agent/a.py", contents: "a = 2\n" },
          { path: "agent/c.py", contents: "c = 1\n" },
        ],
      ),
    ).toEqual([
      { path: "agent/a.py", contents: "a = 2\n" },
      { path: "agent/b.py", contents: "b = 1\n" },
      { path: "agent/c.py", contents: "c = 1\n" },
    ]);
  });

  it("refuses a changed file it can't read", () => {
    expect(() =>
      branchFiles([file("big.bin", undefined)], [change("big.bin", "modified")], []),
    ).toThrow("big.bin is too large or isn't text");
  });
});

describe("entryText", () => {
  it("reads a file's text, and an absent file as empty", () => {
    expect(entryText([file("a.txt", "hi")], "a.txt")).toBe("hi");
    expect(entryText([], "a.txt")).toBe("");
  });
});
