import { Link, useMatches, useNavigate, useParams } from "@tanstack/react-router";
import {
  Bot,
  ChevronsUpDown,
  FlaskConical,
  Inbox,
  ListTree,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings,
  Workflow,
  Wrench,
} from "lucide-react";
import { Collapsible } from "radix-ui";
import { type ReactElement, use, useState } from "react";

import { threadTitle, threadUsed } from "#/lib/pebble/view";
import { ChatRow } from "#/pebble/chat-row";
import {
  useAgentRepo,
  useArchiveThread,
  useCreateThread,
  useRenameThread,
  useThreads,
} from "#/pebble/threads";
import { IconButton } from "#/ui/button";
import { cn } from "#/ui/cn";
import { GroundedMark } from "#/ui/marks";
import { Dropdown, MenuRadioGroup, MenuRadioItem } from "#/ui/menu";
import { SearchField } from "#/ui/search-field";
import { Skeleton } from "#/ui/skeleton";
import { Tooltip } from "#/ui/tooltip";
import { SidebarExtra } from "#src/app/public";

const ROW =
  "menu-item h-8 min-w-0 shrink-0 rounded-sm type-label-13 hover:before:bg-fill focus-visible:before:bg-fill focus-visible:before:outline-2 focus-visible:before:-outline-offset-2 focus-visible:before:outline-ring disabled:pointer-events-none";
const TOGGLE = "w-10 justify-center px-0";
// The menu sets aria-expanded, since a tooltip on the trigger replaces its data-state.
const SWITCHER = cn(ROW, "w-full aria-expanded:before:bg-fill");
const MENU_WIDTH =
  "w-(--radix-dropdown-menu-trigger-width) rounded-md [--menu-item-radius:var(--radius-control)] [&_[data-state=checked]]:before:bg-fill [&_[data-state=checked][data-highlighted]]:before:bg-divider";
const SECTION = "menu-selector flex flex-col gap-1 px-1 py-3";
const NAV =
  "flex shrink-0 flex-col overflow-hidden border-r border-divider bg-subtle transition-[width] duration-400 ease-drawer";
const NAV_WIDTH = "w-56";
const RAIL_WIDTH = "w-12";
// The expanded width inside the border, so chats are covered rather than reflowed as the rail closes.
const CHATS_WIDTH = "w-[calc(--spacing(56)-1px)]";
const FOOTER = "menu-selector mt-auto flex flex-wrap gap-y-1 border-t border-divider px-1 py-3";
const CHAT_LIST = "menu-selector flex flex-col gap-1 px-1 pb-3";
const PAGE = cn(
  ROW,
  "aria-[current=page]:text-accent-ink aria-[current=page]:before:bg-accent-tint",
);
const PAGE_LABEL_WIDTHS = ["w-12", "w-14", "w-24", "w-20", "w-24"];
const CHAT_TITLE_WIDTHS = ["w-28", "w-20", "w-32"];
export const PAGES = [
  { to: "/$orgId/agents/$agent/issues", label: "Inbox", Icon: Inbox },
  { to: "/$orgId/agents/$agent/traces", label: "Traces", Icon: ListTree },
  { to: "/$orgId/agents/$agent/evals", label: "Grounded Evals", Icon: FlaskConical },
  { to: "/$orgId/agents/$agent/automations", label: "Automations", Icon: Workflow },
  { to: "/$orgId/agents/$agent/settings", label: "Agent settings", Icon: Wrench },
] as const;

function useRailRoute() {
  return useMatches({ select: (matches) => matches.some(({ staticData }) => staticData.rail) });
}

// An Automation's and a run's pages sit outside /automations, so its row marks them.
function useAutomationRecord() {
  return useMatches({
    select: (matches) => matches.some(({ routeId }) => /\/agents\/\$agent\/(jobs|runs)\//u.test(routeId)),
  });
}

type SidebarProps = {
  orgId: string;
  organizations: ReadonlyArray<{ id: string; name: string }>;
  agents: ReadonlyArray<{ name: string }>;
  agent: string | undefined;
  access: { tenant: boolean };
  chat: string | undefined;
  answeringThread: string | undefined;
};

export function Sidebar({
  orgId,
  organizations,
  agents,
  agent,
  access,
  chat,
  answeringThread,
}: SidebarProps) {
  const navigate = useNavigate();
  const organization = organizations.find(({ id }) => id === orgId);
  const railRoute = useRailRoute();
  const automationRecord = useAutomationRecord();
  const { issue } = useParams({ strict: false });
  // A toggle holds for the Issue it was made on, or for every page outside Issues.
  const scope = issue === undefined ? undefined : `${orgId}/${agent}/${issue}`;
  const [toggled, setToggled] = useState<{ scope: string | undefined; collapsed: boolean }>();
  const collapsed =
    toggled !== undefined && toggled.scope === scope ? toggled.collapsed : railRoute;
  const fade = cn("transition-opacity", collapsed && "opacity-0");
  const labelClass = cn("flex-1 truncate text-left", fade);
  const named = (name: string, control: ReactElement) =>
    collapsed ? (
      <Tooltip key={control.key} label={name} side="right">
        {control}
      </Tooltip>
    ) : (
      control
    );

  return (
    <nav aria-label="Navigation" className={cn(NAV, collapsed ? RAIL_WIDTH : NAV_WIDTH)}>
      <div className="flex flex-col divide-y divide-divider">
        <div className={SECTION}>
          <div className="flex items-center gap-1">
            <Dropdown
              align="start"
              side="bottom"
              className={MENU_WIDTH}
              trigger={
                <button
                  type="button"
                  aria-label="Select organization"
                  className={cn(SWITCHER, "min-w-0 flex-1", collapsed && "hidden")}
                >
                  <span className="flex size-4 shrink-0 items-center justify-center">
                    <GroundedMark size={20} />
                  </span>
                  <span className={cn(labelClass, "type-copy-14 font-bold")}>
                    {organization?.name}
                  </span>
                </button>
              }
            >
              <MenuRadioGroup
                className="flex flex-col gap-1"
                value={orgId}
                onValueChange={(id) => void navigate({ to: "/$orgId", params: { orgId: id } })}
              >
                {organizations.map(({ id, name }) => (
                  <MenuRadioItem key={id} value={id}>
                    <span className="flex-1 truncate">{name}</span>
                  </MenuRadioItem>
                ))}
              </MenuRadioGroup>
            </Dropdown>
            <Tooltip label={collapsed ? "Expand sidebar" : "Collapse sidebar"} side="right">
              <button
                type="button"
                aria-label="Sidebar"
                aria-expanded={!collapsed}
                onClick={() => setToggled({ scope, collapsed: !collapsed })}
                className={cn(ROW, TOGGLE, "text-muted hover:text-ink")}
              >
                {collapsed ? (
                  <PanelLeftOpen className="size-4" />
                ) : (
                  <PanelLeftClose className="size-4" />
                )}
              </button>
            </Tooltip>
          </div>
          {access.tenant && agent !== undefined && (
            <Dropdown
              align="start"
              side={collapsed ? "right" : "bottom"}
              className={collapsed ? undefined : MENU_WIDTH}
              tooltip={collapsed ? agent : undefined}
              trigger={
                <button
                  type="button"
                  aria-label="Select agent"
                  className={cn(SWITCHER, "font-medium")}
                >
                  <Bot className="size-4 shrink-0 text-muted" />
                  <span className={labelClass}>{agent}</span>
                  <ChevronsUpDown className={cn("size-3.5 shrink-0 text-muted", fade)} />
                </button>
              }
            >
              <MenuRadioGroup
                className="flex flex-col gap-1"
                value={agent}
                onValueChange={(name) =>
                  void navigate({ to: "/$orgId/agents/$agent", params: { orgId, agent: name } })
                }
              >
                {agents.map(({ name }) => (
                  <MenuRadioItem key={name} value={name}>
                    <span className="flex-1 truncate">{name}</span>
                  </MenuRadioItem>
                ))}
              </MenuRadioGroup>
            </Dropdown>
          )}
        </div>
        {access.tenant && agent !== undefined && (
          <div className={SECTION}>
            {PAGES.map(({ to, label, Icon }) =>
              named(
                label,
                <Link
                  key={to}
                  to={to}
                  params={{ orgId, agent }}
                  aria-current={label === "Automations" && automationRecord ? "page" : undefined}
                  className={PAGE}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className={labelClass}>{label}</span>
                </Link>,
              ),
            )}
          </div>
        )}
      </div>
      {access.tenant && (
        <Chats
          orgId={orgId}
          agent={agent}
          hidden={collapsed}
          current={chat}
          answeringThread={answeringThread}
        />
      )}
      <div className={FOOTER}>
        {access.tenant && (
          <div className="flex basis-full empty:hidden">{use(SidebarExtra)?.(collapsed)}</div>
        )}
        {access.tenant &&
          named(
            "Settings",
            <Link
              to="/$orgId/settings"
              params={{ orgId }}
              className={cn(PAGE, "min-w-10 flex-1")}
            >
              <Settings className="size-4 shrink-0" />
              <span className={labelClass}>Settings</span>
            </Link>,
          )}
      </div>
    </nav>
  );
}

/** The sidebar's layout before the organization and its Agents load. */
export function SidebarSkeleton() {
  const collapsed = useRailRoute();

  return (
    <div aria-hidden className={cn(NAV, collapsed ? RAIL_WIDTH : NAV_WIDTH)}>
      <div className="flex flex-col divide-y divide-divider">
        <div className={SECTION}>
          <div className={ROW}>
            <span className="flex size-4 shrink-0 items-center justify-center">
              <GroundedMark size={20} />
            </span>
            {!collapsed && <Skeleton className="h-3.5 w-24" />}
          </div>
          <div className={ROW}>
            <Skeleton className="size-4" />
            {!collapsed && <Skeleton className="h-3.5 w-20" />}
          </div>
        </div>
        <div className={SECTION}>
          {PAGE_LABEL_WIDTHS.map((width, index) => (
            <div key={index} className={ROW}>
              <Skeleton className="size-4" />
              {!collapsed && <Skeleton className={cn("h-3.5", width)} />}
            </div>
          ))}
        </div>
      </div>
      {!collapsed && (
        <>
          <div className="flex h-11 shrink-0 items-center border-t border-divider pl-4">
            <Skeleton className="h-3 w-10" />
          </div>
          <ChatsSkeleton className="min-h-0 overflow-hidden" />
        </>
      )}
      <div className={FOOTER}>
        <div className={cn(ROW, "min-w-10 flex-1")}>
          <Skeleton className="size-4" />
          {!collapsed && <Skeleton className="h-3.5 w-20" />}
        </div>
        <div className={cn(ROW, TOGGLE)}>
          <Skeleton className="size-4" />
        </div>
      </div>
    </div>
  );
}

function ChatsSkeleton({ className }: { className?: string | undefined }) {
  return (
    <div aria-hidden className={cn(CHAT_LIST, className)}>
      {CHAT_TITLE_WIDTHS.map((width, index) => (
        <div key={index} className={ROW}>
          <Skeleton className={cn("h-3.5", width)} />
          <Skeleton className="ml-auto h-3 w-5" />
        </div>
      ))}
    </div>
  );
}

type ChatsProps = {
  orgId: string;
  agent: string | undefined;
  /** Hidden in the rail, still mounted so a pending New chat still opens. */
  hidden: boolean;
  current: string | undefined;
  answeringThread: string | undefined;
};

/** The engineer's chats across every Agent, most recently used first. */
function Chats({ orgId, agent, hidden, current, answeringThread }: ChatsProps) {
  const navigate = useNavigate();
  const repo = useAgentRepo(agent);
  const { threads, isPending, error, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useThreads();
  const create = useCreateThread();
  const archive = useArchiveThread();
  const rename = useRenameThread();
  const open = useParams({ strict: false }).thread;
  const failure = error ?? create.error ?? archive.error ?? rename.error;
  const [searching, setSearching] = useState(false);
  // Keys the field per open, so reopening mid-collapse starts fresh while closing keeps the draft on screen.
  const [searches, setSearches] = useState(0);
  const [query, setQuery] = useState("");
  const [renaming, setRenaming] = useState<string>();
  const search = searching ? query.trim().toLowerCase() : "";
  const shown = threads.filter(
    (thread) => threadUsed(thread) && threadTitle(thread).toLowerCase().includes(search),
  );

  return (
    <section
      aria-labelledby="sidebar-chats"
      className={cn(
        CHATS_WIDTH,
        "flex min-h-0 flex-1 flex-col border-t border-divider transition-[opacity,visibility]",
        hidden && "invisible opacity-0",
      )}
    >
      <div className="flex h-11 shrink-0 items-center gap-0.5 pr-1.5 pl-4">
        <h2 id="sidebar-chats" className="mr-auto type-meta-12 text-muted">
          Chats
        </h2>
        <IconButton
          label="Search chats"
          size="small"
          aria-pressed={searching}
          onClick={() => {
            if (!searching) {
              setSearches(searches + 1);
              setQuery("");
            }
            setSearching(!searching);
          }}
          className="rounded-md aria-pressed:bg-fill"
        >
          <Search className="size-4" />
        </IconButton>
        <IconButton
          label="New chat"
          size="small"
          disabled={create.isPending}
          className="rounded-md"
          onClick={() =>
            create.mutate(repo, {
              onSuccess: ({ id }) =>
                void navigate({ to: "/$orgId/chat/$thread", params: { orgId, thread: id } }),
            })
          }
        >
          <Plus className="size-4" />
        </IconButton>
      </div>
      <Collapsible.Root open={searching} className="shrink-0">
        <Collapsible.Content className="-mt-0.5 overflow-hidden px-1.5 pt-0.5 pb-1 data-[state=closed]:animate-collapse data-[state=open]:animate-expand">
          <SearchField
            key={searches}
            label="Search chats"
            placeholder="Search chats"
            value={query}
            onChange={setQuery}
            onEscape={() => setSearching(false)}
            autoFocus
            className="mx-0.5"
          />
        </Collapsible.Content>
      </Collapsible.Root>
      <div className="group/chats grid min-h-0 grid-rows-[minmax(0,1fr)] overflow-hidden *:[grid-area:1/1]">
        <div
          aria-busy={isPending}
          className={cn(
            CHAT_LIST,
            "min-h-0 overflow-y-auto transition-opacity duration-200 aria-busy:opacity-0",
          )}
        >
          {shown.map((thread) => (
            <ChatRow
              key={thread.id}
              thread={thread}
              current={thread.id === current}
              answering={thread.id === answeringThread}
              leaving={archive.archiving.has(thread.id)}
              renaming={thread.id === renaming}
              onRenaming={(next) => setRenaming(next ? thread.id : undefined)}
              onRename={(title) => rename.mutate({ thread, title })}
              onArchive={() =>
                archive.mutate(thread.id, {
                  onSuccess: () => {
                    if (thread.id === open) {
                      void navigate({ to: "/$orgId/chat", params: { orgId } });
                    }
                  },
                })
              }
            >
              <Link
                to="/$orgId/chat/$thread"
                params={{ orgId, thread: thread.id }}
                className={ROW}
              />
            </ChatRow>
          ))}
          {searching && shown.length === 0 && (
            <p className="px-3 py-2 type-label-13 text-muted">No chats found</p>
          )}
          {hasNextPage && (
            <button
              type="button"
              disabled={isFetchingNextPage}
              onClick={() => void fetchNextPage()}
              className={cn(ROW, "text-muted")}
            >
              {isFetchingNextPage ? "Loading…" : "Load more"}
            </button>
          )}
          {failure && (
            <p role="alert" className="px-2.5 type-label-13 text-danger">
              {failure.message}
            </p>
          )}
        </div>
        <ChatsSkeleton className="pointer-events-none transition-[opacity,visibility] duration-200 group-has-[[aria-busy=false]]/chats:invisible group-has-[[aria-busy=false]]/chats:opacity-0" />
      </div>
    </section>
  );
}
