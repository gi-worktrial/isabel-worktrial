import {
  GroundedError,
  pebbleModels,
  type Thread,
  type ThreadConnectionOptions,
  type ThreadPage,
} from "@grounded-intelligence/grounded-sdk";
import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { threadUsed } from "#/lib/pebble/view";
import { modelsQuery, shellQuery, threadQuery, threadsKey, threadsQuery } from "#/queries";

const orgRoute = getRouteApi("/$orgId");
const INTERNAL_SERVER_ERROR = 500;

const byLastUsed = (a: Thread, b: Thread) => b.updated_at.localeCompare(a.updated_at);

/** The caller's loaded threads, most recently used first, with the next page to load. */
export function useThreads() {
  const { orgId } = orgRoute.useParams();
  const query = useInfiniteQuery({
    ...threadsQuery({ orgId }),
    // Retries until Cobblestone is back from a deploy or outage, but not a request it rejected.
    retry: (_, error) => !(error instanceof GroundedError && error.status < INTERNAL_SERVER_ERROR),
  });
  // A page's cursor reads the last thread's current `updated_at`, so one used since can appear twice.
  const threads = [
    ...new Map(query.data?.pages.flatMap(({ threads }) => threads.map((t) => [t.id, t]))).values(),
  ].sort(byLastUsed);

  return { ...query, threads };
}

/** The selected Agent's repository, which Pebble works in when a chat includes it. */
export function useAgentRepo(agent: string | undefined) {
  const { orgId } = orgRoute.useParams();
  const { access } = orgRoute.useRouteContext();
  const { agents } = useSuspenseQuery(shellQuery({ orgId, tenant: access.tenant })).data;
  return agents.find(({ name }) => name === agent)?.repo;
}

export function usePebbleModels() {
  const { orgId } = orgRoute.useParams();
  return pebbleModels(useSuspenseQuery(modelsQuery({ orgId })).data);
}

const archiveKey = (orgId: string) => [...threadsKey({ orgId }), "archive"];

/** Writes a thread's new metadata into every cached list and read of it, dropping it from lists once archived. */
export function useThreadUpdated() {
  const { orgId } = orgRoute.useParams();
  const queryClient = useQueryClient();

  return (thread: Thread) => {
    const list = queryClient.getQueryData<InfiniteData<ThreadPage>>(threadsKey({ orgId }));
    const listed = list?.pages.some(({ threads }) => threads.some(({ id }) => id === thread.id));
    if (list && listed) {
      queryClient.setQueryData(threadsKey({ orgId }), {
        ...list,
        pages: list.pages.map((page) => ({
          ...page,
          threads: page.threads
            .filter(({ id }) => id !== thread.id || !thread.archived)
            .map((cached) => (cached.id === thread.id ? thread : cached)),
        })),
      });
    }
    // An archive in flight refetches once it settles, so its row and any still leaving aren't dropped mid-animation.
    const archiving = queryClient.isMutating({ mutationKey: archiveKey(orgId) }) > 0;
    if (!listed || (thread.archived && !archiving)) {
      void queryClient.invalidateQueries({ queryKey: threadsKey({ orgId }) });
    }
    queryClient.setQueryData(threadQuery({ orgId, thread: thread.id }).queryKey, thread);
  };
}

/** Renames a thread, showing the new title while the request is in flight. */
export function useRenameThread() {
  const { client } = orgRoute.useRouteContext();
  const updated = useThreadUpdated();

  return useMutation({
    scope: { id: "rename-thread" },
    mutationFn: ({ thread, title }: { thread: Thread; title: string }) =>
      client.pebble.threads.update(thread.id, { title }),
    onMutate: ({ thread, title }) => updated({ ...thread, title }),
    onSuccess: updated,
    onError: (_error, { thread }) => updated(thread),
  });
}

/** How long a chat row takes to leave its list (`--animate-row-out`), which an archive waits out before dropping it. */
const ROW_EXIT_MS = 300;

/** Archives a thread, with `archiving` holding the ones whose rows are leaving their lists. */
export function useArchiveThread() {
  const { orgId } = orgRoute.useParams();
  const { client } = orgRoute.useRouteContext();
  const queryClient = useQueryClient();
  const updated = useThreadUpdated();
  const [archiving, setArchiving] = useState<ReadonlySet<string>>(new Set());

  const mutation = useMutation({
    mutationKey: archiveKey(orgId),
    mutationFn: async (thread: string) => {
      const [archived] = await Promise.all([
        client.pebble.threads.update(thread, { archived: true }),
        new Promise<void>((resolve) => setTimeout(resolve, ROW_EXIT_MS)),
      ]);
      return archived;
    },
    onMutate: (thread) => setArchiving((ids) => new Set(ids).add(thread)),
    onSuccess: updated,
    onSettled: (_archived, _error, thread) => {
      setArchiving((ids) => new Set([...ids].filter((id) => id !== thread)));
      if (queryClient.isMutating({ mutationKey: archiveKey(orgId) }) === 1) {
        void queryClient.invalidateQueries({ queryKey: threadsKey({ orgId }) });
      }
    },
  });

  return { ...mutation, archiving };
}

/** Creates a thread for `repo`, or reopens a loaded one for it that has never had a prompt. */
export function useCreateThread() {
  const { orgId } = orgRoute.useParams();
  const { client } = orgRoute.useRouteContext();
  const queryClient = useQueryClient();
  const { threads } = useThreads();

  return useMutation({
    mutationFn: async (repo: string | undefined) => {
      const repos = repo === undefined ? [] : [repo];
      const unused = threads.find(
        (thread) => !threadUsed(thread) && thread.repos.join() === repos.join(),
      );
      if (unused !== undefined) {
        return unused;
      }

      const [model] = pebbleModels(await queryClient.fetchQuery(modelsQuery({ orgId })));
      // the demo has no models, so its chats start without one
      const thread = await client.pebble.threads.create({ model: model?.name, repos });
      queryClient.setQueryData<InfiniteData<ThreadPage>>(threadsKey({ orgId }), (data) =>
        data === undefined
          ? data
          : {
              ...data,
              pages: data.pages.map((page, index) =>
                index === 0 ? { ...page, threads: [thread, ...page.threads] } : page,
              ),
            },
      );
      return thread;
    },
  });
}

type Connection = ThreadConnectionOptions | { error: string };

/** Connection options for `thread`, or undefined while they load. */
export function useThreadConnection(thread: string | undefined) {
  const { client } = orgRoute.useRouteContext();
  const [loaded, setLoaded] = useState<{ thread: string; connection: Connection }>();

  useEffect(() => {
    if (thread === undefined) {
      return;
    }

    let current = true;
    client.pebble.threads.connectionOptions(thread).then(
      (connection) => current && setLoaded({ thread, connection }),
      (error: Error) => current && setLoaded({ thread, connection: { error: error.message } }),
    );
    return () => {
      current = false;
    };
  }, [client, thread]);

  return loaded?.thread === thread ? loaded?.connection : undefined;
}

/** `active` when it's set and not archived, else the most recently used chat. */
export function useActiveThread(active: string | undefined) {
  const { orgId } = orgRoute.useParams();
  const list = useThreads();
  const listed = list.threads.find(({ id }) => id === active);
  const opened = useQuery({
    ...threadQuery({ orgId, thread: active ?? "" }),
    enabled: active !== undefined && listed === undefined,
  }).data;

  let thread = listed ?? opened;
  if (active === undefined || thread?.archived) {
    thread = list.threads[0];
  }

  return { ...list, thread };
}
