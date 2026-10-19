import { z } from "zod";
import { type Api, query } from "./api.ts";

const repositorySchema = z.object({
  name: z.string(),
  default_branch: z.string(),
  /** The GitHub repository a connected repository forwards to. */
  github: z.object({ full_name: z.string(), html_url: z.string() }).optional(),
});
export const branchSchema = z.object({ name: z.string(), commit: z.object({ sha: z.string() }) });
const contentFileSchema = z.object({
  type: z.literal("file"),
  name: z.string(),
  path: z.string(),
  sha: z.string(),
  encoding: z.literal("base64"),
  size: z.number(),
  content: z.string(),
});
const contentEntrySchema = z.object({
  type: z.enum(["file", "dir", "symlink", "submodule"]),
  name: z.string(),
  path: z.string(),
  sha: z.string(),
  size: z.number(),
});
const nestedEntrySchema = contentEntrySchema.extend({
  encoding: z.literal("base64").optional(),
  /** Base64, on files up to 1 MiB. */
  content: z.string().optional(),
});
/** A full 40-character commit SHA. */
export const shaSchema = z.string().regex(/^[0-9a-f]{40}$/);
const identitySchema = z.object({ name: z.string(), email: z.string(), date: z.string() });
export const commitSchema = z.object({
  sha: z.string(),
  commit: z.object({
    message: z.string(),
    author: identitySchema,
    committer: identitySchema,
    tree: z.object({ sha: z.string() }),
  }),
  parents: z.array(z.object({ sha: z.string() })),
});
/** A file a comparison or pull request changes, with its `patch`. */
export const fileSchema = z.object({
  sha: z.string(),
  filename: z.string(),
  status: z.enum(["added", "removed", "modified", "renamed", "copied", "changed", "unchanged"]),
  previous_filename: z.string().optional(),
  additions: z.number(),
  deletions: z.number(),
  changes: z.number(),
  patch: z.string().optional(),
});
export const comparisonSchema = z.object({
  status: z.enum(["ahead", "behind", "identical", "diverged"]),
  ahead_by: z.number(),
  behind_by: z.number(),
  total_commits: z.number(),
  base_commit: commitSchema,
  merge_base_commit: commitSchema,
  commits: z.array(commitSchema),
  files: z.array(fileSchema),
});
export const refSchema = z.object({
  ref: z.string(),
  object: z.object({ type: z.string(), sha: z.string() }),
});
export const createdCommitSchema = z.object({ commit: z.object({ oid: z.string() }) });
export const contentSchema = z.union([contentFileSchema, z.array(contentEntrySchema)]);

export type Repository = z.infer<typeof repositorySchema>;
export type Ref = z.infer<typeof refSchema>;
export type Branch = z.infer<typeof branchSchema>;
export type ContentFile = z.infer<typeof contentFileSchema>;
export type ContentEntry = z.infer<typeof contentEntrySchema>;
export type NestedEntry = z.infer<typeof nestedEntrySchema>;

export type Commit = z.infer<typeof commitSchema>;
export type Comparison = z.infer<typeof comparisonSchema>;

export type ListReposOptions = {
  page?: number | undefined;
  per_page?: number | undefined;
};

export type GetContentOptions = {
  repo: string;
  /** Empty or omitted for the repository root. */
  path?: string | undefined;
  /** Branch, tag, or commit (defaults to the default branch). */
  ref?: string | undefined;
};

export type ListCommitsOptions = {
  repo: string;
  /** Branch, tag, or commit to list from (defaults to the default branch). */
  sha?: string | undefined;
  /** Only commits touching this file or directory. */
  path?: string | undefined;
  /** ISO 8601: only commits committed at or after it. */
  since?: string | undefined;
  page?: number | undefined;
  per_page?: number | undefined;
};

/** GitHub GraphQL's `createCommitOnBranch` input, with the branch named in the repository. */
export type CreateCommitOnBranchOptions = {
  repo: string;
  branch: string;
  /** The head the changes are based on (a branch that has moved since is refused with a 409). */
  expectedHeadOid: string;
  message: { headline: string; body?: string | undefined };
  fileChanges: {
    /** File contents in base64. */
    additions?: { path: string; contents: string }[] | undefined;
    deletions?: { path: string }[] | undefined;
  };
};

export type MergeOptions = {
  repo: string;
  base: string;
  head: string;
  commit_message?: string | undefined;
};

/** Git references, following Octokit's `git` methods with the owner fixed to the client's organization. */
export class Git {
  constructor(private readonly api: Api) {}

  /** Refs under `refs/<ref>` (such as `heads/` for every branch), as fully qualified names. */
  listMatchingRefs({ repo, ref }: { repo: string; ref: string }): Promise<Ref[]> {
    const encoded = ref.split("/").map(encodeURIComponent).join("/");
    return this.api.json(
      `/repos/${encodeURIComponent(repo)}/git/matching-refs/${encoded}`,
      z.array(refSchema),
    );
  }

  /** A new ref such as `refs/heads/<branch>` at the commit `sha`, checked against the rulesets (needs `repo:write`). */
  createRef({ repo, ...input }: { repo: string; ref: string; sha: string }): Promise<Ref> {
    return this.api.json(`/repos/${encodeURIComponent(repo)}/git/refs`, refSchema, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }
}

/** Repositories, following Octokit's `repos` methods with the owner fixed to the client's organization. */
export class Repos {
  constructor(private readonly api: Api) {}

  list(options: ListReposOptions = {}): Promise<Repository[]> {
    return this.api.json(`/repos${query(options)}`, z.array(repositorySchema));
  }

  /** A hosted repository, or with `github` (`owner/name`) a connected one (needs `repo:manage`). */
  create(input: { name: string; github?: string | undefined }): Promise<Repository> {
    return this.api.json("/repos", repositorySchema, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  get({ repo }: { repo: string }): Promise<Repository> {
    return this.api.json(`/repos/${encodeURIComponent(repo)}`, repositorySchema);
  }

  listBranches({ repo }: { repo: string }): Promise<Branch[]> {
    return this.api.json(`/repos/${encodeURIComponent(repo)}/branches`, z.array(branchSchema));
  }

  /** Commits newest first, with full messages (so trailers can be read). */
  listCommits({ repo, ...options }: ListCommitsOptions): Promise<Commit[]> {
    return this.api.json(
      `/repos/${encodeURIComponent(repo)}/commits${query(options)}`,
      z.array(commitSchema),
    );
  }

  /** Compares `base...head` (files are diffed against the merge base). */
  compareCommits({ repo, basehead }: { repo: string; basehead: string }): Promise<Comparison> {
    const encoded = basehead.split("/").map(encodeURIComponent).join("/");
    return this.api.json(`/repos/${encodeURIComponent(repo)}/compare/${encoded}`, comparisonSchema);
  }

  /** Commits to a branch as the token's user (needs `repo:write`). */
  createCommitOnBranch({
    repo,
    ...input
  }: CreateCommitOnBranchOptions): Promise<z.infer<typeof createdCommitSchema>> {
    return this.api.json(`/repos/${encodeURIComponent(repo)}/commits`, createdCommitSchema, {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  /** Merges `head` into the `base` branch, resolving `undefined` when it's already merged (a conflict is a 409). */
  async merge({ repo, ...input }: MergeOptions): Promise<Commit | undefined> {
    const response = await this.api.request(`/repos/${encodeURIComponent(repo)}/merges`, {
      method: "POST",
      body: JSON.stringify(input),
    });

    return response.status === 204 ? undefined : commitSchema.parse(await response.json());
  }

  /** A file with base64 content, or a directory's entries. */
  getContent({ repo, path, ref }: GetContentOptions): Promise<ContentFile | ContentEntry[]> {
    const encoded = (path ?? "").split("/").map(encodeURIComponent).join("/");
    return this.api.json(
      `/repos/${encodeURIComponent(repo)}/contents/${encoded}${query({ ref })}`,
      contentSchema,
    );
  }

  /** Every entry under a directory except subdirectories, with the content of each file up to 1 MiB. */
  listContents({ repo, path, ref }: GetContentOptions): Promise<NestedEntry[]> {
    const encoded = (path ?? "").split("/").map(encodeURIComponent).join("/");
    return this.api.json(
      `/repos/${encodeURIComponent(repo)}/contents/${encoded}${query({ ref, recursive: 1 })}`,
      z.array(nestedEntrySchema),
    );
  }
}

/** The text of a file read through the contents API. */
export function decodeContent(
  file: ContentFile | ContentEntry[] | Pick<NestedEntry, "content">,
  path: string,
) {
  if (Array.isArray(file)) {
    throw new Error(`${path} is a directory`);
  }
  if (file.content === undefined) {
    throw new Error(`${path} is too large to read`);
  }

  return new TextDecoder().decode(
    Uint8Array.from(atob(file.content), (char) => char.charCodeAt(0)),
  );
}
