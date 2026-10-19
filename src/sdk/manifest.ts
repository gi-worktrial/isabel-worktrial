import { z } from "zod";

/** The repos an agent repo pins, at its root. */
export const MANIFEST_PATH = "repos.toml";

export const pinSchema = z
  .object({
    revision: z.string().regex(/^([0-9a-f]{40}|[0-9a-f]{64})$/),
    branch: z.string().optional(),
  })
  .loose();

export const manifestSchema = z
  .object({
    repos: z.record(z.string().regex(/^[a-zA-Z0-9_][a-zA-Z0-9_-]{0,127}$/), pinSchema).default({}),
  })
  .loose();

export type Pin = z.output<typeof pinSchema>;
export type Pins = z.output<typeof manifestSchema>["repos"];
