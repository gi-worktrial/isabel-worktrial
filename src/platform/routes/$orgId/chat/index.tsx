import { createFileRoute, redirect } from "@tanstack/react-router";

import { threadUsed } from "#/lib/pebble/view";
import { threadsQuery } from "#/queries";
import { MainView } from "#src/features/pebble/main-view";

export const Route = createFileRoute("/$orgId/chat/")({
  staticData: { fullscreen: true },
  loader: async ({ context: { queryClient }, params: { orgId } }) => {
    const { pages } = await queryClient.ensureInfiniteQueryData(threadsQuery({ orgId }));
    const thread = pages[0]?.threads.find(threadUsed);
    if (thread !== undefined) {
      throw redirect({ to: "/$orgId/chat/$thread", params: { orgId, thread: thread.id } });
    }
  },
  component: MainView,
});
