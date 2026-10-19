import "#src/styles/global-demo.css";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { getRouter } from "#/router";
import { TooltipProvider } from "#/ui/tooltip";
import { attachRouteSkeletons } from "#src/app/route-skeletons";
import { loadServices } from "#src/app/services";
import { provideClients, QUERY_RETRY } from "#src/queries/client";
import { RouteError } from "#src/ui/error-view";

provideClients(await loadServices());

// platform's shell keeps the last Org in a cookie through cookieStore; a browser without it just doesn't remember one
if (!("cookieStore" in window)) {
  Object.defineProperty(window, "cookieStore", { value: { set: () => Promise.resolve() } });
}

// platform's router, then what an SPA adds: every page has its skeleton, every route errors into Retry, and reads retry
// only what may succeed
const router = getRouter();
router.update({ ...router.options, defaultErrorComponent: RouteError });
attachRouteSkeletons(router);
const { queryClient } = router.options.context;
const defaults = queryClient.getDefaultOptions();
queryClient.setDefaultOptions({
  ...defaults,
  queries: { ...defaults.queries, retry: QUERY_RETRY },
  mutations: { ...defaults.mutations, retry: false },
});

// global.css pauses every transition until the first page has painted
const unsubscribe = router.subscribe("onRendered", () => {
  unsubscribe();
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      document.documentElement.dataset.settled = "true";
    }),
  );
});

const root = document.getElementById("root");
if (root === null) {
  throw new Error("The app document has no #root element.");
}

createRoot(root).render(
  <StrictMode>
    <TooltipProvider>
      <RouterProvider router={router} />
    </TooltipProvider>
  </StrictMode>,
);
