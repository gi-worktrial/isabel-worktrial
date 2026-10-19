import { z } from "zod";
import { type Api, query } from "./api.ts";

const modelSchema = z.object({
  id: z.string(),
  /** What callers pass as `model` (`<org>/<name>` for an organization's own models). */
  name: z.string(),
  /** LiteLLM's `provider/model`. */
  model: z.string(),
  /** `shared`, or the UUID of the organization that owns the model. */
  owner: z.string().nullable(),
  editable: z.boolean(),
  max_input_tokens: z.number().int().positive().nullable(),
  max_output_tokens: z.number().int().positive().nullable(),
  supports_function_calling: z.boolean().nullable(),
  supports_vision: z.boolean().nullable(),
  supports_reasoning: z.boolean().nullable(),
  /** Supported reasoning efforts for every deployment sharing this name. */
  supported_reasoning_efforts: z.array(z.string()).nullable(),
});

const metricsSchema = z.object({
  api_requests: z.number(),
  prompt_tokens: z.number(),
  completion_tokens: z.number(),
  spend: z.number(),
});

const modelsSchema = z.object({ models: z.array(modelSchema) });
const createdSchema = z.object({ id: z.string(), name: z.string() });
const orgUsageSchema = z.object({
  start: z.string(),
  end: z.string(),
  models: z.array(metricsSchema.extend({ model: z.string() })),
});

const deploymentUsageSchema = orgUsageSchema.extend({
  organizations: z.array(metricsSchema.extend({ org: z.string() })),
});

export type Model = z.infer<typeof modelSchema>;
export type OrgUsage = z.infer<typeof orgUsageSchema>;
export type DeploymentUsage = z.infer<typeof deploymentUsageSchema>;

export type NewModel = {
  name: string;
  /** LiteLLM's `provider/model`, such as `anthropic/claude-sonnet-5`. */
  model: string;
  api_key?: string | undefined;
  api_base?: string | undefined;
};

export type UsageRange = {
  /** `YYYY-MM-DD`, defaulting to 30 days before `end`. */
  start?: string | undefined;
  /** `YYYY-MM-DD`, defaulting to today. */
  end?: string | undefined;
};

/** An organization's models and usage (changes and usage require admin access). */
export class Settings {
  constructor(private readonly api: Api) {}

  /** Shared and organization-owned models. */
  async models() {
    return (await this.api.json("/settings/models", modelsSchema)).models;
  }

  /** Adds a model only this organization can call, named `<org>/<name>`. */
  createModel(model: NewModel) {
    return this.api.json("/settings/models", createdSchema, {
      method: "POST",
      body: JSON.stringify(model),
    });
  }

  async deleteModel(id: string) {
    await this.api.request(`/settings/models/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  }

  usage(range: UsageRange = {}) {
    return this.api.json(`/settings/usage${query(range)}`, orgUsageSchema);
  }
}

/** The data plane's shared models and every organization's usage, for its operators. */
export class Deployment {
  constructor(private readonly api: Api) {}

  async models() {
    const response = await this.api.unscopedRequest("/deployment/models");
    return modelsSchema.parse(await response.json()).models;
  }

  /** Adds a model every organization can call. */
  async createModel(model: NewModel) {
    const response = await this.api.unscopedRequest("/deployment/models", {
      method: "POST",
      body: JSON.stringify(model),
    });

    return createdSchema.parse(await response.json());
  }

  async deleteModel(id: string) {
    await this.api.unscopedRequest(`/deployment/models/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  }

  /** Usage by model and by organization, or by model within one organization when `org` is given. */
  async usage(range: UsageRange & { org?: string | undefined } = {}) {
    const response = await this.api.unscopedRequest(`/deployment/usage${query(range)}`);
    return deploymentUsageSchema.parse(await response.json());
  }
}
