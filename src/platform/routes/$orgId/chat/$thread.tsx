import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useLayoutEffect } from "react";
import { Group, Panel, useDefaultLayout, usePanelRef } from "react-resizable-panels";
import { OutPortal } from "react-reverse-portal";
import { z } from "zod";

import { crumbs } from "#/crumbs";
import { threadTitle } from "#/lib/pebble/view";
import { usePebbleDock } from "#/pebble/page";
import { modelsQuery, threadQuery } from "#/queries";
import { PaneSeparator } from "#/ui/pane-separator";

const PANEL_MIN_SIZE = "30%";

export const Route = createFileRoute("/$orgId/chat/$thread")({
  staticData: { fullscreen: true },
  validateSearch: z.object({ pane: z.literal("desktop").optional() }),
  loader: async ({ context: { queryClient }, params }) => {
    const [thread] = await Promise.all([
      queryClient.fetchQuery(threadQuery(params)),
      queryClient.ensureQueryData(modelsQuery(params)),
    ]);
    if (thread.archived) {
      throw redirect({ to: "/$orgId/chat", params: { orgId: params.orgId } });
    }
    return crumbs({ label: threadTitle(thread), to: "/$orgId/chat/$thread" });
  },
  component: Chat,
});

function Chat() {
  const { chat, pane } = usePebbleDock();
  const open = Route.useSearch({ select: ({ pane }) => pane !== undefined });
  const navigate = useNavigate();
  const panel = usePanelRef();
  const layout = useDefaultLayout({ id: "grounded.pebble.pane.v1" });

  // In the navigation's commit, so its view transition captures the pane opening or closing.
  useLayoutEffect(() => {
    if (open) {
      panel.current?.expand();
    } else {
      panel.current?.collapse();
    }
  }, [open, panel]);

  return (
    <Group
      orientation="horizontal"
      className="h-full"
      defaultLayout={layout.defaultLayout}
      onLayoutChanged={layout.onLayoutChanged}
    >
      <Panel id="chat" minSize={PANEL_MIN_SIZE}>
        <section
          aria-label="Pebble"
          className="flex h-full flex-col bg-surface [--chat-width:var(--container-reading)] [view-transition-name:pebble-chat]"
        >
          <OutPortal node={chat} />
        </section>
      </Panel>
      {open && <PaneSeparator label="Resize pane" />}
      <Panel
        id="pane"
        panelRef={panel}
        collapsible
        defaultSize={0}
        minSize={PANEL_MIN_SIZE}
        onResize={({ inPixels }, _id, previous) => {
          // A drag that collapses the pane closes it.
          if (open && inPixels === 0 && previous !== undefined && previous.inPixels > 0) {
            void navigate({ to: ".", search: (search) => ({ ...search, pane: undefined }) });
          }
        }}
      >
        <div inert={!open} className="h-full p-2">
          <div className="h-full overflow-hidden rounded-sm border border-divider [view-transition-name:pebble-pane]">
            <OutPortal node={pane} />
          </div>
        </div>
      </Panel>
    </Group>
  );
}
