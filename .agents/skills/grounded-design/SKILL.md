---
name: grounded-design
description: Use when building or changing a demo-product screen, component, layout, color, or piece of product copy
---

# Grounded design

Platform's `web/` decides what a screen does and says; we decide how it looks. We keep our structure (white pages, bordered compact sections) and follow the Airtable kit closely in platform's tokens: SF Pro, neutral greys, flat grey-fill buttons and fields, one black primary per view (white in dark), square tinted tags, sentence-case labels, one border level, compact single-line rows. [Product experience](../../../docs/product-experience.md) says what each screen does. Figma file `Ehq3tczqsfQb0ElDb5xgeE` is the visual reference: its Components page is the kit we match, and its Grounded page has our tokens (named as in `tokens.css`) and example screens in light and dark, with Geist standing in for SF Pro. Its variables sync from `tokens.css` as [Design workflow](../../../docs/design-workflow.md) describes, and the older Examples may still show half steps, so the code's tokens and this skill win wherever Figma differs.

## Principles

- Each stage opens with Grounded's recommendation and one primary action. Engineers accept it in one click or change it
- Show what matters, with the rest one click away. Tags carry status and categories, tables keep the columns needed to decide, and screens reuse Trace, Issue, Eval and Candidate primitives
- Engineers can open, edit or override anything. Pebble acts only on a click
- Put evidence beside each claim, and read a failure in 3 layers: the raw Trace, the step where it failed, and why (the Grade's reasoning)
- Every step is reachable in the UI. An empty selection explains itself and disables what needs it ("No Evals selected for this Issue" + Add Evals)

## Time

- Platform's formats win: 24-hour, the viewer's zone ("Oct 01 14:05", a day as "Thu, Oct 1, 2026", seconds only in a span's details), the exact moment with its zone in the tooltip; no relative ages or AM/PM
- Durations read as platform writes them ("2 µs", "343.4 ms", "6.00 s"), except the trace viewer's, which read at a glance ("130 ms", "9.8 s", "2m 12s", "1h 4m") until platform takes that format; a column's name follows platform's word (its run tables say Started)

## Tokens

Tokens live in platform's sheets in `src/platform/styles` (`tokens.css` colors, radii, shadow and widths, `type.css` the type scale, `components.css` the shared classes), with ours added in `src/styles` (`tokens-demo.css`, and `global-demo.css` for the classes we add). Screens use token names, never raw values, and the `repo/colour-*`, `repo/type-*` and `repo/layout-*` lint rules check it.

- Color
  - Platform's `tokens.css` is ours byte for byte; `tokens-demo.css` adds only what platform lacks (`success-ink`, `warning-ink`, `trace-1..3`, `branch-1..6`, the flash and the growing fold). A new color goes to platform first or into `tokens-demo.css`, never into `tokens.css`
  - Neutral greys: `surface` white, `subtle` #F8F8F8 (row hover), `overlay` white (menus), `fill` #F2F2F2 (fields, grey buttons, tracks), `inset` #EEEEEE (press, a neutral `Tag`, `Count` and `Kbd`), `divider` #E0E0E0, `divider-strong` #CCCCCC (the outline button's border), `ring` #A8A8A8 (focus)
  - Text: `ink` #333333 for names and values, `muted` #757575 for secondary words (AA on `surface` and `subtle`), `faint` #9E9E9E only for placeholders and disabled
  - Primary: `primary` #1F1F1F under `on-primary` white, near-white #EDEDED under #0A0A0A in dark (the one primary button)
  - Accent: Airtable blue #2D7FF9 (`accent`, its words on a tint `accent-ink`) for links, selection, focus and live states only; kit pieces: `pick` #757575 (the picked segment), `tip` #333333 (tooltips), `on` #20C933, `alarm` #F82B60 (platform's alert words only), `white` (words on `tip`)
  - Tags sit on tints: outcomes as words on light tints, `success-ink` #2B7413 on #D1F7C4, `danger` #BA1E45 on #FFDCE5, `warning-ink` #8F5B00 on #FFEAB6, Running in `accent-ink` on #CFDFFF (the `-ink` words keep AA where platform's `success` and `warning` fall short); green and red words alone are fine for results ("3/3 New", +28, -9)
  - One red: `danger` is the danger button's fill and the danger tag's words, under `on-primary` words so it reads in both themes
- A Criterion's kind is the one use of `teal` and `purple`: Code check teal, LLM judge purple, each as words on its tint
  - Compared traces: `trace-1` blue #2A78D6, `trace-2` orange #EB6834, `trace-3` aqua #1BAF7A (their own dark steps), checked apart for color vision; always beside the trace's name, and 3 at most
  - Candidate branches: `branch-1..6` muted hues (mauve, slate, sage, ochre, clay, rose) as words on their tints, always with the branch icon and name
  - `selection` #E7EFFF is the one selected fill, and `link` + `link-ink` (#3B4A63 on #E8EEF7) the Chip, which keeps its blue-grey so a linked record reads apart from a neutral tag
  - Dark is black (#000000, greys stepping up in neutral steps) with cyan #18BFFF; hues soften (success #4CD263, danger #FF6B8E) and every tint is a 12-16% alpha wash, so tags stay quiet
  - Light is the `@theme` default and dark one `[data-theme="dark"]` block on `html`
- Color rules
  - Green and red only for outcomes, amber only for stale, out of date or behind, `trace-1..3` only for compared traces; teal and purple only for a Criterion's kind; everything else grey, one colored thing per row
  - Light by default, dark only on the toggle, never from the OS
- Type is SF Pro through the system stack (Geist bundled as the fallback), SF Mono only for ids, shas, file names in code and tool names
  - `type-title-18` titles, `type-heading-15` section and dialog titles, `type-copy-14` body, `type-label-13` controls, rows and table headers, `type-meta-12` facts, field labels and tags, `type-mono-12` ids
  - Semibold for titles, headings, figures and table headers (in ink), medium for buttons, tabs and tags, regular for body and rows
  - No all caps anywhere, sentence case only
  - Text sizes come only from the `type-*` tokens, never `text-[Npx]`, `text-sm` or a `leading-*` of its own; weight and color go on top
- Radius 4 (`rounded-xs`) for buttons, fields, tags and tabs, 3 for the Chip and tooltip, 6 (`rounded-sm`) for cards, menus and dialogs, `rounded-full` for dots and avatars
- Spacing on a 4px grid: 8 within a group, 16 between rows of facts, 24 between sections inside a card, 32 between page sections
  - Padding, margin, gap, space and inset use whole Tailwind steps (1 = 4px) or a multiple of 4px; the half steps (0.5, 1.5, 2.5, 3.5) and odd pixels fail `repo/layout-spacing-scale`
  - A control bleeds by its own padding (`-ml-2` beside `px-2`, `-ml-3` beside `px-3`), so its words or glyph sit on the column's edge
  - Sizes are not spacing: a 2px bar, a 14px glyph or a 20px tag height are fine, and a 20px line centres in a 32px field with 6px above and below
- Row heights: 20 for inline pills (`Tag`, `Chip`, `Kbd`), 28 for dense rows (menu items, small buttons, tree and disclosure rows), 32 for controls and their rows (buttons, fields, tabs, nav, steps, settings lines), 36 for table rows, list rows and pane headers, 40 for `SectionHeader`
- Icons are lucide at one size per context
  - 16 (`size-4`) in buttons, icon buttons of both sizes, nav, menu and palette items, list and tree rows, and field glyphs
  - 14 (`size-3.5`) beside 12px words (small buttons, meta lines, the page path, Trace summary steps) and for chevrons and other affordances (a menu's check, sort arrows, Back), drawn in a 16 slot where a row's next item must start on the grid
  - 12 (`size-3`) inside a `Tag`, `Chip` or a tag-like pill (Flow's step pills); 20 only for the `EmptyState` mark
  - Page width `max-w-page` (1280); reading width `max-w-reading` (680) only for Markdown prose
- One shadow, `shadow-float`, only on menus, popovers, tooltips and dialogs
- Motion is 120ms ease-out by default + the segment box slides in 130ms; every animation respects reduced motion. Switching chats shows existing messages without entry motion
- Shared classes in `components.css`: `field-control`, `slider` (the sliding box under a picked segment), `float-layer`, `menu-panel`, `menu-item`, `card`, `selected` and `row-selected`, `focus-inset`, `record-table`, `row-action`, `breathe` (the live dot) and `shimmer` (Pebble thinking); `enter-fade` lives in `global.css`

## Components

The kit is platform's `ui` (`src/platform/ui`, imported as `#/ui/...`) with ours in `src/ui` (Radix with `cn()` and `cva` variants). Where ours reads clearer, platform's file is a fork that renders ours, so platform's screens draw our look unchanged: button, tag, menu, markdown and the rest, each listed in `scripts/platform-web.json`. `input`, `message`, `timestamp`, `page-link`, `theme`, `cn`, `tooltip`, `dialog`, `field`, `copy-button` and `skeleton` are platform's own, and `empty-state` is platform's with a small patch (an `action` and an alert `role`). Each control lives once, and `src/ui` never imports features. Reuse before adding a variant, and match the Figma Components page for props.

- `Button` - five variants and two sizes, nothing more, flat with the icon left
  - `primary` ink fill with white words (white with black words in dark, one per view), `secondary` grey fill (the default), `outline` bordered on the surface for a second choice beside the primary, `quiet` muted words with no fill until hover, `danger` the `danger` red fill
  - `small` 28 with 12px words, `default` 32 with 13px words
  - Every variant has a hover background, a router `Link` included (`asChild` or `buttonVariants`), so a link that acts as a button looks and hovers like one; `quiet` and `IconButton` hover with a translucent ink wash (`bg-ink/5`), so they read right on any tinted surface
  - `IconButton` is the quiet icon (muted, ink on hover) and carries its label as a tooltip, with its `shortcut` beside it
  - Platform's `ui/button.tsx` with a patch
- `Tag` - status and category, square and tinted, in five status tones plus two for a Criterion's kind: `success` (Passed, Approved, Shipped), `danger` (Failed), `accent` (Running, Reviewing, Recommended), `warning` (Resurfaced, Possible regression, Out of date, behind), `neutral` on the `inset` fill (Pending, Detected, Dismissed, Resolved), and `teal` (Code check) and `purple` (LLM judge). Platform's `ui/tag.tsx`, patched for `success-ink` and `warning-ink` words and the two kind tones. `ResultTag` draws an Eval's Passed or Failed, and `NotRun` a result not yet run as muted words (`ui/result-tag.tsx`); `Count` is a grey Tag
- `Chip` - a linked record (Issue ID, Candidate, Eval, sha) in light blue-grey, mono only for ids and shas, with the record's icon (`KindIcon`) and a click when it opens one. A count that links from a table cell or a fact reads as a plain blue number, and a link inside a sentence stays a link; a link that stands alone as an action ("Eval run", "Open Trace", "Trace 4") is a quiet button
  - In `Markdown`, a plain link to an in-app record (an Issue, Candidate, Trace, Eval or run under `/<org>/agents/<agent>/`, absolute or relative) draws as its Chip and opens in the app, with an Issue's `StatusPill` or a run's `RunStatusTag` beside it (`RecordLink`, `parseRecordHref`); the body keeps a normal link, so platform draws it as one
- `Input` and `Textarea` (platform's), `Select`, `SearchField` - borderless grey fields (platform's `SearchField`, patched with `onKeyDown`, `controls` and `debounce` so it can drive a listbox as a combobox); a `Select` option with `separatorBefore` starts a group after a hairline; platform's `Field` and `FieldGroup` lay out settings and dialog forms
- `SegmentedControl` - platform's grey track whose pick slides, for switching views of the same content only (Inbox Board / List, Traces Production / Eval runs, Steps / Flow, Edit / Diff, the theme, the save dialog's target)
- One tab style: platform's underlined tabs (its `TAB` class in a bordered `nav`) for every set of page sections, on the Issue page, an Eval, Debug, Automations and Debug's open files; a tab row that holds the open tab's actions ends in `TabActionsEnd`. `SegmentedControl` only switches views of the same content, never page sections
- `Tooltip` (platform's Radix tooltip under the entry's one `TooltipProvider`, a dark box with 12px white words, a shortcut as `KeyHint` beside the label, Ask Pebble's as ⌘J), `Busy` (a thin grey ring), platform's `Skeleton` and our layout shapes on it (`ui/skeleton.tsx`), `ErrorView` and `RouteError`, `Steps` (grey check done, red x failed, spinner running) for the Issue stepper and Get started
- `Dropdown` and `MenuItem` (+ radio and label) - one compact menu of 28px one-line items; `Popover`
- Platform's `Modal` (its trigger optional) and `ConfirmDialog`, and our `ConfirmDialog` (`ui/confirm-dialog.tsx`, on platform's `Modal`) where a confirm needs a description line, a danger confirm, or `open` and `onClose` (Revoke, Delete agent, Dismiss, Approve, Save, Reset this demo) - compact, thin border and soft shadow, a 15px semibold title with a close x, Cancel as a secondary button and one primary at the bottom right
- The page shape and `Section` - one content column, so titles, tabs, tables and sections share one left edge
  - A page is the title row (a record's chip, the title, a pill for meaningful state, the actions), its meta line, then its sections, often led by a tab row whose `TabActionsEnd` holds the open tab's `TabActions`
  - Each list page opens with its title: Inbox, Traces, Grounded Evals, Automations, the Issue and Settings (`SettingsPage`)
  - A record page (a Trace, Eval, run or Automation) keeps platform's header: its title over one line of `Facts`
  - No page has a back row, since the page path in the header is the way back. Debug's Back to Issue (in `DebugBand`) is the one exception, as Debug is a focused page left with Esc
  - `Section` is a titled part (title, muted detail, actions)
- `TabActions` - an open tab's actions at its tab row's right end: Add Traces on Traces, Debug Evals on Evals, Compare and New Candidate on Candidates. A record opened inside a tab (a Candidate) puts its actions there too, so its own title row carries only the title, tags and verdict line; an outline button there draws as a grey one, since its border would run beside the tab row's rule. Debug's tab row has the same end, so Add Traces sits there too
- `Facts` and `Fact` - a record's facts, each a quiet label beside its value on one line; `Table`, `RowAction`, `RowActions`; `PageLink` and `PageButtons` for cursor pages; `EmptyState` (platform's one size); `Markdown` (platform's MDX, patched for record chips, `CodeBlock` from `ui/code-block.tsx` and a `className`) and `ApplyPrompt` (a tinted panel without inner lines); `CopyButton` (platform's, a 14px icon in a 28px button); `Kbd`, `KeyHint`; `Timestamp`; `Message`, `MessageContent`, `MessageFooter` and `Bubble` for a chat's turns; `FilePath`, `LineCounts`; `Collapsible` (platform's, patched for a row's `mark`), and `StepBullet`, `FoldMark` and `FOLD` in `ui/fold.tsx` (a transcript's bullet, the mark that turns into the chevron, and the fold motion); `FileRail`, `RailToggle`; `PaneSeparator`, `PaneMenu`, `PaneDropZones` and `usePaneDrag`; the marks (`GroundedMark`, `PebbleMark`)

Screens are platform's files in `src/platform`. Our organisms live in `src/features`, one folder per area, and platform's patches and forks call them; keep one of each:

- Issue header (the `routes/.../issues/$issue.tsx` fork) - no back row (the page path is the way back): the Issue `Chip`, the title, a `StatusPill` only for a second look and a quiet Resolved or Dismissed tag, the state's actions at the top right, then one line with `IssueStepper` on the left and the inline Facts on the right
- `IssueStepper` - Validate, Review, Deploy from platform state; each step is a link to where it's decided (`StepLink`: Validate the Overview, Review the Candidates tab, Deploy the approved Candidate or else the Candidates tab, a resolved Issue's Activity) once the Issue can reach it, and changes nothing; its meaning is its tooltip, with a small Ask Pebble mark beside the current step (which only fills the prompt, its tooltip the step's question); Debug shows its band instead of the stepper; the same glyphs (`ProgressMark`, `StateMark`) mark each state on the Inbox's lanes, the List and the State fact, tinted in the mark alone
- `CandidateResultTags` (platform's `candidate-results.tsx`, patched) - "3/3 New", "10/12 Existing", regressions in red with their names, Out of date, `NotRun` or Running, each opening its run
- `ApproveButton`, `RemoveApprovalButton` - commit-style confirmations (Candidate, head sha, test merge sha, results); in review Approve opens its dialog and `canApprove` alone enables "Approve <sha>", and outside review it doesn't show
- `CandidateCompare` - two pickers, results, the Evals that differ ("Show N with the same result"), then the files that differ side by side
- `DebugBand` (`features/debug/debug-band.tsx`), `BranchSwitcher` (`features/candidates/branches.tsx`), `SaveCandidateDialog`, `FileEditor` (`features/debug/file-editor.tsx`, which platform's fork renders), `CandidateGrades` and `BaselineGrades` (`eval-grades.tsx`), with platform's `DebugViews` (see Debug below)
- `CriteriaList` and `EvalPrompt` (`features/evals`, an Eval's Definition) - the User prompt as written on a `bg-subtle` panel under `Clamp`; then one bordered card, a row per Criterion with no rules between: its description as the title (the rest below only when it adds words, the registry name in the tooltip or as a muted mono line when there's no description), then its scale as a neutral tag ("Pass or fail", "1 to 5", "3 levels" with the levels in the tooltip) and its kind Tag
- `TraceTimeline`, `TraceTurns`, `GradeRow` - the session page, a Grade's trials opened in Debug's Grades tab, and Compare columns
  - Each turn reads down a spine (`RailNode`): 24px nodes for the user, the work and the answer on a thin `divider` line, content indented 16px beside them, a failing part's node red on `danger-tint`; the Agent's narration between steps in ink, code on `bg-subtle` panels
  - The session page reads like Claude Code's transcript, turns split by dividers (no cards): the user's words in a grey block, one folded "Worked for" line, the Agent's answer as Markdown beside an ink bullet
  - A turn's header is its scan line: "Turn 3" in `type-heading-15`, a red Failed tag, the question as one muted line while closed, the time, the tool calls as a neutral `Tag` ("44 tool calls", a red "1 failed" beside it) and the Spans quiet button at the right
  - Only the first turn opens; the rest show their header, and a turn opens when a jump, a citation chip, a `?step=` link, a Flow pill or a timeline bar lands in it; Expand all and Collapse all are a grey button at the top; past 20 turns a run of 4 or more closed, passing turns folds into "Turns 4 to 11, 8 turns"
  - "Worked for 5s" carries the same pills and names no tools; steps are bullet lines (grey, red when errored or a failing Grade marks them) that turn into the chevron on hover or open, one compact row per call that opens in one click: a call is bare `Tool(argument)` with its time at the right, a failed one keeps one short red error line, and repeated calls stay one line each; hovering a step shows an icon button that opens the Spans page on its span (`?span=`)
  - A call opens to Input then Output under their labels: a flat Input as labeled fields and any other Input as JSON on a `bg-subtle` code panel, an Output in words as Markdown and a JSON Output indented on the panel, both under Show more, an error in red
  - Replies render as Markdown with `[cit_…]` markers as small numbered `Chip`s (`ui/citation.tsx`): the quote in the tooltip, and a click opens the tool call that returned it
  - A failing Grade's reasoning shows once, under the step it points at, for Eval Grades and a production outcome that says why alike; there is no Grades list above the turns, and Ask Pebble sits beside the failing-step jumps
  - The Trace is neutral: steps are told apart by icon and type, and red (failures) is the only color besides the Outcome tag; no hues per kind, a passing Grade's check grey, in-page jumps as quiet buttons
  - `LayeredTimeline` (`layered-timeline.tsx`, which the Spans page can reuse) lays the spans out by time with one row per depth (the Agent, then its model and tool calls, then a subagent's own), each turn after the one before with pauses left out; every kind is grey with its icon and duration on hover, only failures red, and a click opens that step; `FailingJumps` (in Steps and Flow) steps through failing steps, which flash (`animate-flash`); folds open with `animate-expand`, and a fold row's focus ring draws inside, keyboard only
  - Every Trace shape holds up: 40 steps per opened turn then Show N more (failures always shown), `Clamp` folds a long message, answer or payload under a fade with Show more, payloads show 200 lines then Show all and wrap
  - The Trace page's facts are label and tag on one line: Session as a code `Chip` with Copy, Outcome as its tag with any other failing criteria as red tags beside it, Time as words, Duration and Tokens ("5.8M in, 19K out") as neutral tags
  - `TraceTimeline` stays for Compare's columns; a step a failing Grade points at shows the Criterion in red and its reasoning on a red tint
- `SpansPage` (`features/traces/spans.tsx`, the Spans route) - the layered timeline on top, then the span tree (bordered, scrolling on its own, 28px rows indented 24px per level) beside the selected span's details, stacked in a narrow pane; `?span=` selects, the root by default. Details: Time and Duration as facts, a Failed tag only when it errored, the messages as a conversation, the span's Grades, and attributes grouped by namespace on `bg-subtle` panels under a search
- `TraceFlow` - the session page's Flow view (Steps / Flow segments, `?view=flow`): a lane per message type that the session uses (User, Reasoning, Tool calls, Agent) under a sticky lane header, 28px nodes joined by `divider-strong` elbow edges, a row per turn with Spans
  - Lanes spread edge to edge with nodes up to 15rem; below that nodes keep 10rem and lanes overlap as a staircase, so names stay readable at 1024 with Pebble open
  - User nodes sit on `fill`, the rest bordered on the surface; failing nodes carry the red x on `danger-tint` with the failing Grade's note under them; the open node takes `selection` and an accent border
  - A click opens the step's detail in place below it (input and output, or its words, then the failing Grades) with Show in Steps; more than 4 steps in a row on one lane fold to "N more"
- `TrialCompare` - the trials counted as tags (neutral total with its tooltip, green passed, red failed), then 2 trials: each timeline row opens with its picker, and a `trace-1` or `trace-2` dot marks the picker and the column header
- The record tables are platform's: `SessionTable` (`session-table.tsx`), `RunTable` (`automations.tsx`), `EvalTable` (`evals.tsx`) and `IssueTraceTable` (`issue-traces.tsx`), plus the Candidates tab's table in its route (see Tables)
- `Pebble`, `ActiveChat`, `ThreadPicker`, `Conversation`, `Composer` - platform's chat as platform draws it (its 40px dock header, welcome, picker rows, composer, `Trace` work lines, status line and pane), with only Krish's keepers on top: the full-height side pane, the side-to-main flow, Read and action chips, @mentions and drafts
  - Each answer's work is platform's: a shimmering Thinking or the running call while Pebble works, then "Worked for 6s" with its step count, opening to Thought, Ran, Read, Edited and Wrote rows; the records the question read lead as a Read row of chips, and each chip the engineer ran follows in the past tense
  - The composer is platform's, with the @ control first in the row the model picker sits in (the picker hides while the Org has no models) and the sandbox status at the row's end: asleep, waking, ready for 5 seconds, going to sleep or couldn't wake
  - `ConversationSkeleton` holds a question and answer's shape while chats load

## Layout

- No dangling text
  - Every clickable thing is a real button or link with a background on hover, one of the five `Button` variants, a `Chip`, a tab, or a row that opens; never bare words or a blue text link acting as a button
  - One value per table cell and per fact (see Dense information)
  - Lines truncate cleanly with an ellipsis, and nothing wraps under an icon
- Alignment - every page has one left and right edge, so the title, tabs, tables and section headers line up and no table or section gets its own indent
- No lines within lines - a region gets one structural line at most, and everything inside it separates by spacing, indentation or a background tint, never another rule; nested content indents, and rows in a bordered panel separate by spacing
  - One border level: no cards in cards and no table box inside a bordered panel; a bordered panel may split its header from its body with one hairline, as a table's header does
  - Rows inside a bordered panel separate by spacing and a soft hover, never a divider; only sections that each open into a body of their own (the files of a diff) take one hairline between them
  - Outside a border, rows separate with spacing or one hairline, never both
  - Nesting reads by indentation (24px per level), never by a vertical rule per level; the only vertical line on a page is a structural spine such as a Trace's turn spine
  - Code and payloads sit on a `bg-subtle` panel without a border; a tint, not a frame, sets them apart
  - Before adding a border, remove one: if two lines would run parallel or meet at a corner within 16px, one of them goes
- Pills - two kinds only, `Tag` for status and category and `Chip` for linked records
- Records - no subtitle lines under titles, facts as quiet labels beside their values on one meta line, short status as a `Tag`
- Forms - settings follow Vercel, Linear and GitHub through `FieldGroup` and `Field`: 16px `type-heading-15` group titles parted by space alone, no outer card, no footer bar, a pick saves at once
- Actions - one black primary per view, for the decision in front of the engineer; a second choice is `outline`, the rest `secondary` or `quiet`
  - The Issue header shows only the current phase's actions (`IssueActions` in the Issue route, Krish's cleaner Issue page): one primary for the step, Dismiss `secondary`, and one `secondary` undo icon that steps back a phase
    - Validate - Validate (primary) and Dismiss, with no Approve on its Candidates
    - Review - Review Candidates (primary), which opens the Candidates tab, Dismiss and Move back to Detected as the undo; Approve and Debug never show in the Issue header, only on a Candidate's page and in Debug's header
    - Run Evals and Rerun Evals never show in the Issue header, only on a Candidate's page and in Debug's header, one per page
    - Deploy - Mark as shipped (primary), Dismiss and Remove approval as the undo; while the approval is out of date, Mark as shipped is disabled with that reason and the Candidate's page offers Approve (outline) again
    - Dismissed - Reopen and Move back to Detected as the undo; Resolved has none
    - The Candidates tab and a Candidate's page hide Review Candidates, since the Candidate's own actions are the choice there
    - The Inbox peek has no state actions, only Open Issue as its primary
  - On the Candidate page Approve is the primary while nothing is approved and Debug a second choice, both in the tab row; in Debug's header Approve is outline; Save is the primary on Debug's Files
  - Every other rare action is its own icon button with a tooltip, and rows have no "..." menus (a chat row shows Rename and Archive icons)
- Issue page - header, stepper and Facts on one line, then route tabs in the work's order, Overview, Candidates, Evals, Traces, Activity, each shown only where the phase works in it (Validate shows Overview, Traces and Activity, Review and Deploy all 5, a closed Issue the tabs with something in them, and the open tab always); a Candidate opens inside the Candidates tab with its actions in the tab row
  - The Overview is the issue.mdx prose at reading width, then 32px below it `IssueAtAGlance` (`features/issue/at-a-glance.tsx`), one question per phase in bordered cards, three columns from 42rem of container, a card on a tab opening it (title and `Count`, a chevron at the right) over label and value rows with no lines between them. Validate asks whether the Issue matters: Traces (newest, the clearest Trace as a Chip) and Impact (days seen, the busiest day, sessions when Traces share one), no Candidates or Evals. Review leads with a two-column Candidates card (up to 3 Candidates as Chips with their status tags, and when none passes, one Debug button), then Evals (the lead's New and Existing tallies, grey with a check, red with an x when one fails), then Traces; Deploy lists the approved Candidate alone; neutral by default, red only for failures
- Debug is a focused page, never a trap
  - A tinted `bg-accent-tint` band on top (`DebugBand`): Debugging, the Issue's id and title, and Back to Issue (also Esc, to the Candidate or the Evals tab); then one header row: the Candidate's title (or Evals) with the branch switcher (the branch's tag naming its head commit), then its status tag, its Eval counts opening the proofs, Sync, Rerun and Approve (or the baseline's status, Eval run and New Eval)
  - Files, Grades and Traces as platform's underlined route tabs (`?view=`); Files stays mounted so unsaved edits survive a switch. Nothing docks under the editor: clutter is the thing to prevent, so a second surface is a tab, and a record with its own page links there
  - Files is the Editor at full height (file tree rail, the Fix, Evals or Overview tab and the open file as underlined tabs, Edit / Diff, Revert, "N unsaved", Save); Grades lists the newest run's Grades, failing first, with Eval run beside the tabs opening the run's own page
  - ⌘S saves while there are unsaved edits, and the palette finds a file by name
- Shell - the sidebar (platform's organization switcher, then the Agent switcher, Search, Inbox, Traces, Grounded Evals, Automations, Agent settings, then Chats, Ask Pebble at the bottom), then two panes: the page under its header (page path, layout menu, Org settings; the theme switches from ⌘K and Settings, as in platform) and Pebble as a whole pane, top to bottom, docked left or right
  - On an Issue and its Debug pages the sidebar starts as a 48px icon rail (each icon's name in a tooltip on its right, Chats hidden); its toggle, beside the organization or first in the rail, collapses it on any page and expands it for that Issue
  - The sidebar keeps the active Agent and its pages on every page; Chats lists titles with their times, most recently used first and not grouped by day, the open chat's row filled and Pebble's mark pulsing in place of its time while it answers there (Search chats folding open with its field focused, New chat, Rename and Archive on hover or focus, Rename editing the title in place, skeleton rows while loading), each opening the main view; Ask Pebble shows ⌘J
  - Each pane's header has a layout menu (Move to left or right, Make primary, and Open in main view for Pebble) and drags onto three drop zones; either pane narrows to 384px
  - A click in the side chat outside its controls, its Open in main view icon or a sidebar chat opens the chat in the main view (`/chat/<thread>`, the chat's title in the page path, Open in side panel and Close in the page header), the same chat in a reading column; any other page puts it back at the side, and only the chat animates between them
  - The side panel slides in from its edge and out to it (a view transition of the chat alone, skipped under reduced motion); dragging the separator to the page's far edge opens the main view, and its hit area is 16px
  - Full screen hides the sidebar on any page; Esc leaves it before Debug's Back
- Automations - route tabs Overview, Running and All runs; schedules and triggers as short neutral tags ("Every 12h", "Weekdays 09:00", "Push to main") with platform's full words in the tooltip, and run times as the time for a run today and the day for an older one ("02:10", "Oct 14") with the exact moment in the tooltip (`ui/short-timestamp.tsx`, also on a board card)
- Loading keeps the previous view, prefetches on hover, and shows a skeleton only after about 300ms (see States)
- At 1024px the primary label, file rails and tool headers stay usable and bodies scroll

### States

Every screen and every read inside one has a loading, an empty and a failed look, and each reads differently from the others.

- Loading is a skeleton in the real layout's shape, so nothing moves when the data arrives. Each area's route skeletons live in `features/<area>/skeletons.tsx` and reach platform's routes through `app/route-skeletons.ts` ([frontend-engineering](../frontend-engineering/SKILL.md) has how), built from `PageSkeleton` (the title's words when the page names itself, its actions, meta line and tabs), `TableSkeleton`, `LinesSkeleton`, `FactsSkeleton`, `FieldsSkeleton` and `ControlSkeleton`, and an in-page read or a lazy view (`Suspense`) uses the same shapes; never "Loading…" words or an empty box
  - Skeletons are quiet grey `fill` blocks that pulse only with motion allowed, follow no lines within lines, and announce themselves once (`role="status"`, "Loading Inbox")
  - Route skeletons load with the first page, so they import little beyond platform's `ui/skeleton` and our shapes in `ui/skeleton` and stay small
  - A tab's skeleton puts its actions' placeholders at the tab row's end through `TabActions`, as the tab does
  - A route whose loader reruns from an in-page control (Traces' search and filters, Debug's tabs, which hold unsaved edits, Models' usage range) keeps its previous view on a search change and shows its skeleton only on arrival
- Empty is an `EmptyState`: what's missing in a short title, then the one next step or where the record comes from ("Candidates show here once a fix is proposed for this Issue."), with at most one action; a filtered list offers Clear filters. Platform's words win where platform has the state
- Failed is an `ErrorView`: a red mark, what didn't load ("This page could not load", "These Grades could not load"), the reason, and Retry, which reloads the page's loaders or refetches the read; every route uses it as the router's error view, and a failed read never pulses forever as loading; a record the link names that isn't there reads "This page doesn't exist" with "Nothing matches this link", never the repository path behind it
- Disabled says why: a control that can't act now carries its reason in a tooltip (through a span, since a disabled button takes no pointer), as Approve, Debug Evals and Debug's Save do; a control that is only busy for a moment needs none

### Dense information

Facts, a confirmation's rows, table cells and meta lines use one hierarchy of three styles, so a record reads the same everywhere.

- Label - `type-meta-12 font-medium text-muted`, beside its value at regular weight (`Fact`) or in a fixed column (Approve's rows); a group's day or title in a list may be `type-label-13 font-medium text-muted`
- Value - `type-label-13 text-ink`, `tabular-nums` for numbers and times, ids as a `Chip`, status as a `Tag`
- Secondary - `text-muted` at the row's own size, so a row keeps one baseline and color carries the step down (a job's name after its title, a duration, a count, a time); `type-meta-12 text-muted` only for a line of its own (the page path, a pager's count, a hint under a field, an empty state's reason, a card's meta line)
- One value per table cell and per fact: a number, a tag or chip, a status word or a short name. Never a sentence, a list joined with commas or a dot, or words wrapped around numbers; a list is one tag or chip each, and a compound number is one number with its parts in a `Tooltip` (Tokens show `94K` with `93K in, 882 out` on hover). No "·" separators anywhere in the UI

### Tables

- One look for every table: a 36px header on the surface (13px semibold ink labels, one hairline), then 36px single-line rows with no lines between them, and a soft hover on a row that opens something
- Platform's tables (Traces, an Issue's Traces, Evals, Runs, Automations, Candidates, Settings' short lists) draw it with platform's `record-table` class inside one `card`. A row's `row-action` link opens it from anywhere on the row, and its row actions show on hover. They keep platform's columns and don't sort; a patch only names a table where Walkthroughs point at it, and marks a low-priority column's header and cells `@max-2xl:hidden` (below 42rem) or `@max-lg:hidden` (below 32rem) so a narrow table never clips, its card being the size container (`global-demo.css`)
- Our `Table` (`ui/table.tsx`) draws the same look with sortable headers and column kinds, for the Inbox's List and Compare. It frames itself in one `card` with 12px cells, and `inCard` drops the frame inside a section with 16px cells
- Every `Table` header sorts by the column's `sort`, or its cell when that is plain text or a number
- Each column has a kind that fixes its look and width range, enforced in `Table` so no page sets widths
  - `primary` - the name, message or title in plain ink; it takes the spare width and truncates
  - `status` - one tag, never cut in a narrow table; `tags` - a few tags; `id` - a `Chip`
  - `number` - a measure or count, right and muted; `time` - quiet and right, in the last column
  - `text` - muted words, rare; `actions` and `control` - row actions and an always-there control
- Text, tags and chips sit left; numbers and times sit right and together at the end
- In a narrow table `drop: 1` columns hide below 48rem and `drop: 2` below 32rem, never by viewport
- No second line in a row, and no column that is empty on every row on the page

### Candidates and branches

Adopted from Xinyi's work trial (Oct 8-9): a Candidate reads as a verdict backed by four proofs, and each branch has its own color.

- Verdict - one tag per Candidate from platform's results and the Issue's state (`features/candidates/verdict.ts`, Krish's platform PR 4): Ready to approve, Approved (the Issue's current approval is this Candidate's), Doesn't fix yet, Regresses, Running, Run failed, Out of date, Not run, and Not shipped for a Candidate still open on a resolved or dismissed Issue; red for Doesn't fix yet, Regresses and Run failed, the rest neutral
  - It shows as a plain tag on the Candidates table's Status column, the Candidate page, Compare's summaries and Debug's header; the New and Existing counts beside it (the table's Evals column) open the popover with the proofs and "Since the previous revision" (Evals fixed and newly failing), so the results show once
  - Reproduction: New Evals fail on the baseline (Baseline run). Fix: New Evals pass on this Candidate (Eval run). Regression safety: Existing Evals keep passing, failing on regressions only (Eval run). Coverage: every Eval ran on the current test merge (Eval run)
  - Each proof is one row: a check, x, dashed circle (not shown yet) or spinner, its name and claim, a note in the status color when it doesn't hold, the count at the right in the status color and its evidence link under it
  - Order: Not shipped, Not run, Running, Out of date, Run failed, Doesn't fix yet, Regresses, else Approved when the Issue approved these results and Ready to approve otherwise. The proofs are the popover's evidence and don't change the tag, and Approve shows only beside Ready to approve
- Approve shows only beside Ready to approve and opens its confirmation while the Issue is in review: the verdict and proofs first, each failing proof with its fix in place (Rerun Evals, Debug, Debug Evals), then the Candidate, branch, test merge, what it replaces, and Sync when main is ahead. Platform's `canApprove` still enables "Approve <sha>", and outside review Approve doesn't show (a detected Issue shows only Validate and Dismiss)
- Branches - `branch-1..6` (rose, slate, sage, clay, mauve, ochre; words at AA on their `-tint`, 16% washes in dark) only for a Candidate's branch, always with the `GitBranch` icon and the name, never for status
  - A Candidate keeps its color by the order its pull request opened; the evals branch is a neutral `inset` tag
  - `CandidateBranch` is a 20px tinted pill in `type-mono-12` naming the head commit (the Candidate's name in the Approve dialog and Save), the full ref in its tooltip, on the Candidate page, Compare, Debug's switcher, the Approve dialog and Save; `BranchSwatch` is the 8px dot for the Candidates table, lists and fields
- Debug's branch switcher sits after the title: the branch tag and a chevron, opening the Issue's Candidates (swatch, title, verdict), Evals (Debug Evals) and New Candidate, which names a branch off this one as Save's New Candidate does
- Save's name field carries the new branch's swatch, and its Branches from or Commits onto line names this Candidate's branch as a tag

## Copy

Follow [doc-writing](../doc-writing/SKILL.md) for wording, record names and Pebble's voice. Platform's words win for behavior; we keep the calm tone.

- Product words only (Issue, Trace, Eval, Criterion, Grade, Candidate, Fix, Eval run, Activity, Pebble, Grounded Evals, New Evals, Existing, Automations)
- Issue overview (never "Issue document") and Activity (never History) on screen; where platform names a column or fact, its word wins
- A Criterion and a Grade read by their description, with the registry name in the tooltip (the name's last part when there's no description)
- An empty state gives one reason and at most one action, and loading, empty, failed, stopped and stale each look different

## Checks

- Look at touched screens in light and dark at 1440x900, 1280x800 and 1024, with long names, large counts, empty lists, failed runs, out-of-date results and Pebble disconnected
- Measure alignment (the left x of title, tables and section headers with `getBoundingClientRect`) and compare every tag kind in dark
- Every route loads with zero console errors, and reload and Back keep the URL state
- Report what you saw and what you could not check
