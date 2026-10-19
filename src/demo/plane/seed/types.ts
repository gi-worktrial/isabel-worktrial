import { z } from "zod";

import { SeedFileSchemas } from "./files.ts";
import { EvaluationSchema } from "./otlp.ts";
import { NativeTracesSchema } from "./traces.ts";

export type { PullRecord } from "./pulls.ts";

const { scenario, ...files } = SeedFileSchemas;

/** A complete in-memory seed whose files browser loading validates separately. */
export const SeedSchema = scenario.extend({
  ...files,
  traces: NativeTracesSchema,
  /** The evaluations each annotated run exported, by run id, as its OTLP logs file holds them. */
  evaluations: z.record(z.string(), z.array(EvaluationSchema)).optional(),
});
export type Seed = z.infer<typeof SeedSchema> & {
  loadTrace?:
    | ((id: string) => Promise<z.infer<typeof NativeTracesSchema>[number] | undefined>)
    | undefined;
};
