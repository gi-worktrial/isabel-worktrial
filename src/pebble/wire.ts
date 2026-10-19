// what a Pebble answer carries beside its words, the entries the chat writes into a Pi session, and what the demo's
// Worker reads and sends
import { z } from "zod";

const Id = z.string().min(1);

// a record a Pebble chip opens
const PebbleRecordSchema = z.discriminatedUnion("record", [
  z.strictObject({ record: z.literal("issue"), issue: Id }),
  z.strictObject({ record: z.literal("candidate"), issue: Id, candidate: Id }),
  z.strictObject({ record: z.literal("eval"), eval: Id }),
  z.strictObject({ record: z.literal("trace"), session: Id, trace: Id }),
]);
export type PebbleRecord = z.infer<typeof PebbleRecordSchema>;

/** A chip under an answer, which runs only on the engineer's click and only through platform's own calls. */
export const PebbleActionSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("open"), ref: PebbleRecordSchema }),
  z.strictObject({ kind: z.literal("rerun"), issue: Id, candidate: Id }),
  z.strictObject({ kind: z.literal("include_trace"), issue: Id, trace: Id }),
  z.strictObject({ kind: z.literal("exclude_trace"), issue: Id, trace: Id }),
]);
export type PebbleAction = z.infer<typeof PebbleActionSchema>;

/** The ids an action names, each of which its answer's context has to mention. */
export function actionIds(action: PebbleAction): string[] {
  if (action.kind !== "open") {
    return action.kind === "rerun"
      ? [action.issue, action.candidate]
      : [action.issue, action.trace];
  }
  const { ref } = action;
  switch (ref.record) {
    case "issue":
      return [ref.issue];
    case "candidate":
      return [ref.issue, ref.candidate];
    case "eval":
      return [ref.eval];
    case "trace":
      return [ref.session, ref.trace];
  }
}

// a record the engineer can @mention, by the label its chip shows
const MentionSchema = z.strictObject({
  kind: z.enum(["issue", "trace", "eval", "candidate"]),
  label: z.string(),
  detail: z.string(),
  ref: PebbleRecordSchema,
});
export type Mention = z.infer<typeof MentionSchema>;

// a record Pebble read with a question, by the name its chip shows
const ReadRecordSchema = z.strictObject({ ref: PebbleRecordSchema, label: z.string() });
export type ReadRecord = z.infer<typeof ReadRecordSchema>;

/** Written ahead of a question: the Agent it was asked under, the records its context read and the ones it mentions. */
export const READ_ENTRY = "grounded.read";
export const ReadNoteSchema = z.strictObject({
  agent: z.string().nullable(),
  read: z.array(ReadRecordSchema),
  mentions: z.array(MentionSchema),
});
export type ReadNote = z.infer<typeof ReadNoteSchema>;

/** A question's own context and its Read note, written ahead of it. */
export type Question = { context: string; note: ReadNote };

/** Written after a demo answer: its chips. */
export const ACTIONS_ENTRY = "grounded.actions";
export const ActionsNoteSchema = z.array(PebbleActionSchema);

/** Written when the engineer runs a chip: the actions entry it came from and the action. */
export const DONE_ENTRY = "grounded.done";
export const DoneNoteSchema = z.strictObject({
  actions: z.number().int().positive(),
  action: PebbleActionSchema,
});
export type DoneNote = z.infer<typeof DoneNoteSchema>;

const TextSchema = z.strictObject({ type: z.literal("text"), text: z.string() });

// one of Pebble's messages in a recording or a Worker answer, Pi's assistant or tool result message without its bookkeeping
const AnswerMessageSchema = z.discriminatedUnion("role", [
  z.strictObject({
    role: z.literal("assistant"),
    content: z.array(
      z.discriminatedUnion("type", [
        TextSchema,
        z.strictObject({ type: z.literal("thinking"), thinking: z.string() }),
        z.strictObject({
          type: z.literal("toolCall"),
          id: Id,
          name: Id,
          arguments: z.record(z.string(), z.json()),
        }),
      ]),
    ),
  }),
  z.strictObject({
    role: z.literal("toolResult"),
    toolCallId: Id,
    toolName: Id,
    content: z.array(TextSchema),
    isError: z.boolean(),
  }),
]);

/** An answer, whole or so far: Pebble's messages, then the chips under it. */
export const PebbleAnswerSchema = z.strictObject({
  messages: z.array(AnswerMessageSchema),
  actions: z.array(PebbleActionSchema),
});
export type PebbleAnswer = z.infer<typeof PebbleAnswerSchema>;

/** One line of the Worker's answer stream: the answer so far, or why it stopped. */
export const AnswerLineSchema = z.union([
  z.strictObject({ answer: PebbleAnswerSchema }),
  z.strictObject({ error: z.string() }),
]);
export type AnswerLine = z.infer<typeof AnswerLineSchema>;

/** One question to the demo's Worker: the screen and its records, then the thread's turns ending with the question. */
export const PebbleRequestSchema = z.strictObject({
  context: z.string(),
  messages: z
    .array(z.strictObject({ role: z.enum(["user", "assistant"]), text: z.string() }))
    .min(1),
});
export type PebbleRequest = z.infer<typeof PebbleRequestSchema>;
