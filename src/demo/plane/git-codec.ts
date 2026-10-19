export type Entry = { name: string; mode: string; type: "blob" | "tree"; sha: string };
export type Person = { name: string; email: string; date: string };
export type CommitObject = {
  tree: string;
  parents: string[];
  message: string;
  author: Person;
  committer: Person;
};
export type ObjectType = "blob" | "tree" | "commit";

const encoder = new TextEncoder();

/** A blob's bytes, without its object header. */
export const blobBytes = (text: string): Uint8Array<ArrayBuffer> => encoder.encode(text);

export const objectHeader = (type: ObjectType, size: number): Uint8Array<ArrayBuffer> =>
  encoder.encode(`${type} ${size}\0`);

/** The bytes hashed by both the synchronous builder and the async viewer. */
export function objectBytes(type: ObjectType, body: Uint8Array): Uint8Array<ArrayBuffer> {
  const header = objectHeader(type, body.length);
  const bytes = new Uint8Array(header.length + body.length);
  bytes.set(header);
  bytes.set(body, header.length);
  return bytes;
}

/** Files at this level and children in their first-seen order. */
export function splitTree<File>(files: ReadonlyMap<string, File>) {
  const blobs = new Map<string, File>();
  const trees = new Map<string, Map<string, File>>();
  for (const [path, file] of files) {
    const slash = path.indexOf("/");
    if (slash === -1) {
      blobs.set(path, file);
    } else {
      const name = path.slice(0, slash);
      const child = trees.get(name) ?? new Map<string, File>();
      child.set(path.slice(slash + 1), file);
      trees.set(name, child);
    }
  }
  return { blobs, trees };
}

const treeName = (entry: Entry) => (entry.type === "tree" ? `${entry.name}/` : entry.name);

// the builder passes its own UTF-8 comparison
export function sortTree<TreeEntry extends Entry>(
  entries: readonly TreeEntry[],
  compareNames: (left: string, right: string) => number = (left, right) => (left < right ? -1 : 1),
): TreeEntry[] {
  return entries.toSorted((left, right) => compareNames(treeName(left), treeName(right)));
}

/** Ordered tree entries as mode, name, NUL and raw id bytes, with a hook so Node keeps its native hex decoder. */
export function treeBytes(
  entries: readonly Entry[],
  bytesOf: (sha: string) => Uint8Array = (sha) =>
    Uint8Array.from(sha.match(/../gu) ?? [], (pair) => Number.parseInt(pair, 16)),
): Uint8Array<ArrayBuffer> {
  const parts = entries.flatMap((entry) => [
    encoder.encode(`${entry.mode} ${entry.name}\0`),
    bytesOf(entry.sha),
  ]);
  const bytes = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    bytes.set(part, at);
    at += part.length;
  }
  return bytes;
}

// whole seconds in UTC so seed and viewer commits hash alike
export function signatureLine({ name, email, date }: Person): string {
  return `${name} <${email}> ${Math.floor(Date.parse(date) / 1000)} +0000`;
}

/** Parent order, separate signatures and the message's exact bytes define the commit id. */
export function commitBytes(
  commit: Omit<CommitObject, "parents"> & { parents: readonly string[] },
): Uint8Array<ArrayBuffer> {
  return encoder.encode(
    [
      `tree ${commit.tree}`,
      ...commit.parents.map((parent) => `parent ${parent}`),
      `author ${signatureLine(commit.author)}`,
      `committer ${signatureLine(commit.committer)}`,
      "",
      commit.message,
    ].join("\n"),
  );
}
