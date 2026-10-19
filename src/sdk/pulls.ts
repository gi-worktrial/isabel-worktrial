import { z } from "zod";
import { type Api, query } from "./api.ts";
import { fileSchema } from "./repos.ts";

export const getTestMergeRef = (pull_number: number) => `refs/pull/${pull_number}/merge`;

export const labelSchema = z.object({ name: z.string() });
const userSchema = z.object({ login: z.string() });
export const pullSchema = z.object({
  number: z.number(),
  state: z.enum(["open", "closed"]),
  title: z.string(),
  body: z.string().nullable(),
  user: userSchema,
  labels: z.array(labelSchema),
  /** Where the branch points while open, then where it pointed at close or merge (`null` if deleted while open). */
  head: z.object({ ref: z.string(), sha: z.string().nullable() }),
  /** Where the branch points while open, then where it pointed at close or merge (`null` if deleted while open). */
  base: z.object({ ref: z.string(), sha: z.string().nullable() }),
  merged: z.boolean(),
  /** Computed only when reading a single open pull request, as on GitHub (`null` otherwise). */
  mergeable: z.boolean().nullable(),
  /** `unknown` when mergeability wasn't computed. */
  mergeable_state: z.enum([
    "clean",
    "dirty",
    "behind",
    "blocked",
    "unstable",
    "has_hooks",
    "draft",
    "unknown",
  ]),
  /** The merge commit once merged, or a single open pull request's test merge at `refs/pull/<number>/merge` (`null` when it conflicts). */
  merge_commit_sha: z.string().nullable(),
  merged_by: userSchema.nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  closed_at: z.string().nullable(),
  merged_at: z.string().nullable(),
});
const mergeResultSchema = z.object({ sha: z.string(), merged: z.boolean(), message: z.string() });

export type Pull = z.infer<typeof pullSchema>;
export type PullFile = z.infer<typeof fileSchema>;
export type Label = z.infer<typeof labelSchema>;

type PullTarget = { repo: string; pull_number: number };
type ListPage = { page?: number | undefined; per_page?: number | undefined };

export type CreatePullOptions = {
  repo: string;
  title: string;
  /** The branch with the changes. */
  head: string;
  /** The branch to merge into (any branch, so pull requests can stack). */
  base: string;
  body?: string | undefined;
};

export type ListPullsOptions = {
  repo: string;
  state?: "open" | "closed" | "all" | undefined;
  head?: string | undefined;
  base?: string | undefined;
  /** Only pull requests with every one of these labels. */
  labels?: string[] | undefined;
  page?: number | undefined;
  per_page?: number | undefined;
};

export type UpdatePullOptions = PullTarget & {
  title?: string | undefined;
  body?: string | undefined;
  state?: "closed" | undefined;
};

export type MergePullOptions = PullTarget & {
  commit_title?: string | undefined;
  commit_message?: string | undefined;
  /** The head the merge must be of (a head that has moved since is refused with a 409). */
  sha?: string | undefined;
};

/** Pull requests, following Octokit's `pulls` methods with the owner fixed to the client's organization. */
export class Pulls {
  constructor(private readonly api: Api) {}

  create({ repo, ...input }: CreatePullOptions): Promise<Pull> {
    return this.api.json(`/repos/${encodeURIComponent(repo)}/pulls`, pullSchema, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  list({ repo, labels, ...options }: ListPullsOptions): Promise<Pull[]> {
    return this.api.json(
      `/repos/${encodeURIComponent(repo)}/pulls${query({ ...options, labels: labels?.join(",") })}`,
      z.array(pullSchema),
    );
  }

  /** A pull request, with its test merge of the branches' current heads (the same heads always give the same commit). */
  get(target: PullTarget): Promise<Pull> {
    return this.api.json(pullPath(target), pullSchema);
  }

  update({ repo, pull_number, ...input }: UpdatePullOptions): Promise<Pull> {
    return this.api.json(pullPath({ repo, pull_number }), pullSchema, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  }

  /** Files diffed against the merge base, with each one's `patch`. */
  listFiles({ page, per_page, ...target }: PullTarget & ListPage): Promise<PullFile[]> {
    return this.api.json(
      `${pullPath(target)}/files${query({ page, per_page })}`,
      z.array(fileSchema),
    );
  }

  /** Merges as the token's user, subject to the repository's rulesets (needs `repo:write`). */
  merge({ repo, pull_number, ...input }: MergePullOptions) {
    return this.api.json(`${pullPath({ repo, pull_number })}/merge`, mergeResultSchema, {
      method: "PUT",
      body: JSON.stringify(input),
    });
  }

  /** Adds labels, creating any that don't exist yet, and resolves every label the pull request has. */
  addLabels({ labels, ...target }: PullTarget & { labels: string[] }): Promise<Label[]> {
    return this.api.json(labelsPath(target), z.array(labelSchema), {
      method: "POST",
      body: JSON.stringify({ labels }),
    });
  }

  /** Removes a label (a 404 when the pull request doesn't have it), resolving the labels left. */
  removeLabel({ name, ...target }: PullTarget & { name: string }): Promise<Label[]> {
    return this.api.json(
      `${labelsPath(target)}/${encodeURIComponent(name)}`,
      z.array(labelSchema),
      { method: "DELETE" },
    );
  }
}

function pullPath({ repo, pull_number }: PullTarget) {
  return `/repos/${encodeURIComponent(repo)}/pulls/${pull_number}`;
}

// GitHub sets a pull request's labels through its issue-label routes.
function labelsPath({ repo, pull_number }: PullTarget) {
  return `/repos/${encodeURIComponent(repo)}/issues/${pull_number}/labels`;
}
