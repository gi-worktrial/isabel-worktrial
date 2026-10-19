import type { Installation } from "@grounded-intelligence/grounded-sdk";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowUpRight, Plus } from "lucide-react";
import { Suspense, useState } from "react";

import { installApp } from "#/github";
import { githubAppQuery, installationReposQuery, installationsQuery } from "#/queries";
import { Button, buttonVariants } from "#/ui/button";
import { EmptyState } from "#/ui/empty-state";
import { GitHubMark } from "#/ui/marks";
import { SearchField } from "#/ui/search-field";
import { Skeleton } from "#/ui/skeleton";
import { Tag } from "#/ui/tag";
import { crumbs } from "#/crumbs";
import { Locked, SettingsPage } from "#src/features/settings/settings-page";
import { SETTINGS_LOCKS } from "#src/queries/client";

export const Route = createFileRoute("/$orgId/settings/github")({
  loader: async ({ context: { queryClient }, params }) => {
    await Promise.all([
      queryClient.ensureQueryData(githubAppQuery(params)),
      queryClient.ensureQueryData(installationsQuery(params)),
    ]);
    return crumbs(
      { label: "Settings", to: "/$orgId/settings" },
      { label: "GitHub", to: "/$orgId/settings/github" },
    );
  },
  component: GitHub,
});

function GitHub() {
  const { orgId } = Route.useParams();
  const { access } = Route.useRouteContext();
  const app = useSuspenseQuery(githubAppQuery({ orgId })).data;
  const installations = useSuspenseQuery(installationsQuery({ orgId })).data;

  return (
    <SettingsPage title="GitHub">
    <section className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-4">
          <p className="type-copy-14 text-muted">
            Agents can check out repositories from these connections. Their code stays on GitHub.
          </p>
        {access.admin && (
          <Locked reason={SETTINGS_LOCKS.github}>
          <Button size="small" onClick={() => installApp(app.html_url, orgId)}>
            <Plus className="size-4" />
            Add connection
          </Button>
          </Locked>
        )}
      </div>
      {installations.length === 0 ? (
        <EmptyState
          title="No connections"
          description={`Install ${app.name} on a GitHub account to use its repositories.`}
        />
      ) : (
        installations.map((installation) => (
          <Suspense key={installation.id} fallback={<Skeleton className="h-48" />}>
            <Connection installation={installation} />
          </Suspense>
        ))
      )}
    </section>
    </SettingsPage>
  );
}

function Connection({ installation: { id, account, html_url } }: { installation: Installation }) {
  const { orgId } = Route.useParams();
  const repositories = useSuspenseQuery(installationReposQuery({ orgId, installation: id })).data;
  const [query, setQuery] = useState("");
  const shown = repositories.filter(({ full_name }) =>
    full_name.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="card overflow-clip">
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <img src={account.avatar_url} alt="" className="size-5 rounded-xs" />
        <span className="min-w-0 flex-1 truncate type-label-13 font-medium">@{account.login}</span>
        <a
          href={html_url}
          target="_blank"
          rel="noreferrer"
          className={buttonVariants({ size: "small" })}
        >
          Manage on GitHub
          <ArrowUpRight className="size-4" />
        </a>
      </div>
      <div className="border-t border-divider p-2">
        <SearchField
          label="Search repositories"
          placeholder="Search repositories"
          value={query}
          onChange={setQuery}
        />
      </div>
      <ul className="max-h-80 overflow-y-auto pb-1">
        {shown.map(({ full_name, html_url: url, private: isPrivate }) => (
          <li key={full_name} className="flex items-center gap-2.5 px-3 py-2">
            <GitHubMark className="text-muted" />
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="min-w-0 flex-1 truncate type-label-13 hover:underline"
            >
              {full_name}
            </a>
            {!isPrivate && <Tag>Public</Tag>}
          </li>
        ))}
        {shown.length === 0 && (
          <li className="px-3 py-6 text-center type-label-13 text-muted">No repositories</li>
        )}
      </ul>
    </div>
  );
}
