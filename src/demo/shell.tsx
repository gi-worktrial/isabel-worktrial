import { Play, RotateCcw } from "lucide-react";
import { Fragment, lazy, type ReactNode, Suspense, useEffect, useState } from "react";

import { SidebarExtra, usePaletteGroups, useShell } from "#src/app/public";
import { GetStarted, ResetDemo } from "#src/demo/get-started";
import { useViewerGeneration } from "#src/demo/reset";
import {
  requestWalkthrough,
  useWalkthroughOffers,
  useWalkthroughs,
  WalkthroughsContext,
} from "#src/demo/walkthrough/state";

import { openedDemos, walkthroughsOf } from "./session.ts";

// one function so the memoized sidebar skips every page change
const getStarted = (collapsed: boolean) => <GetStarted collapsed={collapsed} />;

// nothing shows until a Walkthrough is asked for, so the player never delays the first page
const LazyPlayer = lazy(() =>
  import("#src/demo/walkthrough/player").then((player) => ({ default: player.WalkthroughPlayer })),
);

// one component for every Agent so a switch keeps the sidebar and palette mounted
export function DemoShell({ children }: { children: ReactNode }) {
  const generation = useViewerGeneration();
  const { connection, refresh } = useShell();
  const agentId = connection?.agentId;
  // an active Agent kept from an earlier visit loads its Walkthroughs once the demo opens it
  const walkthroughs = walkthroughsOf.get(agentId ?? "") ?? null;
  useEffect(() => {
    if (generation > 0) {
      void refresh();
    }
  }, [generation, refresh]);
  return (
    <WalkthroughsContext value={walkthroughs}>
      <ReopenOnSave agentId={agentId} refresh={refresh} />
      {walkthroughs === null ? null : <DemoCommands />}
      <SidebarExtra value={getStarted}>
        <Fragment key={generation}>{children}</Fragment>
      </SidebarExtra>
      <Suspense fallback={null}>
        <LazyPlayer
          opened={
            connection === null
              ? null
              : {
                  grounded: connection,
                  walkthroughs,
                }
          }
          agentId={agentId ?? null}
        />
      </Suspense>
    </WalkthroughsContext>
  );
}

// a draft begun before another tab's save is refused rather than saved over it
function ReopenOnSave({
  agentId,
  refresh,
}: {
  agentId: string | undefined;
  refresh(agentId: string): Promise<void>;
}) {
  useEffect(() => {
    const onStorage = ({ key, newValue }: StorageEvent) => {
      const layer = openedDemos.get(agentId ?? "")?.layer;
      if (layer !== undefined && key === layer.key && newValue !== layer.raw) {
        layer.stale = true;
        void refresh(agentId ?? "");
      }
    };
    addEventListener("storage", onStorage);
    return () => removeEventListener("storage", onStorage);
  }, [agentId, refresh]);
  return null;
}

// the palette keeps every Walkthrough and reset after Get started has gone
function DemoCommands() {
  const offers = useWalkthroughOffers();
  const { groups } = useWalkthroughs();
  const [resetting, setResetting] = useState(false);
  usePaletteGroups(() => [
    ...groups.map(({ id: group, label }) => ({
      heading: label,
      items: [
        { id: group, name: `Play all ${label}`, unavailable: null },
        ...offers
          .filter(({ walkthrough }) => walkthrough.group === group)
          .map(({ walkthrough, unavailable }) => ({
            id: walkthrough.id,
            name: walkthrough.name,
            unavailable,
          })),
      ].map(({ id, name, unavailable }) => ({
        // a Walkthrough can share its name with a page, which the palette tells apart by value
        value: `${name} in ${label}`,
        label: name,
        icon: <Play />,
        keywords: ["walkthrough"],
        disabled: unavailable !== null,
        onSelect: () => requestWalkthrough(id),
      })),
    })),
    {
      heading: "Demo",
      items: [
        {
          value: "Reset demo",
          icon: <RotateCcw />,
          keywords: ["start over", "clear", "get started"],
          onSelect: () => setResetting(true),
        },
      ],
    },
  ]);
  return <ResetDemo open={resetting} onClose={() => setResetting(false)} />;
}
