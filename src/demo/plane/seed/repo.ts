import { z } from "zod";

const EntrySchema = z.strictObject({
  name: z.string(),
  mode: z.string(),
  type: z.enum(["blob", "tree"]),
  sha: z.string(),
});
const PersonSchema = z.strictObject({ name: z.string(), email: z.string(), date: z.string() });
const CommitSchema = z.strictObject({
  tree: z.string(),
  parents: z.array(z.string()),
  message: z.string(),
  author: PersonSchema,
  committer: PersonSchema,
});

/** The complete git object store, including tombstoned refs and exact blob text. */
export const RepoSchema = z.strictObject({
  blobs: z.record(z.string(), z.string()),
  trees: z.record(z.string(), z.array(EntrySchema)),
  commits: z.record(z.string(), CommitSchema),
  refs: z.record(z.string(), z.string().nullable()),
});
