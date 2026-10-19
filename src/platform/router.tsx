import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ParsedLocation, createRouter as createTanStackRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

// Long enough that a hover preload and the navigation after it share one fetch.
const STALE_TIME_MS = 30_000;

export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: STALE_TIME_MS } },
  });
  const router = createTanStackRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    // Pebble's chat moves between the dock and fullscreen, and its side pane opens and closes beside a fullscreen chat.
    defaultViewTransition: {
      types: ({
        fromLocation,
        toLocation,
      }: {
        fromLocation?: ParsedLocation;
        toLocation: ParsedLocation;
      }): string[] | false => {
        // An SPA's first page has no previous location, so it starts no view transition.
        if (fromLocation === undefined) {
          return false;
        }

        const fullscreen = (location: ParsedLocation | undefined) =>
          location !== undefined &&
          router.matchRoutes(location).some(({ staticData }) => staticData.fullscreen);
        const maximize = fullscreen(toLocation);
        if (fullscreen(fromLocation) !== maximize) {
          return [maximize ? "maximize" : "minimize"];
        }

        const pane = (location: ParsedLocation | undefined) =>
          new URLSearchParams(location?.searchStr).get("pane");

        return pane(fromLocation) === pane(toLocation) ? false : ["dock"];
      },
    },
    // Queries cache loader data, so the router doesn't keep its own copy.
    defaultPreloadStaleTime: 0,
    Wrap: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }

  interface HistoryState {
    /** The page of sessions a session was opened from, which its previous and next steps and Esc return to. */
    list?: { href: string; sessions: string[] };
  }

  interface StaticDataRouteOption {
    /** The page fills the shell's page panel, with Pebble's dock collapsed. */
    fullscreen?: boolean;
    /** The sidebar starts as a rail of icons. */
    rail?: boolean;
  }
}
