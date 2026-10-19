---
name: code-quality
description: Use when writing, reviewing or simplifying code and tests in demo-product or demo-data
---

# Code quality

Follow the current repo's [AGENTS.md](../../../AGENTS.md) for layers, shared exports, demo content, permissions, deletion checks and validation.

## Approach

- Read the relevant code and callers to understand the problem, constraints and current behavior
- Compare proposals with the simplest version that meets the constraints. Justify each added dependency, state, format or abstraction
- Spend extra design time on hard-to-reverse choices such as stored formats and public interfaces
- Look for prior art in the repo, installed libraries and platform before designing something new
- Reproduce a bug before fixing it. Build in small changes and preserve behavior outside the request

## Structure

- Keep one way to do each thing and one definition of each default
- Name modules by their concern, never `utils` or `helpers`
- Keep related decisions together and split a grab-bag only at a real responsibility boundary
- Reuse existing modules and components before creating another shape for the same job
- Inline a one-use wrapper when it names no rule or meaningful boundary
- Prefer an installed library to custom code. Add a dependency when it removes enough custom code to justify its cost
- Keep the repo's library register current and remove dependencies when nothing uses them
- Preserve errors, side effects, ordering and approval boundaries when simplifying
- A registry, union or wrapper with one member waits for its second caller. Call the thing directly until then
- Use a maintained protocol type (the AI SDK's `UIMessage`, the SDK's own types) instead of a local copy, one vocabulary per boundary
- Give a meaningful number a named constant

## Types

- Parse external data once with Zod and derive types from schemas
- Use `z.strictObject` for fixed records and represent real absence explicitly
- Trust schema guarantees. An impossible state gets a named error rather than a guessed default
- Narrow instead of casting. Keep required `SAFETY` explanations for unavoidable assertions
- Never add `any`, non-null assertions or type and lint suppressions
- Handle every promise and use braces for control flow
- Use `.ts` extensions for relative imports and extensionless `#src/` aliases through the package map

## Comments

- Explain reasons and invariants the code cannot show, especially approval, revision and sync rules
- Keep comments short, lowercase and beside the decision
- Let names and types explain routine behavior. A comment that restates the code means the code needs a better name
- JSDoc only on library exports read without their body (`src/sdk`, `src/queries`, `src/pebble`, `src/demo/plane`), one sentence each
- Use a file header only for a non-obvious module responsibility
- Remove narration, implementation history and stale claims. Keep required `SAFETY` markers
- Use no semicolons or colon-joined clauses in comment prose. Put config explanations in docs, not config comments
- A TODO names concrete remaining work and links to its issue when one exists

## Review and checks

- Read every changed line for speculative features, duplicate defaults and abstractions that add no useful decision or boundary
- Remove only code proved unnecessary. After replacing a mechanism, check for code and config that served only the old one
- Keep tests for meaningful behavior. Never weaken assertions, skip tests or lower a quality gate
- Use accessible browser locators, select records by property and wait for outcomes rather than elapsed time
- Follow `AGENTS.md` for required checks and journeys. Report the evidence and its limits
