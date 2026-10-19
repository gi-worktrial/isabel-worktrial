import type { ProductClient } from "#src/queries/client";
import type { Pull } from "#src/sdk/index";

import { must, type Plane } from "./access.ts";
import { GitError, gitDate } from "./git.ts";
import type { MergeBranch } from "./repos.ts";
import type { PullRecord } from "./seed/types.ts";

/** The git service's pull requests: the seed's, with the viewer's changes and new ones saved in `layer`. */
export function pullsService(
  { seed, git, now, head, read, write }: Plane,
  layer: { pulls: PullRecord[] },
  hooks: {
    /** The author of the viewer's pull requests. */
    user: string;
    /** Queues the pull request's `pull_request` runs, as the job runner does when one opens or moves. */
    opened(pull: PullRecord): Promise<void>;
    mergeBranch: MergeBranch;
  },
) {
  // test merges are deterministic, so each pair is merged once
  const testMerges = new Map<string, Promise<string | null>>();
  const testMerge = (base: string, headSha: string) => {
    const key = `${base}:${headSha}`;
    const known = testMerges.get(key) ?? git.testMerge(base, headSha);
    testMerges.set(key, known);
    return known;
  };
  const records = () => {
    const changed = new Map(layer.pulls.map((record) => [record.number, record]));
    return [
      ...seed.pulls.map((record) => changed.get(record.number) ?? record),
      ...layer.pulls.filter(
        (record) => !seed.pulls.some((entry) => entry.number === record.number),
      ),
    ];
  };
  const view = async (record: PullRecord): Promise<Pull> => {
    const open = record.closed_at === null;
    const baseSha = head(record.base) ?? record.merge_commit_sha;
    const headSha = open ? (head(record.head) ?? null) : record.head_sha;
    // a deleted head branch leaves nothing to merge
    const testable = open && baseSha !== null && headSha !== null;
    const merge = testable ? await testMerge(baseSha, headSha) : null;
    return {
      number: record.number,
      state: open ? "open" : "closed",
      title: record.title,
      body: record.body,
      labels: record.labels.map((name) => ({ name })),
      head: { ref: record.head, sha: headSha },
      base: { ref: record.base, sha: baseSha },
      user: { login: record.user },
      created_at: record.created_at,
      updated_at: record.updated_at,
      closed_at: record.closed_at,
      merged_at: record.merged_at,
      merged: record.merged_at !== null,
      mergeable: testable ? merge !== null : null,
      mergeable_state: !testable ? "unknown" : merge === null ? "dirty" : "clean",
      merge_commit_sha: open ? merge : record.merge_commit_sha,
      merged_by: null,
    };
  };
  const recordOf = (number: number) =>
    must(
      records().find((record) => record.number === number),
      "Pull request not found",
    );
  const save = (record: PullRecord) => {
    layer.pulls = [...layer.pulls.filter((entry) => entry.number !== record.number), record];
  };
  const saveMerged = (record: PullRecord, head_sha: string, merge_commit_sha: string) => {
    const at = gitDate(now());
    save({ ...record, updated_at: at, closed_at: at, merged_at: at, head_sha, merge_commit_sha });
  };
  const relabeled = (pull_number: number, labels: (current: string[]) => string[]) =>
    write(() => {
      const record = recordOf(pull_number);
      const next = { ...record, labels: labels(record.labels), updated_at: gitDate(now()) };
      save(next);
      return next.labels.map((name) => ({ name }));
    });

  const resource: ProductClient["pulls"] = {
    list: ({ repo, state = "open", head: from, base, labels, per_page = 30, page = 1 }) =>
      read(async () => {
        const views = await Promise.all(records().map(view));
        return views
          .filter(
            (pull) =>
              (state === "all" || pull.state === state) &&
              (from === undefined || pull.head.ref === from) &&
              (base === undefined || pull.base.ref === base) &&
              (labels ?? []).every((label) => pull.labels.some(({ name }) => name === label)),
          )
          .toSorted((left, right) => right.number - left.number)
          .slice((page - 1) * per_page, page * per_page);
      }, repo),
    get: ({ repo, pull_number }) => read(() => view(recordOf(pull_number)), repo),
    create: ({ repo, title, head: from, base, body }) =>
      write(async () => {
        if (head(from) === undefined || head(base) === undefined) {
          throw new GitError("Both branches must exist", 422);
        }
        if (records().some((record) => record.head === from && record.closed_at === null)) {
          throw new GitError("A pull request already exists for this branch", 422);
        }
        const at = gitDate(now());
        const record: PullRecord = {
          number: Math.max(0, ...records().map((entry) => entry.number)) + 1,
          title,
          body: body ?? null,
          labels: [],
          head: from,
          base,
          user: hooks.user,
          created_at: at,
          updated_at: at,
          closed_at: null,
          merged_at: null,
          head_sha: null,
          merge_commit_sha: null,
        };
        save(record);
        await hooks.opened(record);
        return view(record);
      }, repo),
    update: ({ repo, pull_number, state, title, body }) =>
      write(async () => {
        const record = recordOf(pull_number);
        const at = gitDate(now());
        const closing = state === "closed" && record.closed_at === null;
        const next: PullRecord = {
          ...record,
          title: title ?? record.title,
          body: body ?? record.body,
          updated_at: at,
          closed_at: closing ? at : record.closed_at,
          head_sha: closing ? (head(record.head) ?? null) : record.head_sha,
        };
        save(next);
        return view(next);
      }, repo),
    listFiles: ({ repo, pull_number, page = 1, per_page = 30 }) =>
      read(async () => {
        const pull = await view(recordOf(pull_number));
        if (pull.base.sha === null || pull.head.sha === null) {
          return [];
        }
        return git
          .compare(pull.base.sha, pull.head.sha)
          .files.slice((page - 1) * per_page, page * per_page);
      }, repo),
    merge: ({ repo, pull_number, sha, commit_title, commit_message }) =>
      write(async () => {
        const record = recordOf(pull_number);
        const pull = await view(record);
        if (pull.state !== "open") {
          throw new GitError("Pull request is not open", 405);
        }
        if (sha !== undefined && sha !== pull.head.sha) {
          throw new GitError("Head branch was modified", 409);
        }
        const [from, into] = [pull.head.sha, pull.base.sha];
        if (pull.mergeable !== true || from === null || into === null) {
          throw new GitError("Pull request is not mergeable", 405);
        }
        const title = commit_title ?? `Merge pull request #${pull_number} from ${record.head}`;
        const message = commit_message ? `${title}\n\n${commit_message}` : title;
        const merged = (await hooks.mergeBranch(record.base, from, message)) ?? into;
        saveMerged(record, from, merged);
        return { sha: merged, merged: true, message: "Pull Request successfully merged" };
      }, repo),
    addLabels: ({ pull_number, labels }) =>
      relabeled(pull_number, (current) => [...new Set([...current, ...labels])]),
    removeLabel: ({ pull_number, name }) =>
      relabeled(pull_number, (current) => current.filter((label) => label !== name)),
  };

  return {
    resource,
    records,
    view,
    recordOf,
    /** Marks merged each open pull request into `branch` whose head it now reaches, as GitHub does. */
    reached(branch: string, after: string) {
      for (const record of records()) {
        const reachedHead = head(record.head);
        if (
          record.closed_at === null &&
          record.base === branch &&
          reachedHead !== undefined &&
          git.ancestors(after).has(reachedHead)
        ) {
          saveMerged(record, reachedHead, after);
        }
      }
    },
    reset: () => testMerges.clear(),
  };
}
