---
name: frontend-engineering
description: Use when changing React state, URL params, data loading, Pebble chat, shortcuts, or adding a library in demo-product
---

# Frontend engineering

Follow [code-quality](../code-quality/SKILL.md) for shared engineering standards and [grounded-design](../grounded-design/SKILL.md) for visual constraints. When platform's `web/src` already does a thing, port its way first.

## Data

- Screens read through platform's `queries.ts` (`#/queries` in `src/platform`), which a patch changes only to export `agentKey`, `issueKey` and `agentRepo`
- Our own reads go in `src/queries/extra.ts` (`traceSearchQuery`, `traceAnnotationsQuery`, `candidateRunsQuery`, `runEvalsQuery`, `comparisonQuery`), keyed under `agentKey` and `issueKey` so a write that invalidates an Agent or Issue rereads them too. A read platform has stays platform's; never a second copy
- Each read is a `queryOptions` keyed by Org and Agent, preloaded in its route's loader with `ensureQueryData` and read with `useSuspenseQuery` or `useQuery`
- Queries call only `ProductClient` (`src/queries/client.ts`) through `clientFor(orgId)`, which platform's `services.ts` shim hands out. It is platform's `GroundedClient` resources plus Pebble's threads, so every Issue rule, Candidate result and Eval run comes from platform's `Issues` and `Evals`
- Never derive an Issue rule in a screen. Use platform's `getIssueActions`, `canApprove`, `canShip`, `canChangeTraces` and the summaries' `status`, `results` and `outdated`
- Reads stay fresh for 30 seconds and poll every 5 seconds (`RUN_POLL_INTERVAL`) while a run, Candidate or Issue is pending; a run's results keep polling for a minute after it completes
- Job runs use platform's shape (`status` + `conclusion` + `phase`, plus GitHub's `steps`, each with its own log through `stepLogQuery`); `run-evals` results come from `client.evals.getRun`
- Start independent reads together, ignore stale results when the selection moves, and keep loading, empty, failed and cancelled distinct
- Measure before and after on the same route, data and build; fix broad subscriptions and waterfalls before memoizing

## Routing

- The router is platform's `router.tsx` over platform's route files in `src/platform/routes`; the router plugin writes `routeTree.gen.ts` from them. Its one patch skips the view transition on an SPA's first page, which has no previous location
- Compare (`issues/$issue/candidates/compare.tsx`) is our only route in the tree, listed under `ours` in `scripts/platform-web.json`. A new screen of ours is a route there too, never a second route tree
- `app/app.tsx` is the entry. It loads the services, calls `getRouter()`, sets `RouteError` as every route's error view, attaches the route skeletons, and gives the query client `QUERY_RETRY` (no retries for mutations). It also stands in a no-op `cookieStore` where a browser lacks one, since platform's shell writes the last Org there
- Route skeletons come from one place, `app/route-skeletons.ts`, so no route file changes for one. It maps each route id to its skeleton from `features/<area>/skeletons.tsx` and attaches them with `route.update({ pendingComponent })`, again after each hot update. A load quicker than 300ms keeps the previous view instead
  - Skeleton files import only `ui/skeleton` and platform's `Skeleton` (plus `ui/tab-actions` for a tab's actions, platform's `ui/message` for the chat's and the router's `useSearch`), since they load with the first page
  - A route whose search changes from in-page controls (Traces' filters, Debug's tabs, Models' range) keeps its previous view on a search change and shows its skeleton only on arrival (`KEEP_PREVIOUS`)
  - The shell's own `ShellSkeleton` stays in its fork
- A route that fills the page panel with Pebble's dock shut sets `staticData.fullscreen` (the chat routes)

## Writes

- Every Issue write goes through `client.issues`: `update` (validate, dismiss with a reason, reopen, reset, include or exclude a Trace, approve, unapprove, ship), `createCandidate`, `updateCandidate`, `updateEvals`, `updateNotes`, `syncEvals` and `rerunCandidate`
- A write commits against the head the page read (`expectedHeadOid`). A moved head is platform's 409: say the record changed, reread, and keep the engineer's unsaved edits
- Invalidate the queries a write touches; never write a copy of a record into local state
- Pebble's chips call the same methods, only on click

## State and URL

- Committed state comes from records; browser state is only drafts, picks and preferences, through `src/data/storage.ts` with keys scoped by Org and Agent (`storage-keys.ts`)
- A path per tab and record (`/issues/<id>/candidates/<candidate>`, `/runs/<id>`, `/traces/<session>/<trace>`), and search params only for list state and views (`?view=list`, `?afters=`, `?view=grades`, `?trials=`)
- Each route validates its search params with Zod in `validateSearch`, in the router's own format
- Debug's Files stays mounted while hidden, so unsaved edits survive a tab switch
- Effects only sync external systems and clean up their listeners, requests and timers
- Shortcuts and the palette are platform PR 2's: `platform/shortcuts.tsx` (`chord`, `isTyping`, `isPlainKey`, the shortcut list), `platform/command-palette.tsx`, and the shell's one key handler; ⌘S is the editor's own. Our modules add palette groups through `ui/palette-groups.ts` (the demo's Walkthroughs and Reset demo, Debug's files), read as the palette renders

## Pebble

- Pebble is platform's `web/src/pebble` in `src/platform/pebble`: `session.ts` and `threads.ts` carry small patches, `page.ts`, `rename-thread.tsx` and `lib/pebble/view.ts` are copies, and `chat.tsx`, `conversation.tsx` and `composer.tsx` are forks (the first two render ours from `src/features/pebble`) that keep platform's structure, names and look with only Krish's additions (Read and action chips, @mentions, drafts, the side-to-main flow); `scripts/platform-web.json` says why for each
- One chat, `ActiveChat` in `features/pebble/chat.tsx`, mounted once in the shell (`routes/$orgId.tsx`, a fork) through a `react-reverse-portal` node and shown either in the side panel (`Pebble`) or on platform's chat routes (`/$orgId/chat`, `/$orgId/chat/$thread`, `staticData.fullscreen`) as the main view (platform's chat routes, a chat not yet started through `main-view.tsx`); pages describe themselves with `usePebblePage(context, prompts)` and open Pebble with text through `usePebbleDock().prefill`
- The shell decides which thread shows: the route's in the main view, else the side panel's pick, else the most recently used; leaving the main view hands its thread to the side panel and opens it, and the main view describes the page it came from
- A chat is platform's Pi session over the thread socket: `useThreadConnection` reads `client.pebble.threads.connectionOptions`, and `useSession` (`session.ts`) runs `useAgent` from `agents/react`, merges the session's entries, loads earlier pages, syncs after a reconnect, follows the sandbox status, and asks, retries (a fork before the question), stops and sets the model through the socket's calls
- The conversation is the session's entries (`chatTurns`, `answerBlocks`): reasoning and tool calls (`ToolStep`, `ToolDetail` with `PatchView` for an edit) fold under one `Work` line, compaction shows where it happened, and the scroll keeps its anchor as earlier messages load
- Krish's additions ride as entries the model never reads (`src/pebble/wire.ts`): `grounded.read` ahead of each question (the Agent it was asked under, the records its context read, its @mentions), `grounded.actions` after a demo answer (its chips) and `grounded.done` when the engineer runs a chip
- Each question carries the screen line plus the Issue, Candidate or Eval in view and every @mention (`mentions.tsx`), read through `queries.ts` in `context.ts` and written as the session's `grounded.context` entry when it changed
- Chips are `PebbleAction`s run in `actions.tsx` on click only; a write invalidates every query of its Agent (`agentKey`), and so does the end of a run in which Pebble's tools ran, so Issues and Candidates read again after Pebble commits; Pebble never approves or merges
- The unsent prompt is a module store per thread (`drafts.ts`), so the side panel and the main view share it; with no chats yet, the first question creates one and waits in `chat.tsx` until it connects
- In the demo, the chat list reads an Agent not yet opened from its saved layer without loading its seed, so only the Agent whose chat opens loads (`demo/services.ts`)
- Chats are platform's threads, read as platform's web does (`threads.ts`: the infinite `threadsQuery`, `threadQuery`, `useCreateThread` reusing an unused chat, `useThreadUpdated`, which the socket's `thread.updated` calls, `usePebbleModels`); the picker (platform's `ThreadPicker` props) is `features/pebble/thread-picker.tsx`, whose row actions platform's patched `sidebar.tsx` shares
- The pane layout is small: Pebble's side in `app/panes.ts` (saved), the widths in the panel layout, full screen in the shell; pane chrome is `ui/pane.tsx`
- The shell opens and closes the side panel (Ask Pebble, ⌘J, a page's `prefill`) inside a `dock` view transition so the chat slides; only the chat is ever captured (`:root` has no transition name), and clicks pass through while one runs
- Archive a chat with `useArchiveThread`, whose `archiving` set marks rows playing `animate-row-out` before the list drops them; an archived chat leaves lists but still reads by id
- In the demo, `demo/plane/thread-socket.ts` is the thread socket: connection options carry a `WebSocket` that answers in the page, speaking the agents frames `useAgent` reads and checking each call with platform's SDK schemas. Sessions live in the viewer's layer, and an answer streams as Pi's live partial, then lands as entries: a Walkthrough's recording (`answers.ts`), else demo-data's prepared answer to a suggested prompt (`answers.json`, matched by the prompt and the records the screen line names, read on the first question and never sent to a model), else the Worker's lines (`POST /api/pebble`), else "Pebble isn't connected in this demo."
- Keep Stop, Retry, Copy and the work fold working; chat switches don't animate existing messages

## Libraries

`pnpm check:reuse` checks this register for missing dependencies and nonexistent paths in Where (under `src/`).

| Need              | Library                                                                                                                                                             | Where                                                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Primitives, icons | `radix-ui`, `lucide-react`                                                                                                                                          | `ui`                                                                                                                                        |
| Styling           | `class-variance-authority`, `clsx`, `tailwind-merge`                                                                                                                | `platform/ui/cn.ts`, `platform/ui/button.tsx`, `platform/ui/tag.tsx`                                                                        |
| Routing, data     | `@tanstack/react-router`, `@tanstack/react-query` (platform's version, for `queryClient.query`)                                                                     | `platform/routes`, `platform/queries.ts`, `queries`                                                                                         |
| Markdown and MDX  | `fumadocs-core`, `mdast-util-mdx-jsx`, `micromark-extension-mdx-jsx`, `micromark-extension-mdx-md`, `unist-util-visit` (platform's MDX bodies with `<ApplyPrompt>`) | `platform/ui/markdown.tsx`, `platform/ui/markdown/apply-prompt.tsx`                                                                         |
| Trees and diffs   | `@pierre/trees`, `@pierre/diffs`, `picomatch`, `diff`                                                                                                               | `features/debug/file-editor.tsx`, `features/candidates/text-diff.tsx`, `platform/file-diffs.tsx`, `demo/plane/git.ts`, `demo/plane/glob.ts` |
| Split layouts     | `react-resizable-panels`                                                                                                                                            | `ui/pane-separator.tsx`, `platform/routes/$orgId.tsx`                                                                                       |
| One mounted chat  | `react-reverse-portal` (platform's, for the chat both views show)                                                                                                   | `platform/routes/$orgId.tsx`, `platform/routes/$orgId/chat/$thread.tsx`                                                                     |
| Pebble sessions   | `agents`, `@earendil-works/pi-durable`, `@earendil-works/chord`, `yaml` (platform's SDK imports), `@earendil-works/pi-ai` (platform's chat view)                    | `sdk/pebble.ts`, `sdk/issues.ts`, `platform/lib/pebble/view.ts`, `platform/pebble/session.ts`, `demo/plane/thread-socket.ts`                |
| Palette           | `cmdk`                                                                                                                                                              | `platform/command-palette.tsx`, `platform/ui/command.tsx`                                                                                   |
| Schemas, jobs     | `zod`, `smol-toml`                                                                                                                                                  | `demo/plane/job-definition.ts`, `demo/plane/registry.ts`                                                                                    |
| Schedules         | `cronstrue`                                                                                                                                                         | `platform/cron.ts`                                                                                                                          |
| Demo only         | `@openai/agents`, `dom-accessibility-api`                                                                                                                           | `demo/worker/index.ts`, `demo/walkthrough/drive.ts`                                                                                         |
