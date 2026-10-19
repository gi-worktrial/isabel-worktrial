import { type Document, parse, parseDocument, stringify } from "yaml";
import { z } from "zod";

import type { AnnotationCounts, Agents, TracePage } from "./agents.ts";
import { GroundedError } from "./api.ts";
import { EVALS_DIR, type EvalResult, type Evals, RUN_EVALS_JOB, isFullEvalRun } from "./evals.ts";
import type { JobRun, Jobs } from "./jobs.ts";
import { getTestMergeRef, type PullFile, type Pulls } from "./pulls.ts";
import {
  type Commit,
  type ContentEntry,
  type ContentFile,
  type Git,
  type NestedEntry,
  type Repos,
  decodeContent,
  shaSchema,
} from "./repos.ts";

export const SEVERITIES = ["critical", "high", "medium", "low"] as const;
export const ISSUE_STATES = ["detected", "reviewing", "resolved", "dismissed"] as const;

const ISSUES_DIR = "issues";
const ISSUE_FILE_PATTERN = /^issues\/([^/]+)\/issue\.mdx$/;
const ISSUE_REF_PATTERN = /^issue\/([^/]+)\//;
const ACTION_TRAILER_PATTERN = /^Grounded-Action: (\S+)$/m;
const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;
const CANDIDATE_REF_PATTERN = /^issue\/([^/]+)\/candidate\/([^/]+)$/;
const getIssueFileById = (id: string) => `${ISSUES_DIR}/${id}/issue.mdx`;
const getCandidateFileById = (id: string, candidate: string) =>
  `${ISSUES_DIR}/${id}/candidates/${candidate}.mdx`;
export const getEvalsBranchById = (id: string) => `issue/${id}/evals`;
export const getNotesDirById = (id: string) => `${ISSUES_DIR}/${id}/notes`;
export const getCandidateBranchById = (id: string, candidate: string) =>
  `issue/${id}/candidate/${candidate}`;
const NOT_FOUND = 404;
const CONFLICT = 409;
const PAGE_SIZE = 100;
const MAX_TRACE_FILTER = 100;

const traceIdSchema = z.string().regex(/^[0-9a-f]{32}$/i);
const frontmatterSchema = z.object({
  format: z.literal(1),
  title: z.string().min(1),
  severity: z.enum(SEVERITIES),
  state: z.enum(ISSUE_STATES),
  created: z.iso.datetime(),
  dismissal_reason: z.string().regex(/\S/).optional(),
  resolution_reason: z.string().regex(/\S/).optional(),
  /** The commit on the default branch that shipped the Issue's fix, kept if it comes back. */
  fix: shaSchema.optional(),
  /** The Candidate engineers approved and the test merge commit its results came from. */
  approved: z.object({ candidate: z.string().min(1), sha: shaSchema }).optional(),
  include: z.array(traceIdSchema),
  exclude: z.array(traceIdSchema),
});

const candidateFileSchema = z.object({
  title: z.string().min(1),
  /** Why Pebble recommends this Candidate over the others, when it does. */
  recommended: z.string().min(1).optional(),
});

export type Severity = (typeof SEVERITIES)[number];
export type IssueState = (typeof ISSUE_STATES)[number];
/**
 * What an Issue waits on: `running` while a job runs on one of its `issue/<id>/**` branches,
 * `resurfaced` when it's back in review after a fix shipped, `possible_regression` when it's
 * resolved and has an open pull request labeled `regression`, and `pending` while it's otherwise
 * an engineer's turn. Dismissed Issues and resolved ones without a regression have none.
 */
export type IssueStatus = "running" | "pending" | "resurfaced" | "possible_regression";
export type IssueSummary = {
  /** The Issue's folder under `issues/`, and the `<id>` in its `grounded/issue/<id>` annotations. */
  id: string;
  title: string;
  /** Plain-text synopsis derived from the Issue body for compact cards and rows. */
  summary: string;
  severity: Severity;
  state: IssueState;
  /** Matched traces (labeled `match`) plus `include` minus `exclude`. */
  trace_count: number;
  /** When the first matched trace started, or the Issue's creation before any match. */
  first_seen_at: string;
  /** When the last matched trace started, or the Issue's creation before any match. */
  last_seen_at: string;
  status: IssueStatus | undefined;
};
export type Issue = IssueSummary & {
  /** Why engineers dismissed the Issue, while it's dismissed. */
  dismissal_reason: string | undefined;
  /** Why engineers manually resolved the Issue, while it's resolved. */
  resolution_reason: string | undefined;
  /** The Markdown or MDX after the frontmatter. */
  body: string;
  /** The default branch commit it was read at, which an update must be made from. */
  head_oid: string;
  /** Traces engineers added that `match.sh` may not match. */
  include: string[];
  /** Traces engineers removed, even when `match.sh` matches them. */
  exclude: string[];
  approved: Approval | undefined;
  /** The commit on the default branch that shipped the Issue's fix, kept if it comes back. */
  fix: string | undefined;
};
export type Approval = {
  candidate: string;
  /** The test merge commit the approved results came from. */
  sha: string;
  /** Whether the Candidate's test merge has moved past `sha`, or its pull request is no longer open. */
  outdated: boolean;
};
export type IssueTracePage = {
  traces: TracePage["traces"];
  /** The `after` of the next page, when there is one. */
  next: string | undefined;
};
/** A commit that changed an Issue's file. */
export type IssueEvent = {
  sha: string;
  /** The commit's subject, such as `Validate issue <id>`. */
  subject: string;
  /** The state its action moved the Issue to, when it's one of the actions an engineer takes. */
  state: IssueState | undefined;
  /** The user or agent the commit is by. */
  author: string;
  /** The service that made the commit on the author's behalf, when one did. */
  via: string | undefined;
  at: string;
};

/** A proposed fix: an open pull request from `issue/<id>/candidate/<candidate>` into `issue/<id>/evals`. */
export type CandidateSummary = {
  /** The `<candidate>` in its branch name. */
  id: string;
  pull_number: number;
  /** The commit its branch points at. */
  head_sha: string;
  title: string;
  /** Why Pebble recommends it over the others, when it does. */
  recommended: string | undefined;
  /** The MDX after the frontmatter, with its rationale. */
  body: string;
  /** Undefined before its first run. */
  results: CandidateResults | undefined;
};
export type EvalTally = { passed: number; total: number };

type Baseline = { tree: string | undefined; results: EvalResult[] };

/** A Candidate's newest `run-evals` run over every Eval on its test merge, compared with its Issue's baseline. */
export type CandidateResults = {
  run: JobRun;
  /** Whether `run` tested an older test merge than the pull request's current one. */
  outdated: boolean;
  /** The Evals whose registry `issues` include the Issue, once `run` completes. */
  new_evals: EvalTally | undefined;
  /** Every other Eval, once `run` completes. */
  existing_evals: EvalTally | undefined;
  /** Existing Evals that passed in the baseline over the same `evals/` tree and fail in `run`, undefined without one. */
  regressions: string[] | undefined;
};

export type Candidate = CandidateSummary & {
  /** The files it changes other than its own `.mdx`, each with its `patch`. */
  files: PullFile[];
  /** Whether the default branch has changes outside `issues/` that the Issue's evals branch lacks. */
  evals_behind: boolean;
};

export type UpdateCandidateOptions = {
  repo: string;
  id: string;
  candidate: string;
  /** The `head_sha` the edits were made on (a branch that has moved since is refused with a 409). */
  expectedHeadOid: string;
  files: { path: string; contents: string }[];
};

export type CreateCandidateOptions = { repo: string; id: string; title: string };
export type UpdateEvalsOptions = {
  repo: string;
  id: string;
  /** The evals branch head the edits were made on (a branch that has moved since is refused with a 409). */
  expectedHeadOid: string;
  files: { path: string; contents: string }[];
};

export type UpdateNotesOptions = {
  repo: string;
  id: string;
  /** The default branch head the edits were made on (a branch that has moved since is refused with a 409). */
  expectedHeadOid: string;
  /** The new body of `issue.mdx`, under its frontmatter as it was. */
  body?: string | undefined;
  /** Files under `issues/<id>/notes/`. */
  files: { path: string; contents: string }[];
};

type IssueAction = { from: readonly IssueState[]; to: IssueState; subject: (id: string) => string };

const ISSUE_ACTION_NAMES = ["validate", "dismiss", "resolve", "reopen", "reset"] as const;
export type IssueActionName = (typeof ISSUE_ACTION_NAMES)[number];

/** What each action an engineer takes moves an Issue from and to, and the subject of its commit. */
const ISSUE_ACTIONS: Record<IssueActionName, IssueAction> = {
  validate: { from: ["detected"], to: "reviewing", subject: (id) => `Start work on issue ${id}` },
  dismiss: {
    from: ["detected", "reviewing"],
    to: "dismissed",
    subject: (id) => `Dismiss issue ${id}`,
  },
  resolve: {
    from: ["detected", "reviewing", "dismissed"],
    to: "resolved",
    subject: (id) => `Resolve issue ${id}`,
  },
  reopen: { from: ["dismissed"], to: "reviewing", subject: (id) => `Reopen issue ${id}` },
  reset: {
    from: ["reviewing", "dismissed"],
    to: "detected",
    subject: (id) => `Move issue ${id} back to detected`,
  },
};

/** The actions an Issue in `state` can take. */
export const getIssueActions = (state: IssueState) =>
  ISSUE_ACTION_NAMES.filter((action) => ISSUE_ACTIONS[action].from.includes(state));

export type IssueChange =
  | { action: "dismiss" | "resolve"; reason: string }
  | { action: Exclude<IssueActionName, "dismiss" | "resolve"> }
  | { action: "include_trace" | "exclude_trace"; trace: string }
  | { action: "approve"; candidate: string }
  | { action: "unapprove" }
  | { action: "ship"; candidate?: string };

export const CANDIDATE_STATUSES = [
  "not_shipped",
  "not_run",
  "running",
  "outdated",
  "run_failed",
  "not_fixed",
  "regresses",
  "ready",
] as const;
export type CandidateStatus = (typeof CANDIDATE_STATUSES)[number];

/** Where a Candidate with `results` of an Issue in `state` stands: the first of `CANDIDATE_STATUSES` that applies. */
export function getCandidateStatus(
  state: IssueState,
  results: CandidateResults | undefined,
): CandidateStatus {
  if (state !== "detected" && state !== "reviewing") {
    return "not_shipped";
  }
  if (results === undefined) {
    return "not_run";
  }
  if (results.run.status !== "completed") {
    return "running";
  }
  if (results.outdated) {
    return "outdated";
  }
  if (results.run.conclusion !== "success") {
    return "run_failed";
  }
  if (results.new_evals !== undefined && results.new_evals.passed !== results.new_evals.total) {
    return "not_fixed";
  }

  return results.regressions !== undefined && results.regressions.length > 0
    ? "regresses"
    : "ready";
}

/** Whether engineers can approve a Candidate with `results` of an Issue in `state`. */
export const canApprove = (state: IssueState, results: CandidateResults | undefined) =>
  getCandidateStatus(state, results) === "ready";

/** Whether engineers can ship an Issue's approved Candidate: it's still on the approved test merge. */
export const canShip = ({ state, approved }: Pick<Issue, "state" | "approved">) =>
  state === "reviewing" && approved !== undefined && !approved.outdated;

/** Whether engineers can add traces to or remove them from an Issue in `state`. */
export const canChangeTraces = (state: IssueState) => state === "detected" || state === "reviewing";

const ISSUE_ANNOTATION_PREFIX = "grounded/issue/";
const MATCH_LABEL = "match";

/** The `annotation` filter for the Traces that match an Issue. */
export const getIssueMatchFilter = (id: string) => `${ISSUE_ANNOTATION_PREFIX}${id}:${MATCH_LABEL}`;

const ISSUE_ANNOTATION_PATTERN = /^grounded\/issue\/([^/]+)$/;

/** The Issue a `grounded/issue/<id>` annotation labeled `match` is for. */
export const getMatchedIssue = ({ name, label }: { name: string; label?: string | undefined }) =>
  label === MATCH_LABEL ? ISSUE_ANNOTATION_PATTERN.exec(name)?.[1] : undefined;

/** An Agent's Issues, read from `issues/<id>/issue.mdx` on its repo's default branch. */
export class Issues {
  constructor(
    private readonly repos: Repos,
    private readonly git: Git,
    private readonly agents: Agents,
    private readonly pulls: Pulls,
    private readonly jobs: Jobs,
    private readonly evals: Evals,
  ) {}

  /** Every Issue, most recently seen first. */
  async list({ agent, repo }: { agent: string; repo: string }): Promise<IssueSummary[]> {
    const [entries, { counts }, work] = await Promise.all([
      this.issueEntries(repo),
      this.agents.annotationCounts({ agent }),
      this.branchWork(agent, repo, "issue/**"),
    ]);
    const issues = entries.flatMap((entry) => {
      const id = ISSUE_FILE_PATTERN.exec(entry.path)?.[1];
      if (id === undefined) {
        return [];
      }
      const { frontmatter, body } = readIssue(entry, entry.path);
      return summarize(id, frontmatter, counts, work, body);
    });

    return issues.sort((a, b) => Date.parse(b.last_seen_at) - Date.parse(a.last_seen_at));
  }

  /** One Issue with its body, as of the default branch's head. */
  async get({ agent, repo, id }: { agent: string; repo: string; id: string }): Promise<Issue> {
    const path = getIssueFileById(id);
    const [[head], { counts }, work] = await Promise.all([
      this.repos.listCommits({ repo, per_page: 1 }),
      this.agents.annotationCounts({ agent }),
      this.branchWork(agent, repo, `issue/${id}/**`),
    ]);
    const { frontmatter, body } = readIssue(
      await this.repos.getContent({ repo, path, ref: head!.sha }),
      path,
    );
    const { approved } = frontmatter;
    const listed = approved && (await this.candidatePull(repo, id, approved.candidate));
    const pull = listed && (await this.pulls.get({ repo, pull_number: listed.number }));
    return {
      ...summarize(id, frontmatter, counts, work, body),
      dismissal_reason: frontmatter.dismissal_reason,
      resolution_reason: frontmatter.resolution_reason,
      body,
      head_oid: head!.sha,
      include: frontmatter.include,
      exclude: frontmatter.exclude,
      approved: approved && { ...approved, outdated: pull?.merge_commit_sha !== approved.sha },
      fix: frontmatter.fix,
    };
  }

  /** The latest 100 commits to the Issue's file on the default branch, newest first. */
  async listEvents({ repo, id }: { repo: string; id: string }): Promise<IssueEvent[]> {
    const commits = await this.repos.listCommits({
      repo,
      path: getIssueFileById(id),
      per_page: 100,
    });
    return commits.map(({ sha, commit: { message, author, committer } }) => {
      const action = ACTION_TRAILER_PATTERN.exec(message)?.[1];
      return {
        sha,
        subject: message.split("\n", 1)[0] ?? "",
        state: stateAfter(action),
        author: author.name,
        via: committer.name === author.name ? undefined : committer.name,
        at: committer.date,
      };
    });
  }

  /**
   * Commits a change to `issue.mdx` on the default branch as the token's user. It's refused
   * (409) if the branch has moved past `expectedHeadOid`, the head the change was made from.
   * `ship` first merges the approved Candidate into the default branch and records that merge as
   * the Issue's `fix`.
   */
  async update({
    agent,
    repo,
    id,
    expectedHeadOid,
    ...change
  }: { agent: string; repo: string; id: string; expectedHeadOid: string } & IssueChange) {
    const { default_branch } = await this.repos.get({ repo });
    const path = getIssueFileById(id);
    const file = await this.repos.getContent({ repo, path, ref: expectedHeadOid });
    const { frontmatter, yaml, body } = readIssue(file, path);
    if (change.action === "ship") {
      const shipment =
        change.candidate === undefined
          ? frontmatter
          : {
              ...frontmatter,
              state: "reviewing" as const,
              approved: await this.approval(
                agent,
                repo,
                id,
                frontmatter.state,
                change.candidate,
              ),
            };
      const { candidate, fix } = await this.mergeApproved(
        repo,
        default_branch,
        id,
        expectedHeadOid,
        shipment,
      );
      // The merges can change the Issue's file too, so the change applies to it as merged.
      const shipped = readIssue(await this.repos.getContent({ repo, path, ref: fix }), path);
      const document = parseDocument(shipped.yaml);
      document.set("state", "resolved");
      document.set("fix", fix);
      document.delete("approved");
      const headline = `Ship candidate ${candidate} of issue ${id}`;
      await this.commitIssue(
        repo,
        default_branch,
        id,
        fix,
        document,
        shipped.body,
        headline,
        "ship",
      );
      return;
    }

    const document = parseDocument(yaml);
    const matched = "trace" in change && (await this.isMatched(agent, id, change.trace));
    const headline =
      change.action === "approve"
        ? await this.approve(document, agent, repo, id, frontmatter.state, change.candidate)
        : applyChange(document, id, frontmatter, change, matched);
    await this.commitIssue(
      repo,
      default_branch,
      id,
      expectedHeadOid,
      document,
      body,
      headline,
      change.action,
    );
  }

  /** A page of the Issue's traces: those `match.sh` matched minus `exclude`, with `include` leading the first page. */
  async listTraces({
    agent,
    repo,
    id,
    limit,
    after,
  }: {
    agent: string;
    repo: string;
    id: string;
    limit?: number | undefined;
    after?: string | undefined;
  }): Promise<IssueTracePage> {
    const path = getIssueFileById(id);
    const [file, page] = await Promise.all([
      this.repos.getContent({ repo, path }),
      this.agents.listTraces({ agent, annotation: [getIssueMatchFilter(id)], limit, after }),
    ]);
    const { include, exclude } = readIssue(file, path).frontmatter;
    const overridden = new Set([...include, ...exclude]);
    const matched = page.traces.filter(({ trace_id }) => !overridden.has(trace_id));
    const next = page.has_more ? page.traces.at(-1)?.trace_id : undefined;

    if (after !== undefined) {
      return { traces: matched, next };
    }

    const included = await this.listTracesById(agent, include);
    return { traces: [...included, ...matched], next };
  }

  /** The Issue's Candidates, recommended ones first, each read from `issues/<id>/candidates/<candidate>.mdx` on its branch, skipping any without one. */
  async listCandidates({
    agent,
    repo,
    id,
  }: {
    agent: string;
    repo: string;
    id: string;
  }): Promise<CandidateSummary[]> {
    const [pulls, baseline] = await Promise.all([
      listEveryPage((page) =>
        this.pulls.list({
          repo,
          state: "open",
          base: getEvalsBranchById(id),
          page,
          per_page: PAGE_SIZE,
        }),
      ),
      this.readBaseline(agent, repo, id),
    ]);
    const candidates = await Promise.all(
      pulls.flatMap((pull) => {
        const [, issue, candidate] = CANDIDATE_REF_PATTERN.exec(pull.head.ref) ?? [];
        const { sha } = pull.head;
        return issue === id && candidate !== undefined && sha !== null
          ? [this.readCandidate(agent, repo, id, candidate, pull.number, sha, baseline)]
          : [];
      }),
    );

    return candidates
      .filter((summary) => summary !== undefined)
      .sort((a, b) => Number(b.recommended !== undefined) - Number(a.recommended !== undefined));
  }

  /** One Candidate with its fix, or undefined when it has no open pull request (such as a shipped one) or no file. */
  async getCandidate({
    agent,
    repo,
    id,
    candidate,
  }: {
    agent: string;
    repo: string;
    id: string;
    candidate: string;
  }): Promise<Candidate | undefined> {
    const [pull, baseline, { default_branch }] = await Promise.all([
      this.candidatePull(repo, id, candidate),
      this.readBaseline(agent, repo, id),
      this.repos.get({ repo }),
    ]);
    if (!pull?.head.sha || !pull.base.sha) {
      return undefined;
    }

    // Both reads use the pull's commits, so the files match the head the Candidate file was read at.
    const [summary, { files }, evals_behind] = await Promise.all([
      this.readCandidate(agent, repo, id, candidate, pull.number, pull.head.sha, baseline),
      this.repos.compareCommits({ repo, basehead: `${pull.base.sha}...${pull.head.sha}` }),
      this.isBehind(repo, pull.base.sha, default_branch),
    ]);
    if (!summary) {
      return undefined;
    }
    const file = getCandidateFileById(id, candidate);
    return { ...summary, files: files.filter(({ filename }) => filename !== file), evals_behind };
  }

  /** The newest full `run-evals` run on the Issue's evals branch, its baseline, or undefined before the first. */
  async getBaselineRun({ agent, id }: { agent: string; id: string }) {
    return await this.newestFullEvalRun(agent, getEvalsBranchById(id));
  }

  /** Opens a Candidate off the evals branch's head (opening that branch off the default branch first if needed) with only its file, resolving its new ID. */
  async createCandidate({ repo, id, title }: CreateCandidateOptions): Promise<string> {
    const file = candidateFileSchema.parse({ title });
    const evals = getEvalsBranchById(id);
    const base = await this.openEvalsBranch(repo, id);
    const candidate = newCandidateId(title);
    const branch = getCandidateBranchById(id, candidate);
    await this.git.createRef({ repo, ref: `refs/heads/${branch}`, sha: base });
    // A pull request needs a commit, and Candidates are listed by their file.
    await this.commitFiles(repo, branch, base, `Add candidate ${candidate} to issue ${id}`, [
      { path: getCandidateFileById(id, candidate), contents: `---\n${stringify(file)}---\n` },
    ]);
    await this.pulls.create({ repo, head: branch, base: evals, title });
    return candidate;
  }

  /** Commits `files` to the Candidate's branch, so its pull request reruns its Evals. */
  async updateCandidate({ repo, id, candidate, expectedHeadOid, files }: UpdateCandidateOptions) {
    await this.commitFiles(
      repo,
      getCandidateBranchById(id, candidate),
      expectedHeadOid,
      `Edit candidate ${candidate} of issue ${id}`,
      files,
    );
  }

  /** Commits `files` to the Issue's evals branch, which reruns its baseline but not its Candidates. */
  async updateEvals({ repo, id, expectedHeadOid, files }: UpdateEvalsOptions) {
    await this.commitFiles(
      repo,
      getEvalsBranchById(id),
      expectedHeadOid,
      `Edit evals of issue ${id}`,
      files,
    );
  }

  /** Commits `files` to the Issue's notes and `body` to its `issue.mdx` on the default branch. */
  async updateNotes({ repo, id, expectedHeadOid, body, files }: UpdateNotesOptions) {
    const notes = `${getNotesDirById(id)}/`;
    const outside = files.find(
      ({ path }) =>
        !path.startsWith(notes) ||
        path
          .slice(notes.length)
          .split("/")
          .some((segment) => segment === "" || segment === "." || segment === ".."),
    );
    if (outside !== undefined) {
      throw new Error(`${outside.path} isn't under ${notes}`);
    }

    const { default_branch } = await this.repos.get({ repo });
    const additions = [...files];
    if (body !== undefined) {
      const path = getIssueFileById(id);
      const file = await this.repos.getContent({ repo, path, ref: expectedHeadOid });
      additions.push({ path, contents: `---\n${splitFrontmatter(file, path).yaml}\n---\n${body}` });
    }
    await this.commitFiles(
      repo,
      default_branch,
      expectedHeadOid,
      `Edit notes of issue ${id}`,
      additions,
    );
  }

  /** Merges the default branch into the Issue's evals branch, which reruns its baseline but not its Candidates (a conflict is a 409). */
  async syncEvals({ repo, id }: { repo: string; id: string }) {
    const { default_branch } = await this.repos.get({ repo });
    await this.repos.merge({ repo, base: getEvalsBranchById(id), head: default_branch });
  }

  /** Runs every Eval on the Candidate's current test merge. */
  async rerunCandidate({
    agent,
    repo,
    id,
    candidate,
  }: {
    agent: string;
    repo: string;
    id: string;
    candidate: string;
  }) {
    const listed = await this.candidatePull(repo, id, candidate);
    if (listed === undefined) {
      throw new GroundedError(
        `Candidate ${candidate} of issue ${id} not found`,
        NOT_FOUND,
        undefined,
      );
    }

    // Reading the pull moves its test merge ref to where both branches point now.
    await this.pulls.get({ repo, pull_number: listed.number });
    return await this.jobs.dispatch({
      agent,
      job: RUN_EVALS_JOB,
      ref: getTestMergeRef(listed.number),
    });
  }

  /** The head of the Issue's evals branch, opening it at the default branch's head when it doesn't exist yet. */
  private async openEvalsBranch(repo: string, id: string) {
    const branch = getEvalsBranchById(id);
    const head = await this.branchHead(repo, branch);
    if (head !== undefined) {
      return head;
    }

    const [{ default_branch }] = await Promise.all([
      this.repos.get({ repo }),
      this.repos.getContent({ repo, path: getIssueFileById(id) }),
    ]);
    const sha = await this.branchHead(repo, default_branch);
    if (sha === undefined) {
      throw new GroundedError(`Repository ${repo} has no commits`, NOT_FOUND, undefined);
    }

    await this.git.createRef({ repo, ref: `refs/heads/${branch}`, sha });
    return sha;
  }

  private async branchHead(repo: string, branch: string) {
    const refs = await this.git.listMatchingRefs({ repo, ref: `heads/${branch}` });
    return refs.find(({ ref }) => ref === `refs/heads/${branch}`)?.object.sha;
  }

  private async commitFiles(
    repo: string,
    branch: string,
    expectedHeadOid: string,
    headline: string,
    files: { path: string; contents: string }[],
  ) {
    await this.repos.createCommitOnBranch({
      repo,
      branch,
      expectedHeadOid,
      message: { headline },
      fileChanges: {
        additions: files.map(({ path, contents }) => ({ path, contents: encodeContent(contents) })),
      },
    });
  }

  /** Records the test merge commit of the Candidate's newest run, once it's ready to approve. */
  private async approve(
    document: Document,
    agent: string,
    repo: string,
    id: string,
    state: IssueState,
    candidate: string,
  ) {
    const approval = await this.approval(agent, repo, id, state, candidate);
    if (state === "detected") {
      document.set("state", "reviewing");
    }
    document.set("approved", approval);
    return `Approve candidate ${candidate} of issue ${id}`;
  }

  /** Returns the exact tested Candidate revision once it is ready to approve or ship. */
  private async approval(
    agent: string,
    repo: string,
    id: string,
    state: IssueState,
    candidate: string,
  ) {
    const [pull, baseline] = await Promise.all([
      this.candidatePull(repo, id, candidate),
      this.readBaseline(agent, repo, id),
    ]);
    const results =
      pull && (await this.readCandidateResults(agent, repo, id, pull.number, baseline));
    const status = getCandidateStatus(state, results);
    if (status !== "ready") {
      throw new Error(`Candidate ${candidate} of issue ${id} isn't ready to approve: ${status}`);
    }

    return { candidate, sha: results!.run.sha };
  }

  private async commitIssue(
    repo: string,
    branch: string,
    id: string,
    expectedHeadOid: string,
    document: Document,
    body: string,
    headline: string,
    action: IssueChange["action"],
  ) {
    frontmatterSchema.parse(document.toJS());
    await this.repos.createCommitOnBranch({
      repo,
      branch,
      expectedHeadOid,
      message: { headline, body: `Grounded-Issue: ${id}\nGrounded-Action: ${action}` },
      fileChanges: {
        additions: [
          { path: getIssueFileById(id), contents: encodeContent(`---\n${document}---\n${body}`) },
        ],
      },
    });
  }

  /**
   * Merges the approved Candidate's pull request into the evals branch and its merge commit into
   * `branch`, returning the merge on `branch`. The merged pull request must have the approved test
   * merge's tree, so `branch` gets what the approved run tested. A ship that failed after either
   * merge picks up from it.
   */
  private async mergeApproved(
    repo: string,
    branch: string,
    id: string,
    expectedHeadOid: string,
    { state, approved }: z.output<typeof frontmatterSchema>,
  ) {
    if (state !== "reviewing" || approved === undefined) {
      throw new Error(`Issue ${id} has no approved candidate to ship`);
    }

    const { candidate } = approved;
    const [[listed], [head]] = await Promise.all([
      this.pulls.list({
        repo,
        state: "all",
        head: getCandidateBranchById(id, candidate),
        base: getEvalsBranchById(id),
        per_page: 1,
      }),
      this.repos.listCommits({ repo, per_page: 1 }),
    ]);
    if (head!.sha !== expectedHeadOid) {
      throw new GroundedError(`${branch} has moved past ${expectedHeadOid}`, CONFLICT, undefined);
    }

    const evalsMerge = listed?.merged
      ? listed.merge_commit_sha!
      : await this.mergeCandidate(repo, branch, id, expectedHeadOid, approved, listed?.number);
    const [[tested], [merged]] = await Promise.all([
      this.repos.listCommits({ repo, sha: approved.sha, per_page: 1 }),
      this.repos.listCommits({ repo, sha: evalsMerge, per_page: 1 }),
    ]);
    if (tested!.commit.tree.sha !== merged!.commit.tree.sha) {
      throw new Error(
        `Candidate ${candidate} of issue ${id} was merged with changes its approved run didn't test`,
      );
    }

    const fix =
      (await this.repos.merge({
        repo,
        base: branch,
        head: evalsMerge,
        commit_message: `Merge candidate ${candidate} of issue ${id}`,
      })) ?? (await this.findMerge(repo, evalsMerge));
    if (fix === undefined) {
      throw new Error(`Candidate ${candidate} of issue ${id} reached ${branch} without a merge`);
    }

    return { candidate, fix: fix.sha };
  }

  /** The merge on the default branch whose second parent is `head`. */
  private async findMerge(repo: string, head: string, page = 1): Promise<Commit | undefined> {
    const commits = await this.repos.listCommits({ repo, page, per_page: PAGE_SIZE });
    const merge = commits.find(({ parents }) => parents[1]?.sha === head);
    if (merge !== undefined || commits.length < PAGE_SIZE) {
      return merge;
    }

    return await this.findMerge(repo, head, page + 1);
  }

  /**
   * Merges the approved Candidate's open pull request if it's still on the approved test merge and
   * the evals branch has everything on `branch` outside `issues/`.
   */
  private async mergeCandidate(
    repo: string,
    branch: string,
    id: string,
    expectedHeadOid: string,
    { candidate, sha }: Pick<Approval, "candidate" | "sha">,
    pull_number: number | undefined,
  ) {
    const evals = getEvalsBranchById(id);
    const [pull, behind] = await Promise.all([
      pull_number === undefined ? undefined : this.pulls.get({ repo, pull_number }),
      this.isBehind(repo, evals, expectedHeadOid),
    ]);
    if (pull?.state !== "open" || pull.merge_commit_sha !== sha) {
      throw new Error(`Candidate ${candidate} of issue ${id} has changed since it was approved`);
    }

    if (behind) {
      throw new Error(`Merge ${branch} into ${evals} before shipping issue ${id}`);
    }

    const merged = await this.pulls.merge({ repo, pull_number: pull.number, sha: pull.head.sha! });
    return merged.sha;
  }

  /** Whether `head` has changes outside `issues/` that `base` lacks, since Issue writes don't change what the Evals run. */
  private async isBehind(repo: string, base: string, head: string) {
    const { files } = await this.repos.compareCommits({ repo, basehead: `${base}...${head}` });
    return files.some(({ filename }) => !filename.startsWith(`${ISSUES_DIR}/`));
  }

  private async candidatePull(repo: string, id: string, candidate: string) {
    const [pull] = await this.pulls.list({
      repo,
      state: "open",
      head: getCandidateBranchById(id, candidate),
      base: getEvalsBranchById(id),
    });
    return pull;
  }

  private async readCandidate(
    agent: string,
    repo: string,
    id: string,
    candidate: string,
    pull_number: number,
    head_sha: string,
    baseline: Baseline | undefined,
  ): Promise<CandidateSummary | undefined> {
    const path = getCandidateFileById(id, candidate);
    const [file, results] = await Promise.all([
      this.contentIfPresent(repo, path, head_sha),
      this.readCandidateResults(agent, repo, id, pull_number, baseline),
    ]);
    if (file === undefined) {
      return undefined;
    }
    const { yaml, body } = splitFrontmatter(file, path);
    const { title, recommended } = candidateFileSchema.parse(parse(yaml));
    return { id: candidate, pull_number, head_sha, title, recommended, body, results };
  }

  /** The newest full `run-evals` run on `branch`. */
  private async newestFullEvalRun(
    agent: string,
    branch: string,
    page = 1,
  ): Promise<JobRun | undefined> {
    const runs = await this.jobs.listRuns({
      agent,
      job: RUN_EVALS_JOB,
      branch,
      page,
      per_page: PAGE_SIZE,
    });
    const full = runs.find(isFullEvalRun);
    if (full !== undefined || runs.length < PAGE_SIZE) {
      return full;
    }
    return await this.newestFullEvalRun(agent, branch, page + 1);
  }

  /** The results of the Candidate whose pull request is `pull_number`, undefined before its first run. */
  private async readCandidateResults(
    agent: string,
    repo: string,
    id: string,
    pull_number: number,
    baseline: Baseline | undefined,
  ): Promise<CandidateResults | undefined> {
    const [run, pull] = await Promise.all([
      this.newestFullEvalRun(agent, getTestMergeRef(pull_number)),
      this.pulls.get({ repo, pull_number }),
    ]);
    if (run === undefined) {
      return undefined;
    }

    const outdated = run.sha !== pull.merge_commit_sha;
    if (run.status !== "completed") {
      return {
        run,
        outdated,
        new_evals: undefined,
        existing_evals: undefined,
        regressions: undefined,
      };
    }

    const [evals, { results }, tree] = await Promise.all([
      this.evals.list({ repo, ref: run.sha }),
      this.evals.getRun({ agent, run: run.id }),
      baseline && this.evalsTree(repo, run.sha),
    ]);
    const before = baseline?.tree === tree ? baseline?.results : undefined;
    const passed = new Set(results.flatMap((result) => (result.passed ? [result.eval] : [])));
    const tally = (ids: string[]) => ({
      passed: ids.filter((evalId) => passed.has(evalId)).length,
      total: ids.length,
    });
    const newIds = evals.filter(({ issues }) => issues.includes(id)).map((entry) => entry.id);
    const existingIds = evals.map((entry) => entry.id).filter((evalId) => !newIds.includes(evalId));

    return {
      run,
      outdated,
      new_evals: tally(newIds),
      existing_evals: tally(existingIds),
      regressions: before?.flatMap((result) =>
        result.passed && existingIds.includes(result.eval) && !passed.has(result.eval)
          ? [result.eval]
          : [],
      ),
    };
  }

  /** The Issue's newest completed full run on its evals branch, which Candidate runs over the same `evals/` tree compare with. */
  private async readBaseline(
    agent: string,
    repo: string,
    id: string,
  ): Promise<Baseline | undefined> {
    const run = await this.getBaselineRun({ agent, id });
    if (run?.status !== "completed") {
      return undefined;
    }

    const [tree, { results }] = await Promise.all([
      this.evalsTree(repo, run.sha),
      this.evals.getRun({ agent, run: run.id }),
    ]);
    return { tree, results };
  }

  /** The `evals/` tree at `ref`, which a Candidate run and its baseline must share. */
  private async evalsTree(repo: string, ref: string) {
    const entries = await this.repos.getContent({ repo, ref });
    return Array.isArray(entries)
      ? entries.find(({ type, name }) => type === "dir" && name === EVALS_DIR)?.sha
      : undefined;
  }

  // The agents service filters by at most MAX_TRACE_FILTER IDs at once.
  private async listTracesById(agent: string, ids: string[]) {
    const pages = await Promise.all(
      chunk(ids, MAX_TRACE_FILTER).map((trace) =>
        this.agents.listTraces({ agent, trace, limit: trace.length }),
      ),
    );
    return pages.flatMap((page) => page.traces);
  }

  private async isMatched(agent: string, id: string, trace: string) {
    const { traces } = await this.agents.listTraces({
      agent,
      annotation: [getIssueMatchFilter(id)],
      trace: [trace],
      limit: 1,
    });
    return traces.length > 0;
  }

  private async branchWork(agent: string, repo: string, branch: string): Promise<BranchWork> {
    const [queued, inProgress, regressions] = await Promise.all([
      listEveryPage((page) =>
        this.jobs.listRuns({ agent, branch, status: "queued", page, per_page: PAGE_SIZE }),
      ),
      listEveryPage((page) =>
        this.jobs.listRuns({ agent, branch, status: "in_progress", page, per_page: PAGE_SIZE }),
      ),
      listEveryPage((page) =>
        this.pulls.list({ repo, state: "open", labels: ["regression"], page, per_page: PAGE_SIZE }),
      ),
    ]);
    const issuesOf = (refs: string[]) =>
      new Set(refs.flatMap((ref) => ISSUE_REF_PATTERN.exec(ref)?.[1] ?? []));
    return {
      running: issuesOf([...queued, ...inProgress].map((run) => run.ref)),
      regressed: issuesOf(regressions.map((pull) => pull.head.ref)),
    };
  }

  private async contentIfPresent(repo: string, path: string, ref: string) {
    try {
      return await this.repos.getContent({ repo, path, ref });
    } catch (error) {
      if (error instanceof GroundedError && error.status === NOT_FOUND) {
        return undefined;
      }
      throw error;
    }
  }

  private async issueEntries(repo: string) {
    try {
      return await this.repos.listContents({ repo, path: ISSUES_DIR });
    } catch (error) {
      if (error instanceof GroundedError && error.status === NOT_FOUND) {
        return [];
      }
      throw error;
    }
  }
}

async function listEveryPage<T>(read: (page: number) => Promise<T[]>, page = 1): Promise<T[]> {
  const rows = await read(page);
  return rows.length < PAGE_SIZE ? rows : [...rows, ...(await listEveryPage(read, page + 1))];
}

/** The IDs of Issues with a job queued or running, and with an open regression pull request, on their `issue/<id>/…` branches. */
type BranchWork = { running: Set<string>; regressed: Set<string> };

const CANDIDATE_ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const CANDIDATE_SUFFIX_LENGTH = 4;
const CANDIDATE_SLUG_LENGTH = 40;

/** The title as a slug plus a random suffix, like `parse-dates-in-the-users-locale-p2xm`. */
function newCandidateId(title: string) {
  const slug = title
    .normalize("NFKD")
    .toLowerCase()
    .replace(/['\u2019]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, CANDIDATE_SLUG_LENGTH)
    .replace(/^-|-$/g, "");
  const suffix = Array.from(
    crypto.getRandomValues(new Uint8Array(CANDIDATE_SUFFIX_LENGTH)),
    (byte) => CANDIDATE_ID_ALPHABET[byte % CANDIDATE_ID_ALPHABET.length],
  ).join("");
  return slug === "" ? suffix : `${slug}-${suffix}`;
}

const isIssueAction = (action: string | undefined): action is IssueActionName =>
  ISSUE_ACTION_NAMES.some((name) => name === action);

function stateAfter(action: string | undefined): IssueState | undefined {
  if (action === "ship") {
    return "resolved";
  }
  if (action === "approve") {
    return "reviewing";
  }

  return isIssueAction(action) ? ISSUE_ACTIONS[action].to : undefined;
}

function statusOf(
  id: string,
  { state, fix }: z.output<typeof frontmatterSchema>,
  { running, regressed }: BranchWork,
): IssueStatus | undefined {
  if (state === "resolved") {
    return regressed.has(id) ? "possible_regression" : undefined;
  }
  if (state === "dismissed") {
    return undefined;
  }
  if (running.has(id)) {
    return "running";
  }
  return state === "reviewing" && fix !== undefined ? "resurfaced" : "pending";
}

/**
 * Applies `change` to an Issue's frontmatter and returns the subject of its commit. `include` and
 * `exclude` hold only traces that change what `match.sh` matched, so the Issue's count stays exact.
 */
function applyChange(
  document: Document,
  id: string,
  { state, include, exclude, approved }: z.output<typeof frontmatterSchema>,
  change: Exclude<IssueChange, { action: "approve" | "ship" }>,
  matched: boolean,
) {
  if (change.action === "unapprove") {
    if (approved === undefined) {
      throw new Error(`Issue ${id} has no approved candidate`);
    }

    document.delete("approved");
    return `Remove approval of candidate ${approved.candidate} from issue ${id}`;
  }

  if (change.action === "include_trace" || change.action === "exclude_trace") {
    if (!canChangeTraces(state)) {
      throw new Error(`Issue ${id} is ${state}, so its traces can't change`);
    }

    const { trace } = change;
    const adding = change.action === "include_trace";
    const inIssue = (include.includes(trace) || matched) && !exclude.includes(trace);
    if (inIssue === adding) {
      throw new Error(`Issue ${id} ${adding ? "already has" : "doesn't have"} trace ${trace}`);
    }

    const without = (traces: string[]) => traces.filter((listed) => listed !== trace);
    document.set("include", adding && !matched ? [...include, trace] : without(include));
    document.set("exclude", !adding && matched ? [...exclude, trace] : without(exclude));
    return adding ? `Add trace ${trace} to issue ${id}` : `Remove trace ${trace} from issue ${id}`;
  }

  const { from, to, subject } = ISSUE_ACTIONS[change.action];
  if (!from.includes(state)) {
    throw new Error(`Issue ${id} is ${state}, so it can't ${change.action}`);
  }

  document.set("state", to);
  if (change.action === "dismiss") {
    document.set("dismissal_reason", change.reason);
    document.delete("resolution_reason");
  } else if (change.action === "resolve") {
    document.set("resolution_reason", change.reason);
    document.delete("dismissal_reason");
  } else {
    document.delete("dismissal_reason");
    document.delete("resolution_reason");
  }

  return subject(id);
}

function chunk<T>(items: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, (i + 1) * size),
  );
}

function summarize(
  id: string,
  frontmatter: z.output<typeof frontmatterSchema>,
  counts: AnnotationCounts["counts"],
  work: BranchWork,
  body: string,
): IssueSummary {
  const matched = counts.find((row) => getMatchedIssue(row) === id);
  return {
    id,
    title: frontmatter.title,
    summary: issueSummary(body),
    severity: frontmatter.severity,
    state: frontmatter.state,
    trace_count: Math.max(
      0,
      (matched?.traces ?? 0) + frontmatter.include.length - frontmatter.exclude.length,
    ),
    first_seen_at: matched?.first_seen_at ?? frontmatter.created,
    last_seen_at: matched?.last_seen_at ?? frontmatter.created,
    status: statusOf(id, frontmatter, work),
  };
}

function issueSummary(body: string): string {
  return body
    .replace(/```[\s\S]*?```/gu, " ")
    .replace(/^#{1,6}\s+.*$/gmu, " ")
    .replace(/!\[([^\]]*)\]\([^)]+\)/gu, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/gu, "$1")
    .replace(/<[^>]+>/gu, " ")
    .replace(/[`*_~>|]/gu, "")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 280)
    .trim();
}

type FileContent = ContentFile | ContentEntry[] | Pick<NestedEntry, "content">;

function splitFrontmatter(file: FileContent, path: string) {
  const text = decodeContent(file, path);
  const match = FRONTMATTER_PATTERN.exec(text);
  if (match === null) {
    throw new Error(`${path} has no frontmatter`);
  }

  return { yaml: match[1] ?? "", body: text.slice(match[0].length) };
}

function readIssue(file: FileContent, path: string) {
  const { yaml, body } = splitFrontmatter(file, path);
  return { frontmatter: frontmatterSchema.parse(parse(yaml)), yaml, body };
}

function encodeContent(text: string) {
  return btoa(
    Array.from(new TextEncoder().encode(text), (byte) => String.fromCharCode(byte)).join(""),
  );
}
