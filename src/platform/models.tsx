import { type Model, type NewModel, type UsageRange } from "@grounded-intelligence/grounded-sdk";
import type { SubmitEvent } from "react";
import { Button } from "#/ui/button";
import { Input } from "#/ui/input";
import { Tag } from "#/ui/tag";
import { z } from "zod";

const compact = new Intl.NumberFormat("en", { notation: "compact" });

type Metrics = {
  api_requests: number;
  prompt_tokens: number;
  completion_tokens: number;
  spend: number;
};

/** Adds a model from its name, LiteLLM's `provider/model`, and optional provider credentials. */
export function ModelForm({ create }: { create: (model: NewModel) => Promise<void> }) {
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const optional = (name: string) => String(fields.get(name) ?? "") || undefined;
    await create({
      name: String(fields.get("name")),
      model: String(fields.get("model")),
      api_key: optional("api_key"),
      api_base: optional("api_base"),
    });
    form.reset();
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap gap-2">
      <Input name="name" aria-label="Name" placeholder="Name" required className="w-48" />
      <Input
        name="model"
        aria-label="Model"
        placeholder="anthropic/claude-sonnet-5"
        required
        className="w-64"
      />
      <Input
        name="api_key"
        type="password"
        aria-label="Provider API key"
        placeholder="Provider API key"
        className="w-48"
      />
      <Input
        name="api_base"
        type="url"
        aria-label="API base"
        placeholder="API base (optional)"
        className="w-48"
      />
      <Button type="submit">Add</Button>
    </form>
  );
}

/** Usage rows labeled by `label` (a model or organization). */
export function UsageTable({ rows }: { rows: (Metrics & { label: string })[] }) {
  return (
    <div className="card overflow-clip">
      <table className="record-table">
        <thead>
          <tr>
            <th />
            <th>Requests</th>
            <th className="@max-lg:hidden">Prompt tokens</th>
            <th className="@max-lg:hidden">Completion tokens</th>
            <th>Spend</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td>{row.label}</td>
              <td className="tabular-nums">{compact.format(row.api_requests)}</td>
              <td className="tabular-nums @max-lg:hidden">{compact.format(row.prompt_tokens)}</td>
              <td className="tabular-nums @max-lg:hidden">
                {compact.format(row.completion_tokens)}
              </td>
              <td className="tabular-nums">${row.spend.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ModelReasoning({ model }: { model: Model }) {
  const efforts = model.supported_reasoning_efforts;
  if (efforts === null) {
    return null;
  }
  if (efforts.length === 0) {
    return <div className="type-meta-12 text-muted">No reasoning</div>;
  }

  return (
    <div className="flex flex-wrap items-center gap-1 type-meta-12 text-muted">
      Reasoning
      {efforts.map((effort) => (
        <Tag key={effort}>{effort}</Tag>
      ))}
    </div>
  );
}

export const usageRangeSchema = z.object({
  start: z.iso.date().optional(),
  end: z.iso.date().optional(),
});

/** Date inputs for a usage range, showing the range the server resolved. */
export function UsageRangeInputs({
  range,
  onChange,
}: {
  range: { start: string; end: string };
  onChange: (change: UsageRange) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Input
        type="date"
        aria-label="Start"
        value={range.start}
        max={range.end}
        required
        onChange={(event) =>
          event.currentTarget.validity.valid && onChange({ start: event.currentTarget.value })
        }
        className="w-40"
      />
      <span className="text-muted">to</span>
      <Input
        type="date"
        aria-label="End"
        value={range.end}
        min={range.start}
        required
        onChange={(event) =>
          event.currentTarget.validity.valid && onChange({ end: event.currentTarget.value })
        }
        className="w-40"
      />
    </div>
  );
}
