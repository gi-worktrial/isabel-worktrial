// fork: platform's Org shell, in its order and names, with what demo-product keeps (scripts/platform-web.json says
// why): Pebble as a whole pane on either side that can be made primary (Krish), the main view following back to the
// page it came from with Open in side panel and Close (Danny), and the data plane's frame (the demo's Walkthroughs)
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import {
  type IssueParams,
  accessQuery,
  agentsQuery,
  organizationsQuery,
  shellQuery,
  threadQuery,
} from "#/queries";
import {
  Link,
  type NavigateOptions,
  Outlet,
  createFileRoute,
  isMatch,
  useLocation,
  useMatches,
  useNavigate,
  useParams,
  useRouter,
  useRouterState,
  useSearch,
} from "@tanstack/react-router";
import {
  ArrowLeftRight,
  ArrowLeftToLine,
  ArrowRightToLine,
  ChevronRight,
  Columns2,
  Expand,
  PanelRight,
  Search,
  X,
} from "lucide-react";
import {
  Fragment,
  type PointerEvent as ReactPointerEvent,
  Suspense,
  lazy,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import {
  Group,
  Panel,
  type Layout,
  useDefaultLayout,
  useGroupRef,
  usePanelRef,
} from "react-resizable-panels";
import { InPortal, OutPortal, createHtmlPortalNode } from "react-reverse-portal";

import { lastOrganizationCookie } from "../db/organizations";
import { getActiveAgent, setLastVisitedAgent } from "../last-visited-agent";
import { prefetchToken, servicesClient } from "../services";
import { DEFAULT_PROMPTS, PebbleDockContext, type PebblePage } from "../pebble/page";
import { Sidebar, SidebarSkeleton } from "../sidebar";
import { threadTitle } from "#/lib/pebble/view";
import { CommandPalette } from "#/command-palette";
import { ShortcutsDialog, chord, isPlainKey, isTyping } from "#/shortcuts";
import { IconButton } from "#/ui/button";
import { cn } from "#/ui/cn";
import { Kbd } from "#/ui/kbd";
import { PebbleMark } from "#/ui/marks";
import { useActiveThread } from "#/pebble/threads";
import { PaneSeparator } from "#/ui/pane-separator";
import { Skeleton } from "#/ui/skeleton";
import { TooltipProvider } from "#/ui/tooltip";
import { otherSide, panes, type PaneSide, usePebbleSide } from "#src/app/public";
import { currentServices } from "#src/app/services";
import { quietStorage } from "#src/data/storage";
import { PANE_WIDTHS_KEY } from "#src/data/storage-keys";
import type { InView } from "#src/features/pebble/context";
import { RecordState } from "#src/features/records/record-state";
import { type PaneAction, PaneDropZones, PaneMenu, type PaneZone, usePaneDrag } from "#src/ui/pane";
import { TabActionsScope } from "#src/ui/tab-actions";
import type { RecordHref } from "#src/ui/record-href";
import { RecordStates } from "#src/ui/record-link";

const cookieLifetime = 365 * 24 * 60 * 60 * 1000;
// Either pane can be the narrow one once Pebble is made primary.
const PANE_MIN_WIDTH = 384;
const RESIZE_TARGET = { fine: 16, coarse: 32 };
// Releasing a drag left of this fraction of the group opens the chat fullscreen: half the page's minimum, as a panel dragged below half its minimum collapses.
const MAXIMIZE_FRACTION = 0.2;
const PEBBLE_CHAT_TRANSITION = "[view-transition-name:pebble-chat]";
// The frame's grey shows in the gutter between the panes.
const FRAME = "flex h-full min-w-0 overflow-hidden bg-subtle";
// each crumb a pill, the current page filled
const CRUMB = "h-6 min-w-0 truncate rounded-xs px-2 leading-6";

const HEADER =
  "flex h-12 shrink-0 items-center justify-between gap-3 border-b border-divider bg-surface pr-3 pl-6";
const PAGE =
  "mx-auto w-full max-w-page px-6 py-4 type-copy-14 [&_a:not([class])]:text-accent-ink [&_a:not([class])]:hover:underline";

// Loads on first open, since it brings the diff and Markdown renderers.
const Pebble = lazy(() => import("../pebble/chat").then(({ Pebble }) => ({ default: Pebble })));
const ActiveChat = lazy(() =>
  import("../pebble/chat").then(({ ActiveChat }) => ({ default: ActiveChat })),
);
const IssueActivityPanel = lazy(() =>
  import("#src/features/issue/activity-panel").then(({ IssueActivityPanel }) => ({
    default: IssueActivityPanel,
  })),
);

type Pane = "page" | "pebble";
type DockContent = { kind: "pebble" } | { kind: "activity"; params: IssueParams };
// The last page before the main view, which its questions keep describing and its Open in side panel returns to.
type Origin = { href: string; pathname: string; page: PebblePage | undefined; view: InView };
// The main view's own pages, which are never where it comes from.
const CHAT_PATH = /^\/[^/]+\/chat(?:\/|$)/u;

const recordState = (record: RecordHref) => <RecordState record={record} />;

export const Route = createFileRoute("/$orgId")({
  // The skeleton loads with the shell, since both draw the sidebar; platform renders it on its server.
  codeSplitGroupings: [
    ["component", "pendingComponent"],
    ["errorComponent"],
    ["notFoundComponent"],
  ],
  // Data plane responses go straight to the browser, never through the Worker.
  ssr: false,
  beforeLoad: async ({ context: { queryClient }, params }) => {
    // The token, organization list, and Agents (which hold each Agent's repository) don't depend on access, so they're requested alongside it.
    prefetchToken(params.orgId);
    queryClient.query(organizationsQuery()).catch(() => undefined);
    queryClient.query(agentsQuery(params)).catch(() => undefined);
    return {
      client: servicesClient(params.orgId),
      access: await queryClient.query(accessQuery(params)),
    };
  },
  loader: ({ context: { access, queryClient }, params: { orgId } }) =>
    queryClient.ensureQueryData(shellQuery({ orgId, tenant: access.tenant })),
  // Rendered into the server's HTML, so it shows before the app's JavaScript and data load, and isn't held after they do.
  pendingComponent: ShellSkeleton,
  pendingMinMs: 0,
  component: Shell,
});

function ShellSkeleton() {
  const fullscreen = useMatches({
    select: (matches) => matches.some(({ staticData }) => staticData.fullscreen),
  });

  return (
    <div role="status" aria-label="Loading" className={FRAME}>
      <SidebarSkeleton />
      <div className="flex min-w-0 flex-1 flex-col bg-surface">
        <div className={HEADER}>
          <Skeleton className="h-3 w-32" />
        </div>
        {!fullscreen && (
          <div className={cn(PAGE, "flex flex-col gap-3")}>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-11/12" />
            <Skeleton className="h-3.5 w-2/3" />
          </div>
        )}
      </div>
    </div>
  );
}

// Pebble's frame while its code loads on a slow first open.
function PebbleLoading() {
  return (
    <div aria-busy="true" aria-label="Pebble" className="flex h-full flex-col gap-3 p-4">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-3 w-3/5" />
      <Skeleton className="h-3 w-2/5" />
    </div>
  );
}

function ActivityPanelLoading() {
  return (
    <div aria-busy="true" aria-label="Activity" className="flex h-full flex-col gap-3 p-4">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-8 w-4/5" />
    </div>
  );
}

function Shell() {
  const { orgId } = Route.useParams();
  const { access } = Route.useRouteContext();
  const { organizations, agents } = useSuspenseQuery(
    shellQuery({ orgId, tenant: access.tenant }),
  ).data;
  // The data plane's own frame around the shell, such as the demo's Walkthroughs.
  const Frame = currentServices().Shell ?? Fragment;
  const navigate = useNavigate();
  const { pathname, searchStr } = useLocation();
  const params = useParams({ strict: false });
  const search = useSearch({ strict: false });
  const agent = params.agent ?? getActiveAgent(orgId, agents);
  const pebble = usePanelRef();
  const group = useGroupRef();
  const groupElement = useRef<HTMLDivElement>(null);
  const separator = useRef<HTMLDivElement>(null);
  // The layout before a drag that opened the dock's chat fullscreen, which the dock returns to.
  const restore = useRef<Layout>(undefined);
  const [maximizing, setMaximizing] = useState(false);
  // Keeps the separator mounted while a drag collapses the dock, so dragging back reopens it.
  const [resizing, setResizing] = useState(false);
  const layout = useDefaultLayout({ id: PANE_WIDTHS_KEY, storage: quietStorage });
  const [pebbleOpen, setPebbleOpen] = useState(false);
  const [dockContent, setDockContent] = useState<DockContent>({ kind: "pebble" });
  // Pebble connects once first opened, which attaches its sandbox, and stays connected after.
  const [pebbleOpened, setPebbleOpened] = useState(false);
  const [page, setPage] = useState<PebblePage>();
  const [prefill, setPrefill] = useState<string>();
  const [answeringThread, setAnsweringThread] = useState<string>();
  const [docked, setDocked] = useState<{ orgId: string; thread: string }>();
  const dockThread = docked?.orgId === orgId ? docked.thread : undefined;
  const fullscreen = useMatches({
    select: (matches) => matches.some(({ staticData }) => staticData.fullscreen),
  });
  const routeId = useMatches({ select: (matches) => matches.at(-1)?.routeId });
  const editingCandidate =
    routeId === "/$orgId/agents/$agent/issues/$issue_/debug/candidates/$candidate";
  const list = useLocation({ select: ({ state }) => state.list });
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [pebbleHintDismissed, setPebbleHintDismissed] = useState(false);
  // Where the engineer is going, which leads the shown page while its data loads, so a Back before it loads still returns to it.
  const going = useRouterState({ select: ({ location }) => location });
  const lastPage = useRef<Origin>(undefined);
  const maximized = useRef<{ orgId: string; thread: string }>(undefined);
  const chatPortal = useMemo(
    () => createHtmlPortalNode({ attributes: { class: "flex min-h-0 flex-1 flex-col" } }),
    [],
  );
  const panePortal = useMemo(
    () => createHtmlPortalNode({ attributes: { class: "flex h-full min-h-0 flex-col" } }),
    [],
  );
  const { thread: dockChat } = useActiveThread(dockThread);
  const crumbs = useMatches({
    select: (matches) =>
      matches.flatMap((match) =>
        isMatch(match, "loaderData.crumbs") ? (match.loaderData?.crumbs ?? []) : [],
      ),
  });
  const router = useRouter();
  // A chat's title comes with its first question or a rename, after its page loaded, so its crumb loads again.
  const chatTitle = useQuery({
    ...threadQuery({ orgId, thread: params.thread ?? "" }),
    enabled: params.thread !== undefined,
    select: threadTitle,
  }).data;
  const crumbLabel = crumbs.at(-1)?.label;
  const side = usePebbleSide();
  const area = useRef<HTMLDivElement>(null);
  const [pebbleShare, setPebbleShare] = useState(0);
  // Set while the main view shows, so leaving it is told apart from any other change.
  const inMainView = useRef(false);
  // A move to the other side mounts Pebble's panel again, so the widths go back once it has.
  const moved = useRef<Layout>(undefined);
  // Leaving the main view by its Close keeps the side panel shut; any other way Pebble follows to the side.
  const closing = useRef(false);
  // The main view comes from the last page outside it, so Close and the context always name the newest one.
  const origin = fullscreen ? lastPage.current : undefined;
  const split = pebbleOpen && !fullscreen;
  const openDockChat = pebbleOpen && dockContent.kind === "pebble" ? dockChat?.id : undefined;

  useEffect(() => {
    void cookieStore.set({
      name: lastOrganizationCookie,
      value: orgId,
      expires: Date.now() + cookieLifetime,
      sameSite: "lax",
    });
  }, [orgId]);

  useEffect(() => {
    if (params.agent !== undefined) {
      setLastVisitedAgent(orgId, params.agent);
    }
  }, [orgId, params.agent]);

  // Every page outside the main view, with what it tells Pebble, is where the main view comes from, taken as soon as the engineer goes there.
  useLayoutEffect(() => {
    if (!CHAT_PATH.test(going.pathname)) {
      lastPage.current = {
        href: going.href,
        pathname: going.pathname,
        page,
        view: { issue: params.issue, candidate: params.candidate, eval: params.eval },
      };
    }
  });

  // A chat leaving fullscreen for another page moves into the dock, in the same commit so the view transition captures the open dock.
  useLayoutEffect(() => {
    if (fullscreen) {
      inMainView.current = true;
      if (restore.current !== undefined) {
        group.current?.setLayout(restore.current);
        restore.current = undefined;
      }
      pebble.current?.collapse();
      setPebbleOpened(true);
      maximized.current =
        params.thread === undefined ? undefined : { orgId, thread: params.thread };
      // Already the dock's chat, so leaving fullscreen keeps it mounted.
      if (maximized.current !== undefined) {
        setDocked(maximized.current);
      }
      return;
    }

    if (!inMainView.current) {
      return;
    }
    inMainView.current = false;
    const left = maximized.current;
    maximized.current = undefined;
    if (left?.orgId === orgId) {
      setDocked(left);
    }
    if (!closing.current) {
      pebble.current?.expand();
    }
    closing.current = false;
  }, [fullscreen, pebble, group, orgId, params.thread]);

  useEffect(() => {
    if (routeId === "/$orgId/chat/$thread" && chatTitle !== undefined && chatTitle !== crumbLabel) {
      void router.invalidate({ filter: (match) => match.routeId === routeId });
    }
  }, [routeId, chatTitle, crumbLabel, router]);

  useEffect(() => {
    if (moved.current !== undefined) {
      group.current?.setLayout(moved.current);
      moved.current = undefined;
    }
  }, [side, group]);

  function togglePane() {
    void navigate({
      to: ".",
      search: (previous) => ({
        ...previous,
        pane: previous.pane === undefined ? "desktop" : undefined,
      }),
    });
  }

  function lastPageHref() {
    return lastPage.current?.href ?? `/${orgId}`;
  }

  const leaveMainView = (close: boolean) => {
    closing.current = close;
    void navigate({ href: lastPageHref() });
  };
  // With no chat yet, the main view is the new chat, whose first question starts it.
  const expand = () =>
    dockChat === undefined
      ? void navigate({ to: "/$orgId/chat", params: { orgId } })
      : void navigate({ to: "/$orgId/chat/$thread", params: { orgId, thread: dockChat.id } });

  // Dragging the separator to the page's far edge and letting go opens the chat in the main view.
  const maximize = useEffectEvent((start: Layout | undefined) => {
    restore.current = start;
    expand();
  });
  useEffect(() => {
    if (fullscreen) {
      return;
    }

    let start: Layout | undefined;
    let over = false;
    function setOver(next: boolean) {
      if (next !== over) {
        over = next;
        setMaximizing(next);
      }
    }

    // Runs before the Group's own pointerdown listener on the document, so the layout is still the one before the drag. Only a primary pointer starts a gesture, so other fingers during a drag are ignored.
    let pointer: number | undefined;
    function onPointerDown(event: PointerEvent) {
      if (event.isPrimary) {
        pointer = event.pointerId;
        start = group.current?.getLayout();
      }
    }

    function onPointerMove(event: PointerEvent) {
      if (event.pointerId !== pointer) {
        return;
      }

      const active = separator.current?.dataset.separator === "active";
      if (active) {
        setResizing(true);
      }

      // The page's far edge is the one away from Pebble's side.
      const bounds = groupElement.current?.getBoundingClientRect();
      const reach = (bounds?.width ?? 0) * MAXIMIZE_FRACTION;
      setOver(
        active &&
          bounds !== undefined &&
          (side === "right"
            ? event.clientX < bounds.left + reach
            : event.clientX > bounds.right - reach),
      );
    }

    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerId !== pointer) {
        return;
      }

      setResizing(false);
      if (!over) {
        return;
      }

      setOver(false);
      maximize(start);
    };

    const onPointerCancel = (event: PointerEvent) => {
      if (event.pointerId === pointer) {
        setResizing(false);
        setOver(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    return () => {
      setResizing(false);
      setMaximizing(false);
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
    };
  }, [fullscreen, side, group]);

  // Runs the dock's resize in the transition's update so the chat slides in or out from the edge.
  function setDockOpen(open: boolean) {
    if (pebble.current?.isCollapsed() !== open) {
      return;
    }

    const update = () =>
      flushSync(() => {
        setPebbleOpen(open);
        if (open) {
          setPebbleOpened(true);
          pebble.current?.expand();
        } else {
          pebble.current?.collapse();
        }
      });

    // Same check the router makes before passing transition types.
    if (!CSS.supports("selector(:active-view-transition-type(a))")) {
      update();
      return;
    }

    // The slide comes from Pebble's side, and a transition cut short by the next one rejects `ready`, which needs no handling.
    document
      .startViewTransition({ update, types: ["dock", `dock-${panes.getSnapshot().side}`] })
      .ready.catch(() => {});
  }

  // ⌘J and Ask Pebble open or close the side panel; in the main view they close the chat back to the page.
  function togglePebble() {
    if (fullscreen) {
      leaveMainView(true);
    } else if (dockContent.kind !== "pebble") {
      setDockContent({ kind: "pebble" });
      setDockOpen(true);
    } else {
      setDockOpen(!pebbleOpen);
    }
  }

  // Where Esc goes from the current page, and the sessions ← and → step to.
  function backTarget(): NavigateOptions | undefined {
    switch (routeId) {
      case "/$orgId/chat/$thread":
        return { href: lastPageHref() };
      case "/$orgId/agents/$agent/issues/$issue_/debug/evals":
        return { to: "/$orgId/agents/$agent/issues/$issue/evals", params: true };
      case "/$orgId/agents/$agent/issues/$issue_/debug/candidates/$candidate":
        return { to: "/$orgId/agents/$agent/issues/$issue/candidates/$candidate", params: true };
      case "/$orgId/agents/$agent/traces/$session/$trace":
        return { to: "/$orgId/agents/$agent/traces/$session", params: true, state: true };
      case "/$orgId/agents/$agent/traces/$session/":
        return list === undefined
          ? { to: "/$orgId/agents/$agent/traces", params: true }
          : { href: list.href };
    }
  }

  function neighbor(step: number) {
    if (routeId !== "/$orgId/agents/$agent/traces/$session/" || list === undefined) {
      return undefined;
    }

    const index = list.sessions.indexOf(params.session ?? "");
    return index === -1 ? undefined : list.sessions[index + step];
  }

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || !access.tenant) {
      return;
    }

    if (event.metaKey || event.ctrlKey) {
      if (event.code === "KeyK" && agent !== undefined) {
        event.preventDefault();
        setShortcutsOpen(false);
        setPaletteOpen(!paletteOpen);
      } else if (event.code === "KeyJ") {
        event.preventDefault();
        if (!event.repeat) {
          togglePebble();
        }
      } else if (event.code === "Slash" && !event.shiftKey) {
        event.preventDefault();
        setPaletteOpen(false);
        setShortcutsOpen(true);
      }
      return;
    }

    if (!isPlainKey(event) || isTyping(event)) {
      return;
    }

    const step = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
    const session = step === 0 ? undefined : neighbor(step);
    const target: NavigateOptions | undefined =
      event.key === "Escape"
        ? backTarget()
        : session === undefined
          ? undefined
          : {
              to: "/$orgId/agents/$agent/traces/$session",
              params: (current) => ({ ...current, session }),
              state: true,
            };
    if (target !== undefined) {
      event.preventDefault();
      void navigate(target);
    }
  });
  useEffect(() => {
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const dock = useMemo(
    () => ({
      setPage,
      prefill(text: string) {
        setPrefill(text);
        setDockContent({ kind: "pebble" });
        setDockOpen(true);
      },
      openActivity(params: IssueParams) {
        setDockContent({ kind: "activity", params });
        setDockOpen(true);
      },
      chat: chatPortal,
      pane: panePortal,
    }),
    [chatPortal, panePortal],
  );

  const dockPebble = (to: PaneSide) => {
    moved.current = group.current?.getLayout();
    panes.dock(to);
  };
  const move = (pane: Pane, to: PaneSide) => dockPebble(pane === "pebble" ? to : otherSide(to));
  // The panes trade widths, so the narrow one becomes the wide one.
  const makePrimary = (pane: Pane) => {
    const widths = group.current?.getLayout();
    if (widths?.page !== undefined && widths.pebble !== undefined) {
      if (pane === "pebble" ? widths.pebble < widths.page : widths.page < widths.pebble) {
        group.current?.setLayout({ page: widths.pebble, pebble: widths.page });
      }
    }
  };
  const drag = usePaneDrag<Pane>(area, (pane, zone) =>
    zone === "center" ? makePrimary(pane) : move(pane, zone),
  );
  const startDrag = (pane: Pane) => (event: ReactPointerEvent<HTMLElement>) => {
    if (split) {
      drag.start(pane, event);
    }
  };
  const paneActions = (pane: Pane): PaneAction[] => {
    const at = pane === "pebble" ? side : otherSide(side);
    const narrow = pane === "pebble" ? pebbleShare < 50 : pebbleShare > 50;
    return [
      ...(narrow
        ? [{ label: "Make primary", icon: <ArrowLeftRight />, run: () => makePrimary(pane) }]
        : []),
      at === "right"
        ? { label: "Move to left", icon: <ArrowLeftToLine />, run: () => move(pane, "left") }
        : { label: "Move to right", icon: <ArrowRightToLine />, run: () => move(pane, "right") },
    ];
  };

  const pebblePanel = (
    <Panel
      key="pebble"
      id="pebble"
      panelRef={pebble}
      collapsible
      defaultSize={0}
      minSize={PANE_MIN_WIDTH}
      groupResizeBehavior="preserve-pixel-size"
      onResize={({ inPixels, asPercentage }) => {
        setPebbleOpen(inPixels > 0);
        setPebbleShare(asPercentage);
        if (inPixels > 0) {
          setPebbleOpened(true);
        }
      }}
    >
      {/* A whole pane, top to bottom beside the page (Krish), mounted while closed so it slides in from its edge. */}
      <div
        inert={!pebbleOpen}
        className={cn("h-full overflow-hidden bg-surface", !fullscreen && PEBBLE_CHAT_TRANSITION)}
      >
        {pebbleOpened && (
          <div className={cn("h-full", dockContent.kind !== "pebble" && "hidden")}>
            <Suspense fallback={<PebbleLoading />}>
              <Pebble
                key={orgId}
                agent={agent}
                active={dockThread}
                answeringThread={answeringThread}
                onSelect={(thread) => setDocked({ orgId, thread })}
                chat={!fullscreen && <OutPortal node={chatPortal} />}
                onExpand={expand}
                onDragStart={startDrag("pebble")}
                header={
                  <>
                    <PaneMenu
                      label="Pebble's layout"
                      actions={[
                        { label: "Open in main view", icon: <Expand />, run: expand },
                        ...paneActions("pebble"),
                      ]}
                    />
                    <IconButton label="Close Pebble" size="small" onClick={() => setDockOpen(false)}>
                      <X className="size-4" />
                    </IconButton>
                  </>
                }
              />
            </Suspense>
          </div>
        )}
        {dockContent.kind === "activity" && (
          <Suspense fallback={<ActivityPanelLoading />}>
            <IssueActivityPanel
              params={dockContent.params}
              onClose={() => setDockOpen(false)}
            />
          </Suspense>
        )}
      </div>
    </Panel>
  );

  return (
    <TooltipProvider>
      <RecordStates value={recordState}>
        <Frame>
          {pebbleOpened && (
            <InPortal node={chatPortal}>
              <Suspense fallback={<PebbleLoading />}>
                <ActiveChat
                  key={orgId}
                  active={fullscreen ? params.thread : dockThread}
                  agent={agent}
                  context={
                    fullscreen
                      ? [
                          origin === undefined
                            ? "The engineer has this chat open in the main view."
                            : `The engineer opened this chat in the main view from ${origin.pathname}.`,
                          origin?.page?.context,
                        ]
                          .filter(Boolean)
                          .join("\n")
                      : [`The engineer is viewing ${pathname}${searchStr}.`, page?.context]
                          .filter(Boolean)
                          .join("\n")
                  }
                  view={
                    fullscreen
                      ? (origin?.view ?? {})
                      : { issue: params.issue, candidate: params.candidate, eval: params.eval }
                  }
                  prompts={(fullscreen ? origin?.page : page)?.prompts ?? DEFAULT_PROMPTS}
                  prefill={prefill}
                  onPrefilled={() => setPrefill(undefined)}
                  pane={fullscreen && search.pane !== undefined ? panePortal : undefined}
                  onAnswering={setAnsweringThread}
                  onAsked={(thread) => {
                    if (!fullscreen) {
                      setDocked({ orgId, thread });
                    } else if (params.thread !== thread) {
                      void navigate({
                        to: "/$orgId/chat/$thread",
                        params: { orgId, thread },
                        replace: true,
                      });
                    }
                  }}
                />
              </Suspense>
            </InPortal>
          )}
          {access.tenant && agent !== undefined && (
            <CommandPalette
              orgId={orgId}
              agent={agent}
              agents={agents}
              open={paletteOpen}
              onOpenChange={setPaletteOpen}
              onPebble={
                fullscreen
                  ? undefined
                  : () => {
                      setDockContent({ kind: "pebble" });
                      setDockOpen(true);
                    }
              }
              onShortcuts={() => setShortcutsOpen(true)}
            />
          )}
          <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
          <div className={FRAME}>
            <Sidebar
              orgId={orgId}
              organizations={organizations}
              agents={agents}
              agent={agent}
              access={access}
              chat={fullscreen ? params.thread : openDockChat}
              answeringThread={answeringThread}
            />
            <div ref={area} className="relative flex min-w-0 flex-1">
              <Group
                orientation="horizontal"
                className="min-w-0 flex-1"
                groupRef={group}
                elementRef={groupElement}
                resizeTargetMinimumSize={RESIZE_TARGET}
                defaultLayout={layout.defaultLayout}
                onLayoutChanged={layout.onLayoutChanged}
              >
                {side === "left" && pebblePanel}
                {side === "left" && (pebbleOpen || resizing) && (
                  <PaneSeparator ref={separator} label="Resize Pebble" />
                )}
                <Panel
                  id="page"
                  minSize={PANE_MIN_WIDTH}
                  className={cn(
                    "flex flex-col bg-surface motion-safe:transition-opacity motion-safe:duration-150",
                    maximizing && "opacity-40",
                    split &&
                      (side === "right" ? "border-r border-divider" : "border-l border-divider"),
                  )}
                >
                  <header onPointerDown={startDrag("page")} className={HEADER}>
                    <nav
                      aria-label="Breadcrumbs"
                      className="flex min-w-0 flex-1 items-center gap-1 type-meta-12 text-muted"
                    >
                      {crumbs.map(({ label, to, params: extra }, index) => (
                        <span
                          key={index}
                          className={cn(
                            "flex min-w-0 items-center gap-1",
                            // a record's title between the section and the page gives way first
                            index === crumbs.length - 1
                              ? "max-w-3/5 shrink-0"
                              : index === 0 && "shrink-0",
                          )}
                        >
                          {index > 0 && (
                            <ChevronRight aria-hidden="true" className="size-3 shrink-0 text-faint" />
                          )}
                          {index === crumbs.length - 1 ? (
                            <span
                              aria-current="page"
                              className={cn(
                                CRUMB,
                                "text-ink",
                                crumbs.length > 1 ? "bg-fill" : "px-0",
                              )}
                            >
                              {label}
                            </span>
                          ) : (
                            <Link
                              to={to}
                              params={(current) => ({ ...current, ...extra })}
                              className={cn(CRUMB, "hover:bg-fill hover:text-ink")}
                            >
                              {label}
                            </Link>
                          )}
                        </span>
                      ))}
                    </nav>
                    <div className="flex items-center gap-1">
                      {params.thread !== undefined && (
                        <IconButton
                          label={search.pane === undefined ? "Show desktop" : "Hide desktop"}
                          aria-pressed={search.pane !== undefined}
                          onClick={togglePane}
                        >
                          <PanelRight className="size-4" />
                        </IconButton>
                      )}
                      {fullscreen ? (
                        <>
                          {/* The panes' glyph, as the layout menu's, so it never reads as full screen's arrows. */}
                          <IconButton
                            label="Open in side panel"
                            onClick={() => leaveMainView(false)}
                          >
                            <Columns2 className="size-4" />
                          </IconButton>
                          <IconButton label="Close Pebble" onClick={() => leaveMainView(true)}>
                            <X className="size-4" />
                          </IconButton>
                        </>
                      ) : (
                        split && <PaneMenu label="Page layout" actions={paneActions("page")} />
                      )}
                      {access.tenant && agent !== undefined && (
                        <button
                          type="button"
                          aria-label="Search pages, Issues and Agents"
                          onClick={() => {
                            setShortcutsOpen(false);
                            setPaletteOpen(true);
                          }}
                          className="flex h-8 w-48 shrink-0 items-center gap-2 rounded-control bg-fill px-2 type-label-13 text-muted hover:bg-inset hover:text-ink focus-visible:-outline-offset-2"
                        >
                          <Search className="size-3.5 shrink-0" />
                          <span className="min-w-0 flex-1 truncate text-left">Search</span>
                          <Kbd>{chord("K")}</Kbd>
                        </button>
                      )}
                      <div className="relative">
                        <IconButton
                          label="Ask Pebble"
                          shortcut={chord("J")}
                          aria-pressed={(pebbleOpen && dockContent.kind === "pebble") || fullscreen}
                          onClick={() => {
                            setPebbleHintDismissed(true);
                            togglePebble();
                          }}
                          className={cn(
                            "aria-pressed:bg-inset aria-pressed:text-accent",
                            editingCandidate &&
                              !pebbleHintDismissed &&
                              !pebbleOpen &&
                              "bg-fill text-ink",
                          )}
                        >
                          <PebbleMark />
                        </IconButton>
                        {editingCandidate && !pebbleHintDismissed && !pebbleOpen && (
                          <aside
                            aria-label="Pebble editing help"
                            className="float-layer absolute top-9 right-0 z-30 flex w-64 gap-2 rounded-sm p-3 text-ink"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="type-label-13 font-medium">Pebble can help while you edit</p>
                              <p className="mt-1 type-meta-12 text-muted">
                                Ask about failed Evals, understand the code, or get help making changes.
                              </p>
                            </div>
                            <IconButton
                              label="Dismiss Pebble help"
                              size="small"
                              onClick={() => setPebbleHintDismissed(true)}
                            >
                              <X className="size-3.5" />
                            </IconButton>
                          </aside>
                        )}
                      </div>
                    </div>
                  </header>
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    <main className={fullscreen ? "h-full" : PAGE}>
                      <PebbleDockContext value={dock}>
                        <TabActionsScope>
                          <Outlet />
                        </TabActionsScope>
                      </PebbleDockContext>
                    </main>
                  </div>
                </Panel>
                {side === "right" && (pebbleOpen || resizing) && (
                  <PaneSeparator ref={separator} label="Resize Pebble" />
                )}
                {side === "right" && pebblePanel}
              </Group>
              {drag.drag !== undefined && (
                <PaneDropZones zone={drag.drag.zone} labels={DROP_LABELS} />
              )}
            </div>
          </div>
        </Frame>
      </RecordStates>
    </TooltipProvider>
  );
}

const DROP_LABELS: Record<PaneZone, string> = {
  left: "Move to left",
  center: "Make primary",
  right: "Move to right",
};
