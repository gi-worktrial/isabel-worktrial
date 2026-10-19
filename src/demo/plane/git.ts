import { structuredPatch } from "diff";

import {
  type Commit,
  type ContentEntry,
  type ContentFile,
  type Comparison,
  GroundedError,
} from "#src/sdk/index";

import { isoSeconds } from "./clock.ts";
import {
  blobBytes,
  commitBytes,
  objectBytes,
  sortTree,
  splitTree,
  treeBytes,
  type CommitObject,
  type Entry,
  type Person,
} from "./git-codec.ts";
import { mergeBase as commonBase, pick3 } from "./git-merge.ts";
import { EVAL_REGISTRY_PATH, registryOf, TASKS } from "./registry.ts";

// a null ref deletes a seed ref
export type Objects = {
  blobs: Record<string, string>;
  trees: Record<string, Entry[]>;
  commits: Record<string, CommitObject>;
  refs: Record<string, string | null>;
};
export type File = { mode: string; sha: string };

/** UTF-8 text as base64, the contents API's encoding. */
const encode = (text: string) =>
  btoa(Array.from(new TextEncoder().encode(text), (byte) => String.fromCharCode(byte)).join(""));
/** base64 contents back to UTF-8 text. */
export const decode = (base64: string) =>
  new TextDecoder().decode(Uint8Array.from(atob(base64), (char) => char.codePointAt(0)!));

export const emptyObjects = (): Objects => ({ blobs: {}, trees: {}, commits: {}, refs: {} });

/** An error with the HTTP status the data plane would answer, as the GroundedError platform's screens read. */
export class GitError extends GroundedError {
  constructor(message: string, status: number) {
    super(message, status, undefined);
    this.name = "GitError";
  }
}

const hex = (bytes: Uint8Array) =>
  [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
/** A time in whole UTC seconds, as git signatures and the job runner write it. */
export const gitDate = (ms: number) => isoSeconds(Math.floor(ms / 1000) * 1000);

/** Git's object id, a SHA-1 over `<type> <length>\0<body>`. */
export async function hashObject(
  type: "blob" | "tree" | "commit",
  body: Uint8Array,
): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-1", objectBytes(type, body))));
}

/** One commit object store over the seed plus the viewer's layer, as the git service keeps it. */
export class MemoryGit {
  private readonly reached = new Map<string, ReadonlySet<string>>();
  // objects never change, so a tree's files and two blobs' patch are worked out once
  private readonly trees = new Map<string, ReadonlyMap<string, File>>();
  private readonly patches = new Map<string, ReturnType<typeof structuredPatch>>();
  private writes = new AbortController();

  constructor(
    private readonly seed: Objects,
    private readonly layer: Objects,
    // the demo moves seed dates without rehashing their commits
    private readonly shown: (date: string) => string = (date) => date,
  ) {}

  restore(objects: Objects): void {
    this.writes.abort();
    this.writes = new AbortController();
    Object.assign(this.layer, structuredClone(objects));
    this.reached.clear();
  }

  /** Whether a tree is in the repo. */
  has(tree: string): boolean {
    return (this.layer.trees[tree] ?? this.seed.trees[tree]) !== undefined;
  }

  private find<Value>(store: (objects: Objects) => Record<string, Value>, sha: string): Value {
    const found = store(this.layer)[sha] ?? store(this.seed)[sha];
    if (found === undefined) {
      throw new GitError(`No object ${sha}`, 404);
    }
    return found;
  }

  refs(): Record<string, string> {
    const merged = { ...this.seed.refs, ...this.layer.refs };
    return Object.fromEntries(
      Object.entries(merged).flatMap(([name, sha]) => (sha === null ? [] : [[name, sha]])),
    );
  }

  /** A commit sha, a full ref, or a branch name. */
  resolve(rev: string): string {
    if (this.layer.commits[rev] !== undefined || this.seed.commits[rev] !== undefined) {
      return rev;
    }
    const sha = this.refs()[rev.startsWith("refs/") ? rev : `refs/heads/${rev}`];
    if (sha === undefined) {
      throw new GitError(`No commit or branch ${rev}`, 404);
    }
    return sha;
  }

  commit(sha: string): CommitObject {
    return this.find((objects) => objects.commits, sha);
  }

  text(sha: string): string {
    return this.find((objects) => objects.blobs, sha);
  }

  /** Every blob under a commit's tree, by path, as a copy the caller may change. */
  files(commit: string): Map<string, File> {
    return this.treeFiles(this.commit(this.resolve(commit)).tree);
  }

  /** Every blob under a tree, by path, as a copy the caller may change. */
  treeFiles(root: string): Map<string, File> {
    const known = this.trees.get(root);
    if (known !== undefined) {
      return new Map(known);
    }
    const files = new Map<string, File>();
    const walk = (tree: string, prefix: string) => {
      for (const entry of this.find((objects) => objects.trees, tree)) {
        if (entry.type === "tree") {
          walk(entry.sha, `${prefix}${entry.name}/`);
        } else {
          files.set(`${prefix}${entry.name}`, { mode: entry.mode, sha: entry.sha });
        }
      }
    };
    walk(root, "");
    this.trees.set(root, new Map(files));
    return files;
  }

  /** The tree or blob at `path` under a commit (the root tree for ""). */
  entryAt(commit: string, path: string): Entry | undefined {
    let entry: Entry | undefined = {
      name: "",
      mode: "40000",
      type: "tree",
      sha: this.commit(this.resolve(commit)).tree,
    };
    for (const name of path === "" ? [] : path.split("/")) {
      const tree: Entry | undefined = entry;
      entry =
        tree?.type === "tree"
          ? this.find((objects) => objects.trees, tree.sha).find((item) => item.name === name)
          : undefined;
    }
    return entry;
  }

  async putBlob(text: string): Promise<string> {
    const { signal } = this.writes;
    const sha = await hashObject("blob", blobBytes(text));
    signal.throwIfAborted();
    this.layer.blobs[sha] ??= text;
    return sha;
  }

  async putFiles(files: ReadonlyMap<string, File>): Promise<string> {
    const { signal } = this.writes;
    const { blobs, trees: children } = splitTree(files);
    const entries = [...blobs].map(([name, file]): Entry => ({
      name,
      mode: file.mode,
      type: "blob",
      sha: file.sha,
    }));
    const trees = await Promise.all(
      [...children].map(async ([name, inner]): Promise<Entry> => ({
        name,
        mode: "40000",
        type: "tree",
        sha: await this.putFiles(inner),
      })),
    );
    const sorted = sortTree([...entries, ...trees]);
    const sha = await hashObject("tree", treeBytes(sorted));
    signal.throwIfAborted();
    this.layer.trees[sha] ??= sorted;
    return sha;
  }

  async putCommit(
    tree: string,
    parents: readonly string[],
    message: string,
    who: Person,
  ): Promise<string> {
    const { signal } = this.writes;
    const sha = await hashObject(
      "commit",
      commitBytes({ tree, parents, message, author: who, committer: who }),
    );
    signal.throwIfAborted();
    this.layer.commits[sha] ??= {
      tree,
      parents: [...parents],
      message,
      author: who,
      committer: who,
    };
    return sha;
  }

  setRef(name: string, sha: string | null): void {
    this.layer.refs[name] = sha;
  }

  ancestors(sha: string): ReadonlySet<string> {
    const known = this.reached.get(sha);
    if (known !== undefined) {
      return known;
    }
    const seen = new Set<string>();
    const queue = [sha];
    for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(...this.commit(next).parents);
      }
    }
    this.reached.set(sha, seen);
    return seen;
  }

  /** Git's merge-base, the common ancestor no other common ancestor reaches. */
  mergeBase(left: string, right: string): string {
    const base = commonBase((sha) => this.ancestors(sha), left, right);
    if (base === undefined) {
      throw new GitError("No common ancestor", 422);
    }
    return base;
  }

  /** A three-way merge by path that conflicts (409) where both sides differ. */
  mergeFiles(ours: string, theirs: string): Map<string, File> {
    const origin = this.files(this.mergeBase(ours, theirs));
    const left = this.files(ours);
    const right = this.files(theirs);
    const merged = new Map<string, File>();
    for (const path of new Set([...origin.keys(), ...left.keys(), ...right.keys()])) {
      // the registry is rebuilt from the merged tasks, so it never conflicts
      if (path === EVAL_REGISTRY_PATH) {
        continue;
      }
      const pick = pick3(
        origin.get(path),
        left.get(path),
        right.get(path),
        (x, y) => x?.sha === y?.sha,
      );
      if (pick === null) {
        throw new GitError(`Merge conflict in ${path}`, 409);
      }
      if (pick !== undefined) {
        merged.set(path, pick);
      }
    }
    return merged;
  }

  /** A merge commit of `theirs` into `ours`, without moving any ref. */
  async mergeCommit(ours: string, theirs: string, message: string, who: Person): Promise<string> {
    const tree = await this.putFiles(await this.withRegistry(this.mergeFiles(ours, theirs)));
    return this.putCommit(tree, [ours, theirs], message, who);
  }

  /** The files with `evals/registry.json` rewritten from their tasks, as the agent template's pre-commit hook does. */
  async withRegistry(files: ReadonlyMap<string, File>): Promise<Map<string, File>> {
    const texts = new Map(
      [...files].flatMap(([path, file]) =>
        path.startsWith(`${TASKS}/`) ? [[path, this.text(file.sha)] as const] : [],
      ),
    );
    const registry = registryOf(texts);
    const next = new Map(files);
    if (registry === undefined) {
      next.delete(EVAL_REGISTRY_PATH);
    } else {
      next.set(EVAL_REGISTRY_PATH, { mode: "100644", sha: await this.putBlob(registry) });
    }
    return next;
  }

  /** GitHub's `refs/pull/<n>/merge`, dated by its newer parent so its sha is stable, or null on a conflict. */
  async testMerge(base: string, head: string): Promise<string | null> {
    try {
      const [left, right] = [this.commit(base).committer.date, this.commit(head).committer.date];
      return await this.mergeCommit(base, head, `Merge ${head} into ${base}\n`, {
        name: "Grounded",
        email: "noreply@grounded.ai",
        date: left > right ? left : right,
      });
    } catch (error) {
      if (error instanceof GitError && error.status === 409) {
        return null;
      }
      throw error;
    }
  }

  repoCommit(sha: string): Commit {
    const { message, author, committer, tree, parents } = this.commit(sha);
    return {
      sha,
      commit: {
        message,
        author: { ...author, date: this.shown(author.date) },
        committer: { ...committer, date: this.shown(committer.date) },
        tree: { sha: tree },
      },
      parents: parents.map((parent) => ({ sha: parent })),
    };
  }

  /** A file as the contents API returns it. */
  contentFile(path: string, sha: string): ContentFile {
    const text = this.text(sha);
    return {
      type: "file",
      name: path.slice(path.lastIndexOf("/") + 1),
      path,
      sha,
      encoding: "base64",
      size: blobBytes(text).length,
      content: encode(text),
    };
  }

  getContent(path: string, ref: string): ContentFile | ContentEntry[] {
    const entry = this.entryAt(ref, path);
    if (entry === undefined) {
      throw new GitError(`No ${path} at ${ref}`, 404);
    }
    if (entry.type === "blob") {
      return this.contentFile(path, entry.sha);
    }
    const prefix = path === "" ? "" : `${path}/`;
    return this.find((objects) => objects.trees, entry.sha).map((item) => ({
      type: item.type === "tree" ? ("dir" as const) : ("file" as const),
      name: item.name,
      path: `${prefix}${item.name}`,
      sha: item.sha,
      size: item.type === "tree" ? 0 : blobBytes(this.text(item.sha)).length,
    }));
  }

  private firstParents(from: string, until: ReadonlySet<string>): string[] {
    const walked: string[] = [];
    for (
      let at: string | undefined = from;
      at !== undefined && !until.has(at);
      at = this.commit(at).parents[0]
    ) {
      walked.push(at);
    }
    return walked;
  }

  /** Paths whose blob or mode differs between two commits. */
  changedPaths(before: string | null, after: string): string[] {
    const old = before === null ? new Map<string, File>() : this.files(before);
    const now = this.files(after);
    return [...new Set([...old.keys(), ...now.keys()])].filter((path) => {
      const [was, is] = [old.get(path), now.get(path)];
      return was?.sha !== is?.sha || was?.mode !== is?.mode;
    });
  }

  compare(baseRev: string, headRev: string): Comparison {
    const base = this.resolve(baseRev);
    const head = this.resolve(headRev);
    const mergeBase = this.mergeBase(base, head);
    const ahead = this.firstParents(head, this.ancestors(base));
    const behind = this.firstParents(base, this.ancestors(head));
    const before = this.files(mergeBase);
    const after = this.files(head);
    const files = [...new Set([...before.keys(), ...after.keys()])]
      .toSorted()
      .flatMap((path): Comparison["files"] => {
        const [old, now] = [before.get(path), after.get(path)];
        if (old?.sha === now?.sha) {
          return [];
        }
        const pair = `${path}:${old?.sha ?? ""}:${now?.sha ?? ""}`;
        const patch =
          this.patches.get(pair) ??
          structuredPatch(path, path, old ? this.text(old.sha) : "", now ? this.text(now.sha) : "");
        this.patches.set(pair, patch);
        const lines = patch.hunks.flatMap((hunk) => hunk.lines);
        const additions = lines.filter((line) => line.startsWith("+")).length;
        const deletions = lines.filter((line) => line.startsWith("-")).length;
        const text = patch.hunks
          .map((hunk) =>
            [
              `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
              ...hunk.lines,
            ].join("\n"),
          )
          .join("\n");
        const status = old === undefined ? "added" : now === undefined ? "removed" : "modified";
        return [
          {
            sha: now?.sha ?? old?.sha ?? "",
            filename: path,
            status,
            additions,
            deletions,
            changes: additions + deletions,
            patch: text,
          },
        ];
      });
    const status =
      ahead.length > 0
        ? behind.length > 0
          ? "diverged"
          : "ahead"
        : behind.length > 0
          ? "behind"
          : "identical";
    return {
      status,
      ahead_by: ahead.length,
      behind_by: behind.length,
      total_commits: ahead.length,
      base_commit: this.repoCommit(base),
      merge_base_commit: this.repoCommit(mergeBase),
      // GitHub lists the head's own commits oldest first
      commits: ahead.toReversed().map((sha) => this.repoCommit(sha)),
      files,
    };
  }

  /** GitHub's list commits, newest first, touching `path` when given, from `since`. */
  listCommits(options: {
    sha?: string | undefined;
    path?: string | undefined;
    since?: string | undefined;
  }): Commit[] {
    const { path, since } = options;
    // the file's blob or the folder's tree at a commit, as GitHub's path filter compares either
    const entryAt = (sha: string | undefined) =>
      sha === undefined || path === undefined ? undefined : this.entryAt(sha, path)?.sha;
    const shas = [...this.ancestors(this.resolve(options.sha ?? "main"))].filter(
      (sha) => path === undefined || entryAt(sha) !== entryAt(this.commit(sha).parents[0]),
    );
    return shas
      .flatMap((sha) =>
        since === undefined || this.commit(sha).committer.date >= since
          ? [this.repoCommit(sha)]
          : [],
      )
      .toSorted((left, right) =>
        right.commit.committer.date.localeCompare(left.commit.committer.date),
      );
  }
}
