import { z } from "zod";

import { SeedSchema } from "./types.ts";

/** Facts the tiny fixture's tests use to address its records. */
const TinyFactsSchema = z.strictObject({
  start: z.string(),
  agent: z.string(),
  issue: z.string(),
  viewer: z.string(),
  candidate: z.string(),
  failing: z.array(z.string()),
  prompt: z.string(),
});
export const TinyFixtureSchema = z.strictObject({ facts: TinyFactsSchema, seed: SeedSchema });
