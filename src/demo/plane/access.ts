import type { Person } from "./git-codec.ts";
import { GitError, type MemoryGit } from "./git.ts";
import type { Seed } from "./seed/types.ts";

/** The one demo viewer, who creates every thread and whose commits sign as the seed's reviewer. */
export const VIEWER = "00000000-0000-4000-8000-000000000001";
export const VIEWER_EMAIL = `${VIEWER}@users.grounded.ai`;
/** The demo Org's id in records such as a thread's, since platform's schemas want the UUID the route calls demo. */
export const ORGANIZATION = "00000000-0000-4000-8000-000000000002";

// reads and writes share the client's gate, lifetime and repository check
export type ResourceAccess = {
  read<Value>(answer: () => Value | Promise<Value>, repo?: string): Promise<Value>;
  write<Value>(change: () => Value | Promise<Value>, repo?: string): Promise<Value>;
};

/** What every resource of one Agent's in-memory data plane shares. */
export type Plane = ResourceAccess & {
  /** The seed moved to the demo's clock. */
  seed: Seed;
  git: MemoryGit;
  now(): number;
  /** A branch's head commit, undefined when there is no such branch. */
  head(branch: string): string | undefined;
  /** The viewer's commit signature now. */
  signature(): Person;
};

// a missing value answers the data plane's 404
export function must<Value>(value: Value | undefined, message: string): Value {
  if (value === undefined) {
    throw new GitError(message, 404);
  }
  return value;
}

/** A call the demo can't make, answered with the data plane's 403. */
export const refusal = (message: string) => (): never => {
  throw new GitError(message, 403);
};
