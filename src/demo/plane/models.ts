// the settings service's models and usage for one Agent: what its Eval trials called through the gateway, read from
// the chat spans of the recordings they replay (gen_ai.request.model, gen_ai.provider.name and gen_ai.usage)
import type { Model, OrgUsage, Trace, UsageRange } from "#src/sdk/index";

import { DAY_MS } from "./clock.ts";
import type { Played } from "./runs.ts";

const MODEL = "gen_ai.request.model";
const PROVIDER = "gen_ai.provider.name";
const OPERATION = "gen_ai.operation.name";
const INPUT_TOKENS = "gen_ai.usage.input_tokens";
const OUTPUT_TOKENS = "gen_ai.usage.output_tokens";
// the services' usage range when no start is given
const USAGE_DAYS = 30;

type Metrics = OrgUsage["models"][number];
type Requests = Map<string, { provider: string; requests: number; input: number; output: number }>;

const isoDay = (at: number) => new Date(at).toISOString().slice(0, 10);

/** The range the services resolve: `end` defaults to today and `start` to 30 days before it. */
export function usageRange({ start, end }: UsageRange, now: number) {
  const last = end ?? isoDay(now);
  return { start: start ?? isoDay(Date.parse(last) - USAGE_DAYS * DAY_MS), end: last };
}

// each model a recorded trial called, with how many requests it made and their tokens
function requestsOf(trace: Trace): Requests {
  const requests: Requests = new Map();
  for (const { attributes } of trace.spans) {
    const model = attributes[MODEL];
    if (attributes[OPERATION] !== "chat" || model === undefined) {
      continue;
    }
    const known = requests.get(model) ?? {
      provider: attributes[PROVIDER] ?? "openai",
      requests: 0,
      input: 0,
      output: 0,
    };
    requests.set(model, {
      ...known,
      requests: known.requests + 1,
      input: known.input + Number(attributes[INPUT_TOKENS] ?? 0),
      output: known.output + Number(attributes[OUTPUT_TOKENS] ?? 0),
    });
  }
  return requests;
}

/** The settings service's models and usage over the trials an Agent's runs played, each replaying a recorded trace. */
export function modelUsage(
  runs: () => readonly Played[],
  load: (id: string) => Promise<Trace | undefined>,
  now: () => number,
) {
  const recorded = new Map<string, Promise<Requests>>();
  const requestsAt = (id: string) => {
    let found = recorded.get(id);
    if (found === undefined) {
      found = load(id).then((trace) => (trace === undefined ? new Map() : requestsOf(trace)));
      recorded.set(id, found);
    }
    return found;
  };
  const trials = () => runs().flatMap(({ trials: rows }) => rows);

  return {
    models: async (): Promise<Model[]> => {
      const called = new Map<string, string>();
      for (const requests of await Promise.all(
        [...new Set(trials().flatMap(({ recorded: id }) => (id === null ? [] : [id])))].map(
          requestsAt,
        ),
      )) {
        for (const [model, { provider }] of requests) {
          called.set(model, provider);
        }
      }
      return [...called].map(([name, provider]) => ({
        id: `${provider}/${name}`,
        name,
        model: `${provider}/${name}`,
        owner: "shared",
        editable: false,
        max_input_tokens: null,
        max_output_tokens: null,
        supports_function_calling: null,
        supports_vision: null,
        supports_reasoning: null,
        supported_reasoning_efforts: null,
      }));
    },
    usage: async (range: UsageRange = {}): Promise<OrgUsage> => {
      const { start, end } = usageRange(range, now());
      const within = trials().filter(
        ({ recorded: id, started_at }) =>
          id !== null && started_at.slice(0, 10) >= start && started_at.slice(0, 10) <= end,
      );
      const totals = new Map<string, Metrics>();
      for (const [index, requests] of (
        await Promise.all(within.map(({ recorded: id }) => requestsAt(id ?? "")))
      ).entries()) {
        const tokens = [...requests.values()].reduce(
          (sum, { input, output }) => sum + input + output,
          0,
        );
        for (const [model, { requests: count, input, output }] of requests) {
          const known = totals.get(model) ?? {
            model,
            api_requests: 0,
            prompt_tokens: 0,
            completion_tokens: 0,
            spend: 0,
          };
          // a trial's cost goes to its models by their share of its tokens
          const cost = within[index]?.cost_usd ?? 0;
          totals.set(model, {
            model,
            api_requests: known.api_requests + count,
            prompt_tokens: known.prompt_tokens + input,
            completion_tokens: known.completion_tokens + output,
            spend: known.spend + (tokens === 0 ? 0 : (cost * (input + output)) / tokens),
          });
        }
      }
      return { start, end, models: [...totals.values()] };
    },
  };
}

/** One organization's usage, each model's metrics summed over its Agents. */
export function summedUsage(
  usages: readonly OrgUsage[],
  range: { start: string; end: string },
): OrgUsage {
  const totals = new Map<string, Metrics>();
  for (const row of usages.flatMap(({ models }) => models)) {
    const known = totals.get(row.model);
    totals.set(
      row.model,
      known === undefined
        ? row
        : {
            model: row.model,
            api_requests: known.api_requests + row.api_requests,
            prompt_tokens: known.prompt_tokens + row.prompt_tokens,
            completion_tokens: known.completion_tokens + row.completion_tokens,
            spend: known.spend + row.spend,
          },
    );
  }
  return { ...range, models: [...totals.values()] };
}
