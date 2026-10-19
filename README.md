# demo-product

Grounded's design-forward product demo. It follows Connor's platform (`platform/web` + `libs/grounded-sdk`) for flows, data and words, and keeps Krish's look and tone on top. [demo-data](../demo-data/README.md) builds the records the demo reads.

Read [Product experience](docs/product-experience.md) for the screens and flows, [Plan](docs/plan.md) for the platform parity work and its decisions, and [Changes](docs/changes.md) for every change it made and why.

[Design workflow](docs/design-workflow.md) is how tokens move from code to the Figma file and back.

## How it fits together

```text
platform/routes → features → platform/queries.ts + queries/extra.ts → ProductClient (queries/client.ts)
                                                 │
                       app/services.ts picks one ┤
                                                 ├─ new GroundedClient(...) against an Org's data plane
                                                 └─ the demo Org (src/demo), in memory, from demo-data's seed files
```

- `ProductClient` is platform's `GroundedClient` resources (`repos`, `git`, `pulls`, `agents`, `jobs`, `issues`, `evals`, `settings`, `deployment`, `sandboxes`) plus Pebble's threads (list, get, create, update) and their socket's connection options
- Every Issue rule is platform's own `Issues` and `Evals` classes, in both paths. The demo builds in-memory `repos`, `git`, `pulls`, `agents` and `jobs` and runs those classes over them
- The screens are platform's web app, mirrored in `src/platform` (see Structure)
- Platform's `queries.ts` holds the query options per record, polling every 5 seconds while a run, Candidate or Issue is pending; `src/queries/extra.ts` adds our own reads (Add Traces search, a Candidate's runs, Grades, Compare)
- A write goes through `client.issues` (`update` for state, Traces, approve and ship; `createCandidate`, `updateCandidate`, `updateEvals`, `updateNotes`, `syncEvals`, `rerunCandidate`) as one commit against the head the page read; a moved head gets platform's 409 and the page rereads

## Structure

| Folder                                    | Responsibility                                                                                                                                          |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/platform`                            | Platform's `web/src` at its own paths: the router and route tree, `queries.ts`, the shell and sidebar, Pebble, the `ui` kit, styles and assets          |
| `src/app`                                 | The entry (`app.tsx`) and its route skeletons (`route-skeletons.ts`), Pebble's pane side (`panes.ts`), the services and the public bridge (`public.ts`) |
| `src/features`                            | Our pieces by area that platform's files call: issue, inbox, candidates, debug, evals, traces, runs, records, settings and pebble                       |
| `src/queries`                             | `client.ts` (the `ProductClient` interface and the services' refusals) and `extra.ts` (our reads)                                                       |
| `src/ui`                                  | Our kit: what platform's `ui` forks render, plus `TabActions`, `TimeTag`, `Table`, `Chip`, `Section`, `Clamp`, the skeleton shapes and `ErrorView`      |
| `src/styles`                              | Our sheets over platform's (`tokens-demo.css`, `global-demo.css`); the marks and favicon are platform's                                                 |
| `src/data`                                | Browser storage, keyed by Org and Agent                                                                                                                 |
| `src/pebble`                              | What a Pebble answer carries beside its words (`wire.ts`), React free                                                                                   |
| `src/sdk`                                 | Platform's SDK byte for byte                                                                                                                            |
| `src/demo`                                | The demo Org: services, shell, Get started and Reset demo                                                                                               |
| `src/demo/plane`                          | The in-memory backend: git store, pulls, jobs, runs, trials, traces, sandboxes, the thread socket and seed schemas                                      |
| `src/demo/walkthrough`, `src/demo/worker` | The Walkthrough player and the live Pebble Worker                                                                                                       |
| `test`                                    | Tiny seed and storage helpers for unit tests, the names baseline and the browser journeys                                                               |
| `scripts`                                 | Layer lint, reuse, design spec and bundle checks, the SDK and web mirror (`check:platform`, `sync:platform`) and the no-demo build                      |

### Platform's web app

`src/platform` is platform's `web/src` at platform's own paths, pinned to one platform commit in `scripts/platform-web.json`. The manifest gives each of platform's files a kind, and every patch, shim and fork a one-line reason:

- copy - platform's bytes. Never hand-edit one
- patch - platform's file plus a recorded patch in `scripts/platform-web/patches`. A patch only adds call sites and props into our modules (no features of its own) and stays within its line budget (40, more for a few named files)
- shim - platform's path and exports with our body, where platform runs server code: `services.ts`, `members.ts`, `db/organizations.ts` and `routes/__root.tsx`
- fork - our file at platform's path, where ours reads clearer (the keep list in [Plan](docs/plan.md)). The Issue route, the shell (`routes/$orgId.tsx`), the Trace viewer, the editor, Pebble's chat and a few `ui` files are forks
- skip - server, auth and database files an SPA doesn't run
- pending - a file platform added since the pin, until it's classified

The manifest also lists our own routes inside the tree (`ours`, today only Compare) and the generated `routeTree.gen.ts`, which the router plugin writes from `src/platform/routes`.

Platform's files import `#/` and `@grounded-intelligence/grounded-sdk`; ours import `#src/`, and import platform's files as `#/` only where platform's is the implementation. `src/platform` follows platform's lint and format, and never imports `src/demo`.

How the mirror moves:

- `pnpm check:platform` checks it against the pin (and `src/sdk` against `scripts/platform-sdk.json`). Copies hash equal, each patch reverse-applies to platform's file and stays within its budget, shims and forks exist, skipped files are absent, and nothing unlisted sits in `src/platform`. `-- --native` also lists what platform changed, added or removed since the pin, reading the sibling platform checkout only
- `pnpm sync:platform` three-way merges every copy and patch from the pin to platform's `origin/main`, rewrites the pins and patches, and lists conflicts, changed shims and forks, and new files. `-- --take <path>` brings a pending file in as platform's bytes, `-- --repatch` records copies and patches as they stand after an edit, and `-- --reviewed <path>` marks a shim's or fork's newer platform version as read
- After a take or a sync, `test/names.pw.ts` and `test/walkthrough-targets.pw.ts` show every accessible name that changed

Our additions live outside the mirror, and platform's files call them:

- `src/features/<area>` - the stepper and phases, verdicts, branches and Approve, Compare, Debug's header and Save, the Trace transcript and Flow, trial Compare, the Eval definition, Pebble's chat, and each area's route skeletons (`skeletons.tsx`)
- `src/ui` - our kit, which platform's `ui` forks render
- `src/queries/extra.ts` - our reads; `src/app` - the entry, route skeletons and panes
- `src/styles` - `global-demo.css` loads platform's `global.css`, then `tokens-demo.css` (only the tokens platform lacks: `success-ink`, `warning-ink`, `trace-1..3`, `branch-1..6`, the flash and the fold) and the classes we add (the field inset, `inline-link` and the side chat's view transition). Platform's four sheets in `src/platform/styles` stay byte for byte

`scripts/oxlint-plugin-repo.mjs` enforces the layers (`repo/layers`) and the design rules. `app/services.ts` is the only product module that loads `src/demo`, through `import()`. The demo reaches the product only through `app/public.ts` and the `ProductClient` type.

demo-data imports the React-free SDK and plane modules through this package's exports (`./sdk`, `./plane/*`). It holds every customer name, document, Trace, recording and caption.

## Run

Use Node 24 and the pnpm version pinned in `package.json`. Clone demo-data beside this repo, install both, and build its data first:

```sh
pnpm install
cd ../demo-data
pnpm install
pnpm build
cd ../demo-product
pnpm dev --host 127.0.0.1 --port 5189 --strictPort
```

Open [the demo Inbox](http://127.0.0.1:5189/demo/agents/ask-ramp/issues). The other demo Agents are `hebbia-chat` and `unity-ai`. Vite serves demo-data's `public` folder at `/scenarios` and copies it into the build. `DEMO_DATA` can name another demo-data checkout. Rebuild demo-data and reload after changing its records.

The Worker's `POST /api/pebble` uses `OPENAI_API_KEY` and an optional `OPENAI_DEFAULT_MODEL` (see `.env.example`). Without a key, live Pebble is off and a Walkthrough still plays its recorded answers.

A native Org needs `VITE_GROUNDED_API_URL`, `VITE_GROUNDED_ORG`, `VITE_GROUNDED_TOKEN` and `VITE_GROUNDED_USER` together. Vite inlines the token, so this path is for local testing only.

## Hosting

`wrangler.jsonc` configures the `grounded-demo` Cloudflare Worker at `demo.grounded.ai`. Cloudflare serves the built app and scenario files, and the Worker answers `/api/pebble` with the model key kept on the server. `pnpm deploy` builds and publishes it. Locally, Vite and the Cloudflare plugin run the app and Worker together.

## Checks

- `pnpm check` - types, lint, the mirror and SDK pins, reuse, the design spec, format, unit tests, build and bundle budget
- `pnpm check:platform` and `pnpm sync:platform` - `src/sdk` and the web mirror against their pins, and moving them (see Platform's web app)
- `test/names.pw.ts` and `test/walkthrough-targets.pw.ts` - the names baseline for the mirror: every role and accessible name on each demo route against `test/names` (gitignored, written on the first run or with `NAMES_UPDATE=1`), and every Walkthrough beat finding its target
- `pnpm test:browser` - browser journeys on 5185 with no `.env`: the review flow from Validate to Mark as shipped, the Demo call stepped with the arrow key, panes and Pebble's main view (`/chat`) with the sidebar's chats, Debug Evals played to fresh results, and a session's Flow view
- `pnpm test:without-demo` - builds and typechecks a copy with the demo runtime removed

`scripts/platform-sdk.json` records the SDK commit and file hashes. `pnpm check:reuse` reads the Libraries table in [frontend-engineering](.agents/skills/frontend-engineering/SKILL.md). Tests that use `#test/tiny-seed` need demo-data's built fixture. CI checks out both repos and builds demo-data first.
