import {
  useMutation,
  useQueryClient,
  useSuspenseQueries,
  useSuspenseQuery,
} from "@tanstack/react-query";
import {
  branchHead,
  installationReposQuery,
  installationsQuery,
  keysQuery,
  manifestQuery,
  reposQuery,
  isRunLive,
  runsKey,
  runsQuery,
  RUN_POLL_INTERVAL,
} from "#/queries";
import { RunTable } from "#/automations";
import { pinsOf, writePins } from "#/github";
import { type CreatedApiKey, GroundedError, type Pin } from "@grounded-intelligence/grounded-sdk";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Ellipsis, Plus, RefreshCw, Trash2 } from "lucide-react";
import { type SubmitEvent, Suspense, useEffect, useRef, useState, useTransition } from "react";
import { Button, buttonVariants } from "#/ui/button";
import { cn } from "#/ui/cn";
import { CopyButton } from "#/ui/copy-button";
import { FieldGroup } from "#/ui/field";
import { Input } from "#/ui/input";
import { GitHubMark } from "#/ui/marks";
import { Dropdown, MenuItem } from "#/ui/menu";
import { ConfirmDialog, Modal } from "#/ui/dialog";
import { SearchField } from "#/ui/search-field";
import { Skeleton } from "#/ui/skeleton";
import { Tag } from "#/ui/tag";
import { Timestamp } from "#/ui/timestamp";
import { crumbs } from "#/crumbs";
import { EmptyLine, SettingsPage } from "#src/features/settings/settings-page";

const BRANCH_MOVED_STATUS = 409;
const ROLL_REPOS_JOB = "grounded/roll-repos";
const RECENT_SYNCS = 5;
const IDLE_SYNC_POLL_INTERVAL = 60_000;

export const Route = createFileRoute("/$orgId/agents/$agent/settings")({
  loader: async ({ context: { access, queryClient }, params }) => {
    await Promise.all([
      queryClient.ensureQueryData(runsQuery({ ...params, job: ROLL_REPOS_JOB, page: 1 })),
      queryClient.ensureQueryData(manifestQuery(params)),
      queryClient.ensureQueryData(reposQuery(params)),
      access.admin ? queryClient.ensureQueryData(keysQuery(params)) : undefined,
    ]);
    return crumbs({ label: "Agent settings", to: "/$orgId/agents/$agent/settings" });
  },
  component: AgentSettings,
});

function AgentSettings() {
  const { access } = Route.useRouteContext();

  return (
    <SettingsPage title="Agent settings">
      <Repositories />
      <Syncs />
      {access.admin && <ApiKeys />}
      {access.admin && <DeleteAgent />}
    </SettingsPage>
  );
}

function Repositories() {
  const { orgId, agent } = Route.useParams();
  const { client } = Route.useRouteContext();
  const manifest = useSuspenseQuery(manifestQuery({ orgId, agent })).data;
  const repos = useSuspenseQuery(reposQuery({ orgId })).data;
  const queryClient = useQueryClient();
  const [error, setError] = useState<string>();
  const pins = Object.entries(pinsOf(manifest));
  const fullName = (name: string) =>
    repos.find((repo) => repo.name === name)?.github?.full_name ?? name;

  async function commit(changes: () => Promise<Record<string, Pin | undefined>>) {
    try {
      await writePins(client, manifest, await changes());
      return undefined;
    } catch (caught) {
      if (caught instanceof GroundedError && caught.status === BRANCH_MOVED_STATUS) {
        return "This Agent changed since the page loaded, so it now shows the latest";
      }
      return caught instanceof Error ? caught.message : String(caught);
    } finally {
      await queryClient.invalidateQueries();
    }
  }

  const add = (fullNames: string[]) =>
    commit(async () =>
      Object.fromEntries(
        await Promise.all(
          fullNames.map(async (github) => {
            const repo =
              repos.find((connected) => connected.github?.full_name === github) ??
              (await client.repos.create({ name: github.split("/")[1] ?? github, github }));
            const revision = await branchHead(client, repo.name, repo.default_branch);
            return [repo.name, { revision, branch: repo.default_branch }] as const;
          }),
        ),
      ),
    );

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col">
          <h2 className="type-heading-15 text-[16px]/[24px] text-ink">Repositories</h2>
          <p className="type-copy-14 text-muted">
            Checked out beside the Agent's code in chats and jobs, at their branch's head as of the
            last hour.
          </p>
        </div>
        <AddRepositories
          pinned={new Set(pins.map(([name]) => fullName(name)))}
          connected={new Set(repos.flatMap(({ github }) => (github ? [github.full_name] : [])))}
          onAdd={add}
        />
      </div>
      {pins.length === 0 && <EmptyLine>No repositories added yet</EmptyLine>}
      {pins.length > 0 && (
        <ul className="card divide-y divide-divider">
          {pins.map(([name, { revision, branch }]) => (
            <li key={name} className="flex items-center gap-2.5 px-3 py-2">
              <GitHubMark className="text-muted" />
              <span className="min-w-0 flex-1 truncate type-label-13 font-medium">
                {fullName(name)}
              </span>
              {branch !== undefined && <Tag className="type-mono-12">{branch}</Tag>}
              <span className="type-mono-12 text-muted">{revision.slice(0, 12)}</span>
              <Dropdown
                align="end"
                trigger={
                  <button
                    type="button"
                    aria-label={`Actions for ${name}`}
                    className={cn(
                      buttonVariants({ variant: "quiet", size: null }),
                      "size-7 data-[state=open]:bg-fill",
                    )}
                  >
                    <Ellipsis className="size-4" />
                  </button>
                }
              >
                <MenuItem
                  onSelect={async () => setError(await commit(async () => ({ [name]: undefined })))}
                >
                  <Trash2 className="size-4 text-muted" />
                  Remove
                </MenuItem>
              </Dropdown>
            </li>
          ))}
        </ul>
      )}
      {error !== undefined && (
        <p role="alert" className="type-label-13 text-danger">
          {error}
        </p>
      )}
    </section>
  );
}

function Syncs() {
  const { orgId, agent } = Route.useParams();
  const { client } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const runs = useSuspenseQuery({
    ...runsQuery({ orgId, agent, job: ROLL_REPOS_JOB, page: 1 }),
    // Polls while idle too, so an hourly sync shows up.
    refetchInterval: ({ state }) =>
      state.data?.some(isRunLive) ? RUN_POLL_INTERVAL : IDLE_SYNC_POLL_INTERVAL,
  }).data.slice(0, RECENT_SYNCS);
  const completed = runs
    .filter(({ status }) => status === "completed")
    .map(({ id }) => id)
    .join();
  const seen = useRef(completed);
  useEffect(() => {
    if (seen.current !== completed) {
      seen.current = completed;
      void queryClient.invalidateQueries({ queryKey: manifestQuery({ orgId, agent }).queryKey });
    }
  }, [completed, orgId, agent, queryClient]);
  const sync = useMutation({
    mutationFn: () => client.jobs.dispatch({ agent, job: ROLL_REPOS_JOB }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: runsKey({ orgId, agent }) }),
  });

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col">
          <h2 className="type-heading-15 text-[16px]/[24px] text-ink">Syncs</h2>
          <p className="type-copy-14 text-muted">Each pin moves to its branch's head every hour.</p>
        </div>
        <Button
          size="small"
          disabled={sync.isPending || runs.some(isRunLive)}
          onClick={() => sync.mutate()}
        >
          <RefreshCw className="size-4" />
          Sync now
        </Button>
      </div>
      {sync.error !== null && (
        <p role="alert" className="type-label-13 text-danger">
          {sync.error.message}
        </p>
      )}
      <RunTable
        params={{ orgId, agent }}
        runs={runs}
        empty={{ title: "No syncs yet", description: "The first one runs within the hour." }}
      />
    </section>
  );
}

function AddRepositories({
  pinned,
  connected,
  onAdd,
}: {
  pinned: ReadonlySet<string>;
  connected: ReadonlySet<string>;
  onAdd(fullNames: string[]): Promise<string | undefined>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Modal
      trigger={
        <Button size="small">
          <Plus className="size-4" />
          Add repository
        </Button>
      }
      title="Add repositories"
      open={open}
      onOpenChange={setOpen}
      className="w-[min(480px,calc(100vw-32px))]"
    >
      <Suspense fallback={<Skeleton className="h-48" />}>
        <RepositoryPicker
          pinned={pinned}
          connected={connected}
          onAdd={onAdd}
          onDone={() => setOpen(false)}
        />
      </Suspense>
    </Modal>
  );
}

function RepositoryPicker({
  pinned,
  connected,
  onAdd,
  onDone,
}: {
  pinned: ReadonlySet<string>;
  connected: ReadonlySet<string>;
  onAdd(fullNames: string[]): Promise<string | undefined>;
  onDone(): void;
}) {
  const { orgId } = Route.useParams();
  const { access } = Route.useRouteContext();
  const installations = useSuspenseQuery(installationsQuery({ orgId })).data;
  const available = useSuspenseQueries({
    queries: installations.map(({ id }) => installationReposQuery({ orgId, installation: id })),
  })
    .flatMap(({ data }) => data)
    // Connecting a repository takes repo:manage, which only admins have.
    .filter(
      ({ full_name }) => !pinned.has(full_name) && (access.admin || connected.has(full_name)),
    );
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const shown = available.filter(({ full_name }) =>
    full_name.toLowerCase().includes(query.toLowerCase()),
  );

  function toggle(fullName: string) {
    const next = new Set(selected);
    if (!next.delete(fullName)) {
      next.add(fullName);
    }
    setSelected(next);
  }

  if (installations.length === 0) {
    return (
      <p className="type-copy-14 text-muted">
        Connect GitHub in{" "}
        <Link to="/$orgId/settings/github" params={{ orgId }} className="text-accent-ink">
          organization Settings
        </Link>{" "}
        to add its repositories.
      </p>
    );
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const failure = await onAdd([...selected]);
          setError(failure);
          if (failure === undefined) {
            onDone();
          }
        });
      }}
    >
      <div className="card overflow-clip">
        <div className="p-2">
          <SearchField
            label="Search repositories"
            placeholder="Search repositories"
            value={query}
            onChange={setQuery}
            autoFocus
          />
        </div>
        <ul className="max-h-72 divide-y divide-divider overflow-y-auto border-t border-divider">
          {shown.map(({ full_name }) => (
            <li key={full_name}>
              <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2 hover:bg-fill">
                <input
                  type="checkbox"
                  checked={selected.has(full_name)}
                  onChange={() => toggle(full_name)}
                  className="accent-primary"
                />
                <GitHubMark className="text-muted" />
                <span className="min-w-0 flex-1 truncate type-label-13">{full_name}</span>
              </label>
            </li>
          ))}
          {shown.length === 0 && (
            <li className="px-3 py-6 text-center type-label-13 text-muted">No repositories</li>
          )}
        </ul>
      </div>
      {error !== undefined && (
        <p role="alert" className="type-label-13 text-danger">
          {error}
        </p>
      )}
      <Button
        type="submit"
        variant="primary"
        className="self-end"
        disabled={selected.size === 0 || pending}
      >
        {selected.size > 1 ? `Add ${selected.size} repositories` : "Add repository"}
      </Button>
    </form>
  );
}

function ApiKeys() {
  const { orgId, agent } = Route.useParams();
  const { client } = Route.useRouteContext();
  const keys = useSuspenseQuery(keysQuery({ orgId, agent })).data;
  const queryClient = useQueryClient();
  const [created, setCreated] = useState<CreatedApiKey>();

  async function create(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = String(new FormData(form).get("name"));
    setCreated(await client.agents.createKey({ agent, name }));
    form.reset();
    await queryClient.invalidateQueries();
  }

  async function revoke(id: string) {
    await client.agents.deleteKey({ agent, key: id });

    // Reads the latest state, since a key created while this request ran must keep its secret on screen.
    setCreated((current) => (current?.id === id ? undefined : current));
    await queryClient.invalidateQueries();
  }

  return (
    <FieldGroup title="API keys">
      <p className="type-copy-14 text-muted">
        Exporters send a key with each OTLP export to write this Agent's traces.
      </p>
      {created && (
        <div className="card flex flex-col gap-2 p-3 type-copy-14">
          <p>
            Copy the key for <b>{created.name}</b> now. It won't be shown again.
          </p>
          <KeyLine text={created.key} />
          <p>Send it with each OTLP export:</p>
          <KeyLine text={`OTEL_EXPORTER_OTLP_HEADERS="Authorization=Bearer ${created.key}"`} />
        </div>
      )}
      {keys.length > 0 && (
        <div className="card overflow-clip">
          <table className="record-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Key</th>
                <th className="@max-lg:hidden">Created</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {keys.map(({ id, name, prefix, created_at }) => (
                <tr key={id}>
                  <td>{name}</td>
                  <td className="type-mono-12">{prefix}…</td>
                  <td className="@max-lg:hidden">
                    <Timestamp at={created_at} />
                  </td>
                  <td className="text-right">
                    <ConfirmDialog
                      destructive
                      trigger={<Button size="small">Revoke</Button>}
                      title={`Revoke ${name}`}
                      confirmLabel="Revoke key"
                      onConfirm={() => void revoke(id)}
                    >
                      <p className="type-copy-14">Exporters using it start getting 401s.</p>
                    </ConfirmDialog>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <form onSubmit={create} className="flex max-w-md gap-2">
        <Input name="name" aria-label="Key name" placeholder="Key name" maxLength={100} required />
        <Button type="submit">Create key</Button>
      </form>
    </FieldGroup>
  );
}

function DeleteAgent() {
  const { orgId, agent } = Route.useParams();
  const { client } = Route.useRouteContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function remove() {
    await client.agents.delete({ agent });
    // Stale without refetching, so `/$orgId` reads the Agent list without the deleted Agent.
    await queryClient.invalidateQueries({ refetchType: "none" });
    await navigate({ to: "/$orgId", params: { orgId } });
  }

  return (
    <FieldGroup title="Delete agent">
      <p className="type-copy-14 text-muted">Deletes its API keys. Its traces become unreadable.</p>
      <ConfirmDialog
        destructive
        trigger={
          <Button variant="danger" className="self-start">
            Delete agent
          </Button>
        }
        title={`Delete ${agent}`}
        confirmLabel="Delete agent"
        onConfirm={() => void remove()}
      />
    </FieldGroup>
  );
}

function KeyLine({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-xs bg-fill px-2.5 py-1.5">
      <pre className="min-w-0 flex-1 type-mono-12 whitespace-pre-wrap wrap-anywhere">{text}</pre>
      <CopyButton text={text} />
    </div>
  );
}
