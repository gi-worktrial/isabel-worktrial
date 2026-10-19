import type { PebbleAnswer, PebbleRequest } from "#src/pebble/wire";
import type { ProductClient } from "#src/queries/client";
import { GroundedError, type Thread, threadTitleSchema, updateThreadSchema } from "#src/sdk/index";

import { ORGANIZATION, type ResourceAccess, VIEWER } from "./access.ts";
import { pebbleStatus } from "./answers.ts";
import { chatAwake } from "./sandboxes.ts";
import { type SessionRecord, threadSockets } from "./thread-socket.ts";

/** A Pebble thread the viewer opened, kept in their layer; a prompt or rename moves `updated_ms`. */
export type ThreadRecord = {
  id: string;
  title: string | null;
  created_ms: number;
  updated_ms: number;
  /** Left out of the list, though a read by id still returns it; layers saved before archiving have none. */
  archived?: boolean | undefined;
  /** Its Pi sessions by id, once it has any. */
  sessions?: Record<string, SessionRecord> | undefined;
};

/** A chat as platform's API returns it, working in its Agent's `repository`. */
export const threadOf = (record: Omit<ThreadRecord, "sessions">, repository: string): Thread => ({
  id: record.id,
  organization_id: ORGANIZATION,
  created_by: VIEWER,
  title: record.title,
  repos: [repository],
  sandbox: null,
  archived: record.archived === true,
  created_at: new Date(record.created_ms).toISOString(),
  updated_at: new Date(record.updated_ms).toISOString(),
});

type ThreadsContext = ResourceAccess & {
  threads: ThreadRecord[];
  thread(record: ThreadRecord): Thread;
  now(): number;
  prepared(request: PebbleRequest): Promise<PebbleAnswer | undefined>;
};

const TITLE_LENGTH = 60;

// platform names an unnamed thread from its first question with a model, and the demo uses the question's own words
function titleOf(question: string): string | null {
  // a mention reads as its label, as its chip shows it
  const line =
    question
      .replace(/@\[([^\]]+)\]/gu, "$1")
      .trim()
      .split("\n")[0]
      ?.trim() ?? "";
  const title = line.length > TITLE_LENGTH ? `${line.slice(0, TITLE_LENGTH - 1).trimEnd()}…` : line;
  return threadTitleSchema.safeParse(title).success ? title : null;
}

export function threadsResource({
  threads,
  thread,
  now,
  prepared,
  read,
  write,
}: ThreadsContext): ProductClient["pebble"] {
  const known = (id: string) => {
    const record = threads.find((entry) => entry.id === id);
    if (record === undefined) {
      throw new GroundedError(`No Pebble thread ${id}`, 404, undefined);
    }
    return record;
  };
  const connection = threadSockets({
    sessions: (id) => {
      const record = threads.find((entry) => entry.id === id);
      return record === undefined ? undefined : (record.sessions ?? {});
    },
    write: (id, change) =>
      write(() => {
        const record = known(id);
        record.sessions ??= {};
        change(record.sessions);
      }),
    asked: (id, question) =>
      write(() => {
        const record = known(id);
        record.title ??= titleOf(question);
        record.updated_ms = now();
        return thread(record);
      }),
    awake: (id) => {
      const record = threads.find((entry) => entry.id === id);
      return record !== undefined && chatAwake(record, now());
    },
    connected: pebbleStatus,
    prepared,
    now,
  });
  return {
    threads: {
      list: () =>
        read(() => ({
          threads: threads
            .filter((record) => record.archived !== true)
            .toSorted((left, right) => right.updated_ms - left.updated_ms)
            .map(thread),
          has_more: false,
        })),
      get: (id) => read(() => thread(known(id))),
      create: ({ id = crypto.randomUUID(), title }) =>
        write(() => {
          const existing = threads.find((record) => record.id === id);
          if (existing !== undefined) {
            return thread(existing);
          }
          const at = now();
          const record: ThreadRecord = { id, title: title ?? null, created_ms: at, updated_ms: at };
          threads.push(record);
          return thread(record);
        }),
      // platform's PATCH: a rename moves the chat up the list, an archive drops it from the list
      update: (id, options) =>
        write(() => {
          const { title, archived } = updateThreadSchema.parse(options);
          const record = known(id);
          if (title !== undefined) {
            record.title = title;
            record.updated_ms = now();
          }
          if (archived !== undefined) {
            record.archived = archived;
          }
          return thread(record);
        }),
      connectionOptions: (id) => read(() => connection(known(id).id)),
    },
  };
}
