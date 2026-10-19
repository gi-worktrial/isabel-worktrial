import type { SandboxUsage } from "@grounded-intelligence/grounded-sdk";
import { useSuspenseQuery } from "@tanstack/react-query";
import { agentsQuery, memberNamesQuery, sandboxUsageQuery } from "#/queries";
import { Link, createFileRoute } from "@tanstack/react-router";

import { EmptyState } from "#/ui/empty-state";
import { FieldGroup } from "#/ui/field";
import { Tooltip } from "#/ui/tooltip";
import { crumbs } from "#/crumbs";
import { SettingsPage } from "#src/features/settings/settings-page";
import { TimeTag } from "#src/ui/time-tag";

const AGENT_CREATOR_PREFIX = "agent:";
const PEBBLE_ACTOR = "cobblestone";

/** A sandbox, or a job run's whole reservation, so the rows' slots add up to `used`. */
type Holder = {
  key: string;
  creator: string | undefined;
  actor: string | null;
  run: string | null;
  slots: number;
  running: number;
  since: string;
};

export const Route = createFileRoute("/$orgId/settings/sandboxes")({
  loader: async ({ context: { queryClient }, params }) => {
    await Promise.all([
      queryClient.ensureQueryData(sandboxUsageQuery(params)),
      queryClient.ensureQueryData(memberNamesQuery(params)),
      queryClient.ensureQueryData(agentsQuery(params)),
    ]);
    return crumbs(
      { label: "Settings", to: "/$orgId/settings" },
      { label: "Sandboxes", to: "/$orgId/settings/sandboxes" },
    );
  },
  component: Sandboxes,
});

function Sandboxes() {
  const { orgId } = Route.useParams();
  const usage = useSuspenseQuery(sandboxUsageQuery({ orgId })).data;
  const names = useSuspenseQuery(memberNamesQuery({ orgId })).data;
  const agents = useSuspenseQuery(agentsQuery({ orgId })).data;
  const agentNames = new Map(agents.map((agent) => [agent.id, agent.name]));
  const holders = holdersOf(usage);

  function agentOf(creator: string | undefined) {
    return creator?.startsWith(AGENT_CREATOR_PREFIX)
      ? agentNames.get(creator.slice(AGENT_CREATOR_PREFIX.length))
      : undefined;
  }

  function purpose({ run, actor, creator }: Holder) {
    if (run === null) {
      return actor === PEBBLE_ACTOR ? "Pebble" : "API";
    }

    const agent = agentOf(creator);
    if (agent === undefined) {
      return `Job run ${run}`;
    }

    return (
      <Link
        to="/$orgId/agents/$agent/runs/$run"
        params={{ orgId, agent, run }}
        className="text-accent-ink hover:underline"
      >
        {agent} job run
      </Link>
    );
  }

  return (
    <SettingsPage title="Sandboxes">
      <FieldGroup title="Sandbox limit">
        <Meter usage={usage} />
      </FieldGroup>
      <FieldGroup title="Active sandboxes">
        <div className="card overflow-clip">
          {holders.length === 0 ? (
            <EmptyState
              title="No sandboxes are running"
              description="Paused sandboxes don't count against the limit."
            />
          ) : (
            <table className="record-table">
              <thead>
                <tr>
                  <th className="w-full">For</th>
                  <th className="@max-lg:hidden">Started by</th>
                  <th>Slots</th>
                  <th>Started</th>
                </tr>
              </thead>
              <tbody>
                {holders.map((holder) => (
                  <tr key={holder.key}>
                    <td className="max-w-0">{purpose(holder)}</td>
                    <td className="@max-lg:hidden">
                      {holder.creator === undefined
                        ? "—"
                        : (agentOf(holder.creator) ?? names[holder.creator] ?? holder.creator)}
                    </td>
                    <td className="tabular-nums">
                      {holder.running < holder.slots ? (
                        <Tooltip label={`${holder.running} of ${holder.slots} started`}>
                          <span tabIndex={0}>{holder.slots}</span>
                        </Tooltip>
                      ) : (
                        holder.slots
                      )}
                    </td>
                    <td className="whitespace-nowrap">
                      <TimeTag at={holder.since} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </FieldGroup>
    </SettingsPage>
  );
}

function Meter({ usage }: { usage: SandboxUsage }) {
  const percent = Math.round((usage.used / usage.limit) * 100);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-4 tabular-nums">
        <p className="type-label-13 text-muted">
          <span className="type-heading-15 text-ink">{usage.used}</span> of {usage.limit} in use
        </p>
        <span className="type-label-13 text-muted">{percent}%</span>
      </div>
      <div
        role="meter"
        aria-label="Sandbox limit used"
        aria-valuemin={0}
        aria-valuemax={usage.limit}
        aria-valuenow={usage.used}
        className="h-2 overflow-hidden rounded-full bg-fill"
      >
        <div className="h-full bg-accent" style={{ width: `${Math.min(percent, 100)}%` }} />
      </div>
    </div>
  );
}

function holdersOf(usage: SandboxUsage): Holder[] {
  const reserved = new Set(usage.reservations.map(({ run }) => run));
  const runs = usage.reservations.map(({ run, sandboxes, created_at }) => {
    const live = usage.sandboxes.filter((sandbox) => sandbox.run === run);
    return {
      key: run,
      creator: live[0]?.creator,
      actor: null,
      run,
      slots: sandboxes,
      running: live.length,
      since: created_at,
    };
  });
  const loose = usage.sandboxes
    .filter(({ run }) => run === null || !reserved.has(run))
    .map(({ id, creator, actor, run, created_at }) => ({
      key: id,
      creator,
      actor,
      run,
      slots: 1,
      running: 1,
      since: created_at,
    }));

  return [...runs, ...loose].sort((a, b) => b.since.localeCompare(a.since));
}
