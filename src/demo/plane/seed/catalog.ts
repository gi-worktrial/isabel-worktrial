// index.json lists one Agent per company
import { z } from "zod";

// an ink mark takes the text colour to follow the theme, and a null mark shows a neutral one
export const AgentMarkSchema = z
  .strictObject({ src: z.string().min(1), ink: z.boolean() })
  .readonly();

const AgentCatalogEntrySchema = z
  .strictObject({
    agentId: z.string().min(1),
    name: z.string().min(1),
    mark: AgentMarkSchema.nullable(),
  })
  .readonly();
export type AgentCatalogEntry = z.infer<typeof AgentCatalogEntrySchema>;

export const AgentCatalogSchema = z
  .strictObject({ agents: z.array(AgentCatalogEntrySchema).readonly() })
  .readonly();
