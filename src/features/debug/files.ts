import type { NestedEntry, PullFile } from "#src/sdk/index";

export type EditedFile = { path: string; contents: string };

/** A file's text, or undefined when it isn't UTF-8 text (with a NUL, as git judges binary files). */
export function readText(content: string) {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(
      Uint8Array.from(atob(content), (char) => char.charCodeAt(0)),
    );
    return text.includes("\0") ? undefined : text;
  } catch {
    return undefined;
  }
}

/** The text of the file at `path` in `entries`, empty when it isn't there. */
export function entryText(entries: readonly NestedEntry[], path: string) {
  const entry = entries.find((each) => each.type === "file" && each.path === path);
  return entry?.content === undefined ? "" : (readText(entry.content) ?? "");
}

/**
 * The files a new branch needs to hold what this one changes plus the unsaved edits: each changed
 * file's text at the head, with the edits over them. Commits only add files, so deletions stay behind.
 */
export function branchFiles(
  head: readonly NestedEntry[],
  changes: ReadonlyArray<Pick<PullFile, "filename" | "status">>,
  edits: readonly EditedFile[],
): EditedFile[] {
  const files = new Map<string, string>();
  for (const { filename, status } of changes) {
    if (status === "removed") {
      continue;
    }
    const entry = head.find((each) => each.type === "file" && each.path === filename);
    const text = entry?.content === undefined ? undefined : readText(entry.content);
    if (text === undefined) {
      throw new Error(
        `${filename} is too large or isn't text, so it can't be copied to a new branch`,
      );
    }
    files.set(filename, text);
  }
  for (const { path, contents } of edits) {
    files.set(path, contents);
  }

  return [...files].map(([path, contents]) => ({ path, contents }));
}
