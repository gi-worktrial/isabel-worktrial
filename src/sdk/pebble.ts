import type { Op } from "@earendil-works/chord/delta";
import type { Cursor, EntryRecord, Page } from "@earendil-works/pi-durable";
import type { PiOperationResult, PiReceipt, PiSessionInfo } from "agents/harness/pi";
import { AgentClient } from "agents/client";
import { z } from "zod";
import { type Api, GroundedError, query } from "./api.ts";
import type { Model } from "./settings.ts";

const PEBBLE_AGENT = "pebble";
const SUBPROTOCOL = "cobblestone.v1";
const WEBSOCKET_TOKEN_PREFIX = "bearer.";
export const PI_ROOT_SESSION = "1";

export const threadTitleSchema = z
  .string()
  .max(120)
  .regex(/\S/)
  .regex(/^[^\r\n]*$/);

const threadSchema = z.object({
  id: z.uuid(),
  organization_id: z.uuid(),
  created_by: z.union([z.uuid(), z.templateLiteral(["agent:", z.uuid()])]),
  title: threadTitleSchema.nullable(),
  repos: z.array(z.string()),
  sandbox: z.string().nullable(),
  archived: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});
const threadPageSchema = z.object({ threads: z.array(threadSchema), has_more: z.boolean() });

export type Thread = z.infer<typeof threadSchema>;
export type ThreadPage = z.infer<typeof threadPageSchema>;

export const updateThreadSchema = z
  .strictObject({ title: threadTitleSchema.optional(), archived: z.boolean().optional() })
  .refine(({ title, archived }) => title !== undefined || archived !== undefined, {
    message: "Expected title or archived",
  });
export type UpdateThreadOptions = z.input<typeof updateThreadSchema>;

export type ListThreadsOptions = {
  limit?: number | undefined;
  /** The last thread ID of the previous page. */
  after?: string | undefined;
};

export const thinkingLevelSchema = z.enum([
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]);
export type ThinkingLevel = z.infer<typeof thinkingLevelSchema>;

export type CreateThreadOptions = {
  id?: string | undefined;
  title?: string | undefined;
  /** The gateway model the conversation starts with. Only a job token may omit it, which leaves the thread without a model until a session sets one. */
  model?: string | undefined;
  thinkingLevel?: ThinkingLevel | undefined;
  /** Repositories checked out into the sandbox. */
  repos?: string[] | undefined;
  /** An existing sandbox to run tools in, whose lifecycle the thread never manages. */
  sandbox?: string | undefined;
  /** Variables added to every command Pebble runs in the thread. */
  env?: Record<string, string> | undefined;
};

/** Options for `useAgent` from `agents/react`. */
export type ThreadConnectionOptions = {
  agent: string;
  host: string;
  protocol: "ws" | "wss";
  basePath: string;
  /** Called on every (re)connect, so the socket reconnects with a fresh token. */
  protocols: () => Promise<string[]>;
};

export const operationIdSchema = z.string().min(1).max(200);
const entryKindSchema = z
  .string()
  .min(1)
  .refine((kind) => !kind.startsWith("pi."));
export const submissionSchema = z.union([
  z.strictObject({
    type: z.literal("input"),
    operationId: operationIdSchema,
    content: z.string().trim().min(1),
  }),
  z.strictObject({
    type: z.literal("write"),
    operationId: operationIdSchema,
    visible: z.literal(false).optional(),
    entry: z.strictObject({ kind: entryKindSchema, data: z.json() }),
  }),
  // A visible write's text joins the model's context as a user message.
  z.strictObject({
    type: z.literal("write"),
    operationId: operationIdSchema,
    visible: z.literal(true),
    entry: z.strictObject({ kind: entryKindSchema, data: z.string().regex(/\S/) }),
  }),
]);
export type ThreadSubmission = z.input<typeof submissionSchema>;
export const sessionIdSchema = z.string().regex(/^[1-9]\d{0,15}$/);
const sessionTarget = z.strictObject({ session: sessionIdSchema.default(PI_ROOT_SESSION) });
export const sessionTargetSchema = sessionTarget.prefault({});
export const setModelOptionsSchema = sessionTarget
  .extend({ thinkingLevel: thinkingLevelSchema.optional() })
  .prefault({});
export const forkOptionsSchema = sessionTarget
  .extend({ at: z.number().int().positive().optional() })
  .prefault({});
export const entriesOptionsSchema = sessionTarget.extend({
  order: z.enum(["ascending", "descending"]).optional(),
  minEntryId: z.number().int().nonnegative().optional(),
  maxEntryId: z.number().int().nonnegative().optional(),
  cursor: z.record(z.string(), z.json()).optional(),
  limit: z.number().int().min(1).max(100).default(100),
});
export type EntriesOptions = z.input<typeof entriesOptionsSchema>;
export const submitOptionsSchema = sessionTarget
  .extend({ caller: sessionIdSchema.optional() })
  .prefault({});
export const abortOptionsSchema = sessionTarget
  .extend({ operationId: operationIdSchema.optional() })
  .prefault({});

/** The session a call acts on, the root by default. */
export type SessionTarget = z.input<typeof sessionTargetSchema>;
export type SetModelOptions = z.input<typeof setModelOptionsSchema>;
export type ForkOptions = z.input<typeof forkOptionsSchema>;
/** `caller` is the session blocked on this submission's result (refused when that would deadlock). */
export type SubmitOptions = z.input<typeof submitOptionsSchema>;
export type AbortOptions = z.input<typeof abortOptionsSchema>;

export const sandboxStatusSchema = z.enum([
  "unknown",
  "stopped",
  "starting",
  "ready",
  "pausing",
  "error",
]);
export type SandboxStatus = z.infer<typeof sandboxStatusSchema>;
/** The Agent state a thread socket syncs. */
export const threadStateSchema = z.object({ sandbox: z.object({ status: sandboxStatusSchema }) });
export type ThreadState = z.infer<typeof threadStateSchema>;

/** Messages for the sessions a connection watches. */
export const threadEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("thread.updated"), thread: threadSchema }),
  z.object({
    type: z.literal("session.view"),
    session: sessionIdSchema,
    ops: z.array(z.custom<Op>()).readonly(),
  }),
  z.object({
    type: z.literal("operation.settled"),
    session: sessionIdSchema,
    result: z.custom<PiOperationResult>(),
  }),
]);
export type ThreadEvent = z.infer<typeof threadEventSchema>;

export type ThreadResult = PiOperationResult & {
  /** The entry Pi placed the operation's input or write at (unset when it ended unanswered before Pi placed it). */
  readonly entry: EntryRecord["id"] | undefined;
};

export interface ThreadCallables {
  readonly state: ThreadState;
  setModel(model: string, options?: SetModelOptions): Promise<void>;
  submit(
    submission: ThreadSubmission,
    options?: SubmitOptions,
  ): Promise<PiReceipt | Omit<PiReceipt, "accepted">>;
  result(operationId: string, target?: SessionTarget): Promise<ThreadResult>;
  abort(options?: AbortOptions): Promise<boolean>;
  context(target?: SessionTarget): Promise<EntryRecord[]>;
  entries(options?: EntriesOptions): Promise<Page<EntryRecord, Cursor>>;
  /** Returns the new session's ID. */
  createSession(): Promise<string>;
  /** Returns the new session's ID. */
  fork(options?: ForkOptions): Promise<string>;
  sessions(): Promise<PiSessionInfo[]>;
  watch(session: string): Promise<void>;
  unwatch(session: string): Promise<void>;
  /** Starts or restores the thread's sandbox ahead of a turn. */
  startSandbox(): Promise<void>;
}

/** One conversation in a thread. Every session shares the thread's sandbox. */
export class ThreadSession {
  private readonly agent: AgentClient<ThreadCallables>;

  constructor(
    private readonly connection: ThreadConnection,
    readonly id: string,
  ) {
    this.agent = connection.agent;
  }

  /** Submits input and waits for its result, like Codex's `thread.run()`. */
  async run(content: string): Promise<PiOperationResult> {
    const { operationId } = await this.send({
      type: "input",
      operationId: crypto.randomUUID(),
      content,
    });
    return this.result(operationId);
  }

  /** Returns once the submission is durable; the operation continues after the connection closes. */
  send(submission: ThreadSubmission, { caller }: Pick<NonNullable<SubmitOptions>, "caller"> = {}) {
    return this.agent.call("submit", [submission, { session: this.id, caller }]);
  }

  result(operationId: string) {
    return this.agent.call("result", [operationId, { session: this.id }], { timeout: 0 });
  }

  /** Without an operation ID, cancels the active turn and queued inputs. */
  abort(operationId?: string | undefined) {
    return this.agent.call("abort", [{ session: this.id, operationId }]);
  }

  setModel(model: string, thinkingLevel?: ThinkingLevel | undefined) {
    return this.agent.call("setModel", [model, { session: this.id, thinkingLevel }]);
  }

  context() {
    return this.agent.call("context", [{ session: this.id }]);
  }

  /** Stored entries within inclusive ID bounds, including compacted history (newest first by default). */
  entries(options: Omit<EntriesOptions, "session"> = {}) {
    return this.agent.call("entries", [{ ...options, session: this.id }]);
  }

  /** Forks at `at`, an entry from `entries()`, or at the newest entry. */
  async fork({ at }: { at?: number | undefined } = {}) {
    return this.connection.session(await this.agent.call("fork", [{ session: this.id, at }]));
  }
}

/** Statuses meaning the thread doesn't exist or refuses the token, so reconnecting can't succeed. */
const REFUSED_STATUSES = new Set([403, 404]);

/** An open thread socket. */
export class ThreadConnection {
  readonly agent: AgentClient<ThreadCallables>;
  readonly root: ThreadSession;
  readonly sessions = {
    /** Starts an empty session with the root's model. */
    create: async () => this.session(await this.agent.call("createSession")),
    list: () => this.agent.call("sessions"),
  };

  readonly #refused: Promise<never>;

  /** `probe` requests the thread over HTTP, which reads the status a refused upgrade answered with. */
  constructor(options: ThreadConnectionOptions, probe: () => Promise<Response>) {
    this.agent = new AgentClient<ThreadCallables>(options);
    this.root = this.session(PI_ROOT_SESSION);
    this.#refused = new Promise((_, reject) => {
      let opened = false;
      this.agent.addEventListener("open", () => {
        opened = true;
      });
      this.agent.addEventListener("close", () => {
        if (opened) {
          opened = false;
          return;
        }

        probe().catch((error: Error) => {
          if (error instanceof GroundedError && REFUSED_STATUSES.has(error.status)) {
            this.agent.close();
            reject(error);
          }
        });
      });
    });
    this.#refused.catch(() => undefined);
  }

  /** Resolves once the socket is identified, again after each reconnect, and rejects once the thread refuses it. */
  get ready() {
    return Promise.race([this.agent.ready, this.#refused]);
  }

  session(id: string) {
    return new ThreadSession(this, id);
  }

  close() {
    this.agent.close();
  }
}

function socketAddress(baseUrl: string) {
  const url = new URL(baseUrl);
  return {
    agent: PEBBLE_AGENT,
    host: url.host,
    protocol: url.protocol === "https:" ? ("wss" as const) : ("ws" as const),
  };
}

export function pebbleModels(models: readonly Model[]) {
  const groups = new Map<string, Model[]>();
  for (const model of models) {
    const deployments = groups.get(model.name) ?? [];
    deployments.push(model);
    groups.set(model.name, deployments);
  }

  return [...groups].flatMap(([name, deployments]) => {
    if (
      name.includes("*") ||
      deployments.some(
        (model) =>
          model.max_input_tokens === null ||
          model.max_output_tokens === null ||
          model.supports_function_calling !== true,
      )
    ) {
      return [];
    }

    const efforts = deployments[0]!.supported_reasoning_efforts;
    // LiteLLM's catalog omits `supports_reasoning` for most models without reasoning, which then have no efforts.
    const reasoning = deployments.some((model) =>
      efforts?.length === 0
        ? model.supports_reasoning === true
        : model.supports_reasoning !== false,
    );
    let thinkingLevels: ThinkingLevel[] | null;
    if (!reasoning) {
      thinkingLevels = ["off"];
    } else if (efforts === null) {
      thinkingLevels = null;
    } else {
      thinkingLevels = thinkingLevelSchema.options.filter((level) =>
        efforts.includes(level === "off" ? "none" : level),
      );
    }
    if (thinkingLevels?.length === 0) {
      return [];
    }

    return [
      {
        name,
        maxInputTokens: Math.min(...deployments.map((model) => model.max_input_tokens!)),
        maxOutputTokens: Math.min(...deployments.map((model) => model.max_output_tokens!)),
        vision: deployments.every((model) => model.supports_vision === true),
        reasoning,
        thinkingLevels,
      },
    ];
  });
}

/** Pebble threads, following the OpenAI and LangGraph SDKs' `threads` resource. */
export class Threads {
  constructor(private readonly api: Api) {}

  /** The caller's unarchived threads, most recently used first. */
  list(options: ListThreadsOptions = {}): Promise<ThreadPage> {
    return this.api.json(`/pebble${query(options)}`, threadPageSchema);
  }

  get(threadId: string): Promise<Thread> {
    return this.api.json(`/pebble/${threadId}`, threadSchema);
  }

  create({ id = crypto.randomUUID(), ...options }: CreateThreadOptions): Promise<Thread> {
    return this.api.json(`/pebble/${id}`, threadSchema, {
      method: "PUT",
      body: JSON.stringify(options),
    });
  }

  update(threadId: string, options: UpdateThreadOptions): Promise<Thread> {
    return this.api.json(`/pebble/${threadId}`, threadSchema, {
      method: "PATCH",
      body: JSON.stringify(updateThreadSchema.parse(options)),
    });
  }

  /** Opens a connection for jobs and other non-React clients. */
  async open(threadId: string): Promise<ThreadConnection> {
    return new ThreadConnection(await this.connectionOptions(threadId), () =>
      this.api.request(`/pebble/${threadId}`),
    );
  }

  /** Supplies connection options without opening a socket. */
  async connectionOptions(threadId: string): Promise<ThreadConnectionOptions> {
    const { auth } = this.api;
    if (auth.type === "network") {
      return {
        ...socketAddress(auth.baseUrl),
        basePath: `pebble/${threadId}`,
        protocols: async () => [SUBPROTOCOL],
      };
    }

    const { orgId, credentials } = auth;
    return {
      ...socketAddress((await credentials()).apiBaseUrl),
      basePath: `orgs/${orgId}/pebble/${threadId}`,
      protocols: async () => [
        SUBPROTOCOL,
        `${WEBSOCKET_TOKEN_PREFIX}${(await credentials()).token}`,
      ],
    };
  }
}
