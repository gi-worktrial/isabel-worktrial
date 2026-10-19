# Agents

## Read

- [README](README.md) for structure and run, [Product experience](docs/product-experience.md) for the product, screens and flows, [Plan](docs/plan.md) for the platform parity work and its decisions (log every change in [Changes](docs/changes.md))
- Read [code-quality](.agents/skills/code-quality/SKILL.md) before writing or reviewing code
- Follow [doc-writing](.agents/skills/doc-writing/SKILL.md) for docs, UI copy, Pebble prompts and captions
- App guidance: [grounded-design](.agents/skills/grounded-design/SKILL.md) for screens and look, [frontend-engineering](.agents/skills/frontend-engineering/SKILL.md) for state, data, Pebble and libraries

## Rules

- Imports follow the layers in the README, and `repo/layers` lint enforces them
  - `src/ui` imports only `ui`, `assets` and `platform`; `src/sdk` imports only its own files and its packages
  - Only `src/app/services.ts` imports `src/demo`; the public shell bridge is `src/app/public.ts`
- Screens call only `ProductClient` (`src/queries/client.ts`): platform's GroundedClient resources plus Pebble's threads; every Issue rule is platform's `Issues` and `Evals` classes
- `src/sdk` keeps platform's files byte for byte; additions go in `gap-*.ts` and `index.ts`
- `src/platform` is platform's `web/src` at its own paths, and `scripts/platform-web.json` lists each file's kind (copy, patch, shim, fork, skip, pending) with a one-line reason for every patch, shim and fork
  - Never hand-edit a copy. A needed change is a patch that only calls our modules (add call sites and props, not features), recorded with `pnpm sync:platform -- --repatch` and kept within its budget; a shim keeps platform's path and exports with our body; a fork renders ours where ours reads clearer (the keep list in `docs/plan.md`)
  - Platform's files import `#/` and `@grounded-intelligence/grounded-sdk`; ours import `#src/`, and import platform's files as `#/` only where platform's is the implementation
  - `src/platform` follows platform's lint and format (the override in `.oxlintrc.json`), and nothing in it imports `src/demo`
  - Bring a pending file in with `pnpm sync:platform -- --take <path>`, then rerun `test/names.pw.ts` and `test/walkthrough-targets.pw.ts` and resolve each name change
- Every Issue write goes through `client.issues` (`update`, `createCandidate`, `updateCandidate`, `updateEvals`, `updateNotes`), as platform's web does
- Product browser storage goes through `src/data/storage.ts`; the demo viewer layer lives in `src/demo/plane`
- Product words only on screens; infra names stay in code and the Agent repo's files
- Fake records, customer names, recorded words, captions, and seed text live in demo-data, whose `public/scenarios` the app serves; unit test fixtures here stay generic and tiny
- demo-data imports this package's React-free exports through `link:../demo-product`; seed schemas live once in `src/demo/plane/seed`
- `scripts/platform-sdk.json` pins the native SDK source and `scripts/platform-web.json` the web mirror; `pnpm check:platform` checks both and `--native` compares the sibling platform checkout read only

## Checks

- `pnpm check`, plus `pnpm test:without-demo` when the demo boundary moves
- Journeys for the flows you touched (`pnpm test:browser <file>`), and demo-data's `pnpm check` after a shared module or seed change
- Prove a deletion by searching callers in both repos, tests, package exports, generated records, and dynamic imports; leave each folder smaller than you found it
- Never weaken a test, add a suppression, or apply automatic dead-code fixes

## Hard rules

- Never stage, commit, or push; platform is read only
- Never read or print `.env` or `.dev.vars`
- Move deleted files to the Trash, never `rm`
- Keep 5186 and 5190 free and never start on 5173 or 5174
- Never run pnpm in a copy whose `node_modules` is a link; call `node_modules/.bin/<tool>`
- demo-data authoring commands make paid model calls and need approval
