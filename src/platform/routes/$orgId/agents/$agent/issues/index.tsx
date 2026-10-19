import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { issueQuery, issuesQuery, useAgentRepo } from "#/queries";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { LayoutGrid, List as ListIcon, SlidersHorizontal } from "lucide-react";
import { type DragEvent, type ReactNode, useState, useTransition } from "react";
import { z } from "zod";

import {
  ISSUE_STATES,
  type IssueState,
  type IssueSummary,
} from "@grounded-intelligence/grounded-sdk";
import { STATE_WORDS } from "#/issue-view";
import { Button } from "#/ui/button";
import { cn } from "#/ui/cn";
import { EmptyState } from "#/ui/empty-state";
import {
  Dropdown,
  MenuCheckboxItem,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
} from "#/ui/menu";
import { SegmentedControl } from "#/ui/segmented-control";
import { crumbs } from "#/crumbs";
import { IssueTable } from "#src/features/inbox/issue-table";
import { IssueCard, Lane } from "#src/features/inbox/lanes";

const VIEWS = [
  {
    value: "board",
    tooltip: "Board view",
    label: (
      <>
        <LayoutGrid aria-hidden="true" className="size-3.5" />
        <span className="sr-only">Board</span>
      </>
    ),
  },
  {
    value: "list",
    tooltip: "List view",
    label: (
      <>
        <ListIcon aria-hidden="true" className="size-3.5" />
        <span className="sr-only">List</span>
      </>
    ),
  },
] as const;
const ORDERS = ["newest", "oldest", "title"] as const;
const DEFAULT_STATES = ISSUE_STATES.filter((state) => state !== "dismissed");
const ORDER_LABELS = {
  newest: "Newest activity",
  oldest: "Oldest activity",
  title: "Title A–Z",
} as const;

const searchSchema = z.object({
  view: z.enum(["board", "list"]).optional(),
  columns: z.string().optional(),
  order: z.enum(ORDERS).optional(),
});

export const Route = createFileRoute("/$orgId/agents/$agent/issues/")({
  validateSearch: searchSchema,
  loader: async ({ context: { queryClient }, params }) => {
    await queryClient.ensureQueryData(issuesQuery(params));
    return crumbs({ label: "Inbox", to: "/$orgId/agents/$agent/issues" });
  },
  component: IssuesInbox,
});

function IssuesInbox() {
  const issues = useSuspenseQuery(issuesQuery(Route.useParams())).data;
  const { view = "board", columns, order = "newest" } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const visibleStates: readonly IssueState[] =
    columns === undefined
      ? DEFAULT_STATES
      : columns
          .split(",")
          .filter((value): value is IssueState => ISSUE_STATES.includes(value as IssueState));
  const filtered = issues.filter((issue) => visibleStates.includes(issue.state));
  const rows = [...filtered].sort((left, right) => {
    if (order === "title") {
      return left.title.localeCompare(right.title);
    }
    const difference = Date.parse(left.last_seen_at) - Date.parse(right.last_seen_at);
    return order === "oldest" ? difference : -difference;
  });

  return (
    <div className="flex flex-col gap-3">
      <header className="flex min-w-0 items-center gap-3">
        <h1 className="shrink-0 type-title-18 text-ink">Inbox</h1>
        <div
          role="group"
          aria-label="Display controls"
          className="flex min-w-0 flex-1 items-center justify-end gap-2"
        >
          <SegmentedControl
            label="View"
            className="shrink-0"
            value={view}
            segments={VIEWS}
            onChange={(next) =>
              void navigate({
                search: { view: next === "board" ? undefined : next },
                replace: true,
              })
            }
          />
          <Dropdown
            align="end"
            className="w-56"
            trigger={
              <Button
                variant="secondary"
                size="small"
                aria-label="Display options"
              >
                <SlidersHorizontal className="size-3.5" />
                Display
              </Button>
            }
          >
            <MenuLabel>Columns</MenuLabel>
            {ISSUE_STATES.map((value) => (
              <MenuCheckboxItem
                key={value}
                checked={visibleStates.includes(value)}
                onSelect={(event) => event.preventDefault()}
                onCheckedChange={(checked) => {
                  const next =
                    checked === true
                      ? ISSUE_STATES.filter(
                          (state) => state === value || visibleStates.includes(state),
                        )
                      : visibleStates.filter((state) => state !== value);
                  void navigate({
                    search: {
                      view: view === "board" ? undefined : view,
                      columns:
                        next.length === DEFAULT_STATES.length &&
                        next.every((state, index) => state === DEFAULT_STATES[index])
                          ? undefined
                          : next.join(","),
                      order: order === "newest" ? undefined : order,
                    },
                    replace: true,
                  });
                }}
              >
                  <span className="flex-1">{STATE_WORDS[value]}</span>
              </MenuCheckboxItem>
            ))}
            <MenuSeparator />
            <MenuLabel>Order by</MenuLabel>
            <MenuRadioGroup
              value={order}
              onValueChange={(value) =>
                void navigate({
                  search: {
                    view: view === "board" ? undefined : view,
                    columns,
                    order: value === "newest" ? undefined : (value as (typeof ORDERS)[number]),
                  },
                  replace: true,
                })
              }
            >
              {ORDERS.map((value) => (
                <MenuRadioItem key={value} value={value}>
                  <span className="flex-1">{ORDER_LABELS[value]}</span>
                </MenuRadioItem>
              ))}
            </MenuRadioGroup>
          </Dropdown>
        </div>
      </header>
      {issues.length === 0 ? (
        <EmptyState
          title="No Issues yet"
          description="Issues show here once Issue mining commits them to the Agent's repo."
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No Issues in the selected columns"
          onClear={() =>
            void navigate({
              search: {
                view: view === "board" ? undefined : view,
                order: order === "newest" ? undefined : order,
              },
              replace: true,
            })
          }
        />
      ) : (
        <div className="flex items-start gap-4">
          {view === "board" ? (
            <IssueBoard rows={rows} states={visibleStates} />
          ) : (
            <IssueList rows={rows} />
          )}
        </div>
      )}
    </div>
  );
}

function IssueBoard({ rows, states }: { rows: IssueSummary[]; states: readonly IssueState[] }) {
  const params = Route.useParams();
  const { client } = Route.useRouteContext();
  const repo = useAgentRepo(params);
  const queryClient = useQueryClient();
  const [dragged, setDragged] = useState<IssueSummary>();
  const [over, setOver] = useState<IssueState>();
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const canMove = (to: IssueState) =>
    dragged !== undefined &&
    ((dragged.state === "detected" && to === "reviewing") ||
      (dragged.state === "reviewing" && to === "detected"));

  function drop(to: IssueState) {
    const issue = dragged;
    setDragged(undefined);
    setOver(undefined);
    if (
      issue === undefined ||
      !(
        (issue.state === "detected" && to === "reviewing") ||
        (issue.state === "reviewing" && to === "detected")
      )
    ) {
      return;
    }
    startTransition(async () => {
      try {
        const current = await queryClient.fetchQuery(
          issueQuery({ ...params, issue: issue.id }),
        );
        await client.issues.update({
          agent: params.agent,
          repo,
          id: issue.id,
          expectedHeadOid: current.head_oid,
          action: to === "reviewing" ? "validate" : "reset",
        });
        setError(undefined);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
      await queryClient.invalidateQueries();
    });
  }

  return (
    <div className="min-w-0 flex-1">
      {error !== undefined && (
        <p role="alert" className="mb-2 type-label-13 text-danger">
          {error}
        </p>
      )}
      <div
        aria-busy={pending}
        className={cn(
          "grid h-[calc(100dvh-7.75rem)] min-w-0 items-stretch gap-4 overflow-x-auto overflow-y-hidden",
          states.length === 1 && "grid-cols-[minmax(176px,1fr)]",
          states.length === 2 && "grid-cols-[repeat(2,minmax(176px,1fr))]",
          states.length === 3 && "grid-cols-[repeat(3,minmax(176px,1fr))]",
          states.length === 4 && "grid-cols-[repeat(4,minmax(176px,1fr))]",
        )}
      >
        {states.map((state) => {
          const lane = rows.filter((issue) => issue.state === state);
          return (
            <Lane
              key={state}
              state={state}
              count={lane.length}
              className={cn(
                "motion-safe:transition-[background-color,box-shadow,outline-color] motion-safe:duration-200",
                canMove(state) && "outline-1 outline-dashed outline-divider-strong",
                over === state &&
                  canMove(state) &&
                  "bg-accent-tint shadow-sm outline-accent ring-2 ring-inset ring-accent/20",
              )}
              onDragEnter={() => canMove(state) && setOver(state)}
              onDragOver={(event) => {
                if (canMove(state)) {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                }
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  setOver(undefined);
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                drop(state);
              }}
            >
              <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pt-0.5">
                {lane.map((issue) => (
                  <li
                    key={issue.id}
                    draggable={issue.state === "detected" || issue.state === "reviewing"}
                    className={cn(
                      "origin-center motion-safe:transition-[opacity,transform] motion-safe:duration-150",
                      dragged?.id === issue.id && "scale-[0.98] opacity-25",
                    )}
                    onDragStart={(event: DragEvent<HTMLLIElement>) => {
                      setDragged(issue);
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", issue.id);
                    }}
                    onDragEnd={() => {
                      setDragged(undefined);
                      setOver(undefined);
                    }}
                  >
                    <IssueLink
                      issue={issue}
                      className="flex cursor-grab flex-col gap-2 card p-3 hover:-translate-y-px hover:border-divider-strong active:cursor-grabbing motion-safe:transition aria-[current=true]:border-accent aria-[current=true]:ring-1 aria-[current=true]:ring-accent aria-[current=true]:ring-inset scroll-my-4"
                    >
                      <IssueCard issue={issue} />
                    </IssueLink>
                  </li>
                ))}
              </ul>
            </Lane>
          );
        })}
      </div>
    </div>
  );
}

function IssueList({ rows }: { rows: IssueSummary[] }) {
  return (
    <div className="min-w-0 flex-1">
      <IssueTable rows={rows} />
    </div>
  );
}

function IssueLink({
  issue,
  className,
  children,
}: {
  issue: IssueSummary;
  className: string;
  children: ReactNode;
}) {
  const { orgId, agent } = Route.useParams();
  return (
    <Link
      to="/$orgId/agents/$agent/issues/$issue"
      params={{ orgId, agent, issue: issue.id }}
      className={className}
    >
      {children}
    </Link>
  );
}
