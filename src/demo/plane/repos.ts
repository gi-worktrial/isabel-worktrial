import type { ProductClient } from "#src/queries/client";

import { must, type Plane, refusal } from "./access.ts";
import { decode, GitError } from "./git.ts";
import { connectedRepository } from "./github.ts";
import { MAIN } from "./paths.ts";

/** Merges `theirs` into a branch as the viewer and moves it, or undefined when the branch already has it. */
export type MergeBranch = (
  branch: string,
  theirs: string,
  message: string,
) => Promise<string | undefined>;

// the git service refuses every push or commit that changes Grounded's own files
const PROTECTED = ".grounded/";

const ref = (at: string | undefined) => at ?? MAIN;

/** The git service's repository and refs, where every branch move runs `pushed` as the job runner sees a push. */
export function reposResource(
  { seed, git, head, signature, read, write }: Plane,
  pushed: (branch: string, before: string | null, after: string) => Promise<void>,
): Pick<ProductClient, "repos" | "git"> & { mergeBranch: MergeBranch } {
  const mergeBranch: MergeBranch = async (branch, theirs, message) => {
    const ours = git.resolve(branch);
    if (git.ancestors(ours).has(theirs)) {
      return undefined;
    }
    const merged = await git.mergeCommit(ours, theirs, message, signature());
    git.setRef(`refs/heads/${branch}`, merged);
    await pushed(branch, ours, merged);
    return merged;
  };
  return {
    mergeBranch,
    repos: {
      list: () => read(() => [connectedRepository(seed.repository)]),
      create: () => read(refusal("The demo can't create repositories")),
      get: ({ repo }) => read(() => connectedRepository(repo), repo),
      listBranches: ({ repo }) =>
        read(
          () =>
            Object.entries(git.refs()).flatMap(([refName, sha]) =>
              refName.startsWith("refs/heads/") && sha !== null
                ? [{ name: refName.slice("refs/heads/".length), commit: { sha } }]
                : [],
            ),
          repo,
        ),
      listCommits: ({ repo, sha, path, since, per_page = 30, page = 1 }) =>
        read(
          () => git.listCommits({ sha, path, since }).slice((page - 1) * per_page, page * per_page),
          repo,
        ),
      compareCommits: ({ repo, basehead }) =>
        read(() => {
          const [base, to, extra] = basehead.split("...");
          if (base === undefined || to === undefined || extra !== undefined) {
            throw new GitError("Not Found", 404);
          }
          return git.compare(base, to);
        }, repo),
      createCommitOnBranch: ({ repo, branch, expectedHeadOid, message, fileChanges }) =>
        write(async () => {
          const before = must(head(branch), "Branch not found");
          if (before !== expectedHeadOid) {
            throw new GitError("Branch head has moved", 409);
          }
          const changed = [
            ...(fileChanges.additions ?? []).map((file) => file.path),
            ...(fileChanges.deletions ?? []).map((file) => file.path),
          ];
          if (changed.some((path) => path.startsWith(PROTECTED))) {
            throw new GitError(`${PROTECTED} is Grounded's, so it can't change`, 403);
          }
          const parent = git.resolve(expectedHeadOid);
          const files = git.files(parent);
          for (const { path } of fileChanges.deletions ?? []) {
            if (!files.delete(path)) {
              throw new GitError(`No ${path} to delete`, 422);
            }
          }
          const blobs = await Promise.all(
            (fileChanges.additions ?? []).map(async (file) => ({
              path: file.path,
              sha: await git.putBlob(decode(file.contents)),
              mode: files.get(file.path)?.mode ?? "100644",
            })),
          );
          for (const { path, sha, mode } of blobs) {
            files.set(path, { mode, sha });
          }
          const tree = await git.putFiles(await git.withRegistry(files));
          const text = message.body ? `${message.headline}\n\n${message.body}` : message.headline;
          const commit = await git.putCommit(tree, [parent], text, signature());
          git.setRef(`refs/heads/${branch}`, commit);
          await pushed(branch, before, commit);
          return { commit: { oid: commit } };
        }, repo),
      merge: ({ repo, base, head: from, commit_message }) =>
        write(async () => {
          const sha = await mergeBranch(
            base,
            git.resolve(from),
            commit_message ?? `Merge ${from} into ${base}`,
          );
          return sha === undefined ? undefined : git.repoCommit(sha);
        }, repo),
      getContent: ({ repo, path, ref: at }) =>
        read(() => git.getContent(path ?? "", ref(at)), repo),
      listContents: ({ repo, path, ref: at }) =>
        read(() => {
          const prefix = path === undefined || path === "" ? "" : `${path.replace(/\/$/u, "")}/`;
          const commit = git.resolve(ref(at));
          const files = [...git.files(commit)].filter(([file]) => file.startsWith(prefix));
          if (prefix !== "" && files.length === 0) {
            throw new GitError(`No ${path} at ${ref(at)}`, 404);
          }
          return files.map(([file, entry]) => git.contentFile(file, entry.sha));
        }, repo),
    },
    git: {
      listMatchingRefs: ({ repo, ref: prefix }) =>
        read(
          () =>
            Object.entries(git.refs()).flatMap(([refName, sha]) =>
              refName.startsWith(`refs/${prefix}`) && sha !== null
                ? [{ ref: refName, object: { type: "commit", sha } }]
                : [],
            ),
          repo,
        ),
      // a new branch has no commits of its own yet, so no push trigger fires until one lands
      createRef: ({ repo, ref: refName, sha }) =>
        write(() => {
          if (!refName.startsWith("refs/heads/") || git.refs()[refName] !== undefined) {
            throw new GitError("Reference already exists", 422);
          }
          const at = git.resolve(sha);
          git.setRef(refName, at);
          return { ref: refName, object: { type: "commit", sha: at } };
        }, repo),
    },
  };
}
