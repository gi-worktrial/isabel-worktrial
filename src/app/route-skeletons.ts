// every page's loading skeleton, attached to platform's routes from here so their files stay platform's: a page that
// loads past the router's pending delay shows its skeleton in its own layout's shape. The skeleton files import little
// beyond ui/skeleton, since everything here loads with the first page
import type { AnyRoute, RouteComponent } from "@tanstack/react-router";

import type { getRouter } from "#/router";
import { DebugCandidateSkeleton, DebugEvalsSkeleton } from "#src/features/debug/skeletons";
import {
  EvalRunsSkeleton,
  EvalSkeleton,
  GroundedEvalsSkeleton,
} from "#src/features/evals/skeletons";
import { InboxSkeleton } from "#src/features/inbox/skeletons";
import {
  ActivitySkeleton,
  CandidateSkeleton,
  CandidatesSkeleton,
  CompareSkeleton,
  IssueEvalsSkeleton,
  IssueSkeleton,
  IssueTracesSkeleton,
} from "#src/features/issue/skeletons";
import { ChatSkeleton, MainViewSkeleton } from "#src/features/pebble/skeletons";
import {
  AutomationsSkeleton,
  JobSkeleton,
  RunningSkeleton,
  RunSkeleton,
  RunsSkeleton,
} from "#src/features/runs/skeletons";
import {
  AgentSettingsSkeleton,
  DeploymentSkeleton,
  MembersSkeleton,
  ModelsSkeleton,
  SandboxesSkeleton,
} from "#src/features/settings/skeletons";
import { SpansSkeleton, TraceSkeleton, TracesSkeleton } from "#src/features/traces/skeletons";

type Router = ReturnType<typeof getRouter>;
type RouteId = keyof Router["routesById"];

// a load quicker than this keeps the previous view, so a quick page never flashes its skeleton
const PENDING_MS = 300;

// routes without a loader (an Issue's Overview, an Eval's Definition, Settings, the Automations frame) render at once
// under their parent's skeleton
const SKELETONS: Partial<Record<RouteId, RouteComponent>> = {
  "/$orgId/agents/$agent/issues/": InboxSkeleton,
  "/$orgId/agents/$agent/issues/$issue": IssueSkeleton,
  "/$orgId/agents/$agent/issues/$issue/traces": IssueTracesSkeleton,
  "/$orgId/agents/$agent/issues/$issue/evals": IssueEvalsSkeleton,
  "/$orgId/agents/$agent/issues/$issue/candidates/": CandidatesSkeleton,
  "/$orgId/agents/$agent/issues/$issue/candidates/$candidate": CandidateSkeleton,
  "/$orgId/agents/$agent/issues/$issue/candidates/compare": CompareSkeleton,
  "/$orgId/agents/$agent/issues/$issue/activity": ActivitySkeleton,
  "/$orgId/agents/$agent/issues/$issue_/debug/evals": DebugEvalsSkeleton,
  "/$orgId/agents/$agent/issues/$issue_/debug/candidates/$candidate": DebugCandidateSkeleton,
  "/$orgId/agents/$agent/traces/": TracesSkeleton,
  "/$orgId/agents/$agent/traces/$session/": TraceSkeleton,
  "/$orgId/agents/$agent/traces/$session/$trace": SpansSkeleton,
  "/$orgId/agents/$agent/evals/": GroundedEvalsSkeleton,
  "/$orgId/agents/$agent/evals/$eval": EvalSkeleton,
  "/$orgId/agents/$agent/evals/$eval/runs": EvalRunsSkeleton,
  "/$orgId/agents/$agent/automations/": AutomationsSkeleton,
  "/$orgId/agents/$agent/automations/running": RunningSkeleton,
  "/$orgId/agents/$agent/automations/runs": RunsSkeleton,
  "/$orgId/agents/$agent/jobs/$job": JobSkeleton,
  "/$orgId/agents/$agent/runs/$run": RunSkeleton,
  "/$orgId/agents/$agent/settings": AgentSettingsSkeleton,
  "/$orgId/settings/members": MembersSkeleton,
  "/$orgId/settings/models": ModelsSkeleton,
  "/$orgId/settings/sandboxes": SandboxesSkeleton,
  "/$orgId/settings/deployment": DeploymentSkeleton,
  "/$orgId/chat/": MainViewSkeleton,
  "/$orgId/chat/$thread": ChatSkeleton,
};

// pages whose loader reruns from an in-page control: Traces' search and filters, Debug's views (which hold unsaved
// edits) and the usage range on Models and Deployment. A change to their search keeps the previous view, so a field
// never loses focus and an edit is never dropped; arriving at the page still shows its skeleton
const KEEP_PREVIOUS: readonly RouteId[] = [
  "/$orgId/agents/$agent/traces/",
  "/$orgId/agents/$agent/issues/$issue_/debug/evals",
  "/$orgId/agents/$agent/issues/$issue_/debug/candidates/$candidate",
  "/$orgId/settings/models",
  "/$orgId/settings/deployment",
];

const route = (router: Router, id: RouteId): AnyRoute => router.routesById[id];

function attach(router: Router) {
  for (const [id, pendingComponent] of Object.entries(SKELETONS)) {
    route(router, id as RouteId).update({ pendingComponent });
  }
}

export function attachRouteSkeletons(router: Router) {
  router.update({ ...router.options, defaultPendingMs: PENDING_MS });
  attach(router);
  // a route file's hot update replaces its options, so the dev server attaches again after each update
  import.meta.hot?.on("vite:afterUpdate", () => attach(router));
  // the router reads a route's pending delay as each load starts, and never reveals a skeleton at an infinite one
  router.subscribe("onBeforeLoad", ({ pathChanged }) => {
    for (const id of KEEP_PREVIOUS) {
      route(router, id).update({ pendingMs: pathChanged ? PENDING_MS : Infinity });
    }
  });
}
