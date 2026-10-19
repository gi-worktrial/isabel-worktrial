---
name: doc-writing
description: Use when writing or editing any doc, README, skill, UI copy, Pebble prompt or Walkthrough caption in demo-product or demo-data
---

# Doc writing

## Content

- Support claims with code, data and observations. Use real names, numbers and commands; the newest source wins, and conflicts need to be flagged
- Reread the file before editing and preserve concurrent changes and other people's sections
- Keep useful wording and specific details. Cut filler, repeats and scaffolding; link to the existing instruction that has the detail
- Describe current structure and interfaces. Leave out edit diaries, implementation history, WIP notes and line counts
- Keep customer names out of product docs and internal infra names out of product copy

## Structure

- Start with the main point, then add detail where a claim needs proof. Skip intros that repeat the headers or explain the page's purpose
- Keep headers short, use questions only for a Q&A, and use `###` for subsections
- Use bullets for parallel points and numbers when order matters. Group related bullets only when hierarchy helps; put a lone sub-bullet on its parent line
- Keep each bullet to one thought and skip its final period. Merge thin sections and choppy bullets
- Prefer lists to tables; reserve at most one table for a real grid
- Use numerals for counts and make them match the list. Backtick paths and commands; arrows can show a one-line flow
- Scope sections describe the simplest experience first, then one list of what comes later, without release names or dates
- A README has a Structure section and commands. Paired repos explain their interface; each fact lives in one place that others link to

## Voice

- Use language you could say on a call. Use "we" for the team and "you" for the reader
- Use names directly, plain verbs and simple definitions. Vary sentence length and list openings
- Split sentences that carry several ideas; avoid trailing clauses, repeated openings and lists padded to three items
- Avoid slogans, "X, not Y" framing, vague verbs and robotic setups such as "Engineers can reach it in 3 places"
- Use a few concrete examples when they clarify a rule
- Avoid hype and AI filler (delve, leverage, unlock, robust, seamless, crucial, showcase, foster, landscape, serves as)
- Prefer plain words
  - canonical → main, standard; landing → merge, release, close; fire off, goes out → send
  - holds → is true; hangs off → is part of; contract → interface; owns → is responsible for
  - surfaces → shows, flags; covers → explains, lists, has; feed → bring in, move into
  - ship → release, merge, go live; gets us → helps us; front door → way in, first step
- Cut "run with it", "forcing function", "widely", "to start" at the end of a line, "So far" labels and "the artifact is" framing

## Style

- No em dashes; keep colons and commas to a minimum
- Use " - " before a reason or aside, "+" to join a pair and parentheses for extra detail. Split a line that needs more than 2-3 commas
- Use one set of parentheses per line, "/" only when it reads naturally, and hyphens in ranges
- Headers have no bold, emojis, icons or colored backgrounds
- Capitalize core primitives (Agent, Trace, Issue, Eval, Eval run, Criterion, Grade, Candidate, Fix, Replica, Version, Automation, Activity) and underline them with `<u>` in docs
- Names and labels such as Pebble, Grounded and stage names have no underline. Keep markup out of UI strings and structured output

## Product copy

- Agent = model + harness (bundle + agent loop + runtime)
- Issue stages = Validate → Review → Deploy. Debug is a mode within Review
- Use product words on screens (e.g. no sandbox or job on Issue screens)
- Buttons use plain verbs (e.g. Validate, Dismiss, Reopen); Activity lines use the past tense
- Omit sentences that explain what the screen shows
- Pebble speaks as a colleague in the first person ("I read this as", "I would") in 3 sentences at most
- Spell record names exactly as the data does and preserve names and meaning when shortening
- No all caps, "•" separators or dangling text after tags

Read the result at speaking pace and check links, commands and claims. Demo-data's `pnpm check` also runs `src/prose-rules.ts` on generated text.
