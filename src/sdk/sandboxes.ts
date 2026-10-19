import { z } from "zod";
import type { Api } from "./api.ts";

const liveSandboxSchema = z.object({
  id: z.string(),
  /** A user's id, or `agent:<id>` for a sandbox an agent's job created. */
  creator: z.string(),
  /** The service the creator's token was delegated to (`cobblestone` for Pebble), or null for the creator's own token. */
  actor: z.string().nullable(),
  run: z.string().nullable(),
  created_at: z.iso.datetime(),
});

const reservationSchema = z.object({
  run: z.string(),
  sandboxes: z.number().int(),
  created_at: z.iso.datetime(),
});

export const sandboxUsageSchema = z.object({
  limit: z.number().int(),
  /** Live sandboxes plus every job run's reserved slots, filled or not (paused sandboxes don't count). */
  used: z.number().int(),
  sandboxes: z.array(liveSandboxSchema),
  reservations: z.array(reservationSchema),
});

export type SandboxUsage = z.output<typeof sandboxUsageSchema>;

/** The organization's sandboxes against its limit (needs `sandbox:manage`). */
export class Sandboxes {
  constructor(private readonly api: Api) {}

  usage() {
    return this.api.json("/sandboxes/usage", sandboxUsageSchema);
  }
}
