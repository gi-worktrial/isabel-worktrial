import { z } from "zod";

export const debugSearchSchema = z.object({
  view: z.enum(["grades", "traces"]).optional(),
  afters: z.array(z.string()).optional(),
  file: z.string().optional(),
});
export type DebugSearch = z.output<typeof debugSearchSchema>;
