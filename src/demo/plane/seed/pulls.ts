import { z } from "zod";

/** A stored PR whose current heads and mergeability are read from git. */
const PullRecordSchema = z.strictObject({
  number: z.number(),
  title: z.string(),
  body: z.string().nullable(),
  labels: z.array(z.string()),
  head: z.string(),
  base: z.string(),
  user: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  closed_at: z.string().nullable(),
  merged_at: z.string().nullable(),
  head_sha: z.string().nullable(),
  merge_commit_sha: z.string().nullable(),
});
export const PullsSchema = z.array(PullRecordSchema);
export type PullRecord = z.infer<typeof PullRecordSchema>;
