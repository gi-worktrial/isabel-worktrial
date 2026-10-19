import { getCandidateBranchById, getEvalsBranchById } from "#src/sdk/issues";

import { TASKS } from "./registry.ts";

export const MAIN = "main";

export const evalsBranch = getEvalsBranchById;
export const candidateBranch = getCandidateBranchById;
export const taskDir = (task: string) => `${TASKS}/${task}`;
/** Shared images (mocks, Criteria), since Harbor uploads only a task's own folders. */
export const IMAGES = "evals/images";
export const CRITERIA = `${IMAGES}/criteria`;

type BranchKind =
  | { kind: "main" }
  | { kind: "evals" | "regression"; issue: string }
  | { kind: "candidate"; issue: string; id: string };

/** What a branch of an Agent repo is for, as platform names them. */
export function branchKind(branch: string): BranchKind | null {
  if (branch === MAIN) {
    return { kind: "main" };
  }
  const [, issue, kind, id] =
    /^issue\/([^/]+)\/(evals|regression|candidate)(?:\/([^/]+))?$/u.exec(branch) ?? [];
  if (issue !== undefined && kind === "candidate" && id !== undefined) {
    return { kind, issue, id };
  }
  return issue !== undefined && (kind === "evals" || kind === "regression") && id === undefined
    ? { kind, issue }
    : null;
}

// Grounded's own jobs live in `.grounded/jobs/<name>/` and are named `grounded/<name>`
export const jobFolder = (name: string) =>
  name.startsWith("grounded/")
    ? `.grounded/jobs/${name.slice("grounded/".length)}/`
    : `jobs/${name}/`;

/** A job's definition file. */
export const jobToml = (name: string) => `${jobFolder(name)}job.toml`;
