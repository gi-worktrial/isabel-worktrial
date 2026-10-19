# Product experience

Krish's source of truth for the product, first copied from Notion on Oct 6 2026 and rewritten on Oct 14 after the platform parity work. Platform's `web/` decides data, rules, flows and words; demo-product keeps Krish's look and tone + a few additions he asked for ([Plan](plan.md) has the decisions, [Changes](changes.md) every change and its reason).

## Overview

This doc is our source of truth for the product (i.e. the core flows, the layout, what runs under the hood). Examples use Ask Ramp, Ramp's finance Agent.

## Problem

Please look through the Product vision doc (Notion) to understand what we're building first.
In summary, teams can get an Agent to ~90% quality fast - but each extra nine of reliability still means engineers read Traces, write Evals, and tune the harness by hand.
These are the main problems we hear on customer calls (and run into ourselves):

- Traces can reach O(10M) monthly - too many for engineers or coding agents to read by hand
- Evals take a lot of time + craft to build
- Harness changes are risky to test in production (need some testing beforehand)
- Coding agents can fix one failure but often break something else ("whack-a-mole")

## Solution

Our goal is to continuously improve a customer's production Agent:
Production Traces → Issues → Evals → Candidates → deployment → new Traces
Grounded groups the Agent's failing Traces into Issues. Overnight, Pebble writes Evals + usually one Candidate for each Issue (more only for real tradeoffs, none when nothing works) - so engineers can go from an Issue to a merged Fix as fast as possible. Issue → Fix time is our main metric.
Each Issue then goes through 3 stages:

1. Validate - engineers confirm the failure is real + worth fixing
2. Review - they compare Pebble's Candidates + their Eval runs (or Debug one when none is good enough)
3. Deploy - they apply the approved Fix to their Agent + click Mark as shipped

Pebble (our own agent) works beside them the whole way. Mark as shipped merges the Fix + the Issue's New Evals into main - so later Fixes can't quietly bring the failure back. If the failure comes back, Grounded reopens the Issue.

## Scope

Here is how we think about scope:

- We work backward from what customers care about (instead of up from our infra)
- Then we check what platform can support in the time we have
- Each release should also show why we're different from coding agents like Claude Code + dashboards like Braintrust

Our first release has all flows except onboarding (e.g. Happy path, Debug Fix, Resurfaced, and Automations). We onboard each design partner by hand and dogfood the product for 1 week before any of them uses it.

Later:

- Onboarding
- First-class LangSmith + Braintrust connectors (Grounded ingests their Traces and Evals into our formats)
- Signals beyond LLM Traces (e.g. product analytics or support tickets) + Trace transforms
- Repo access - Fixes open as PRs on the customer's own repo
- Other modes (i.e. Pebble CLI, coding agent skills, and Slack) on the same primitives

## UX principles

Inspiration (Notion)
Every screen follows 5 principles:

1. Defaults
   - Each stage opens with Grounded's recommendation + one primary action (Pebble marks one Candidate Recommended)
   - Engineers accept the default in one click + change it only when they want to
2. Simple with extreme capability
   - Screens show the few things that matter + the rest sits one click away (e.g. tags carry status so rows read at a glance)
   - Every screen reuses the same few primitives (infra terms like Harbor stay out of the product)
3. Flexibility
   - Engineers stay in control - they can open, edit, or override anything
   - Pebble never acts without a click (its overnight work shows in each Issue's Activity)
4. Sell work over tools
   - Grounded sits between Braintrust and Codex - it does the work (i.e. finds Issues, writes Candidates, and runs Evals) + keeps the tools in reach
   - Screens lead with finished work to review instead of empty tools to configure
5. Design for learning
   - Each screen teaches engineers something about their Agent (evidence sits next to every claim)
   - A failure reads in 3 layers - the raw Trace, the step where it failed, and why (the Grade's reasoning)

Our design system follows Airtable's kit + lives in our grounded-design skill:

- Type is SF Pro through the system stack (Geist only as the fallback)
- Buttons are flat - one black primary per view (white in dark), a grey default, and an outline button for a second choice
- Blue only marks links, selection, and live states
- Status reads as square tinted tags + linked records as light blue-grey chips
- Compared trials keep one color each (blue, orange)
- Light is the default + dark is true black with cyan accents (only the theme switch in ⌘K or Settings turns on dark)
- Platform's time formats everywhere - 24-hour in the viewer's time zone with no relative ages (e.g. "Oct 01 14:05", a day as "Thu, Oct 1, 2026" + durations like "6.00 s")
- Figma (file Ehq3tczqsfQb0ElDb5xgeE) - the Grounded page has our tokens + screens and the Components page has the Airtable kit

## Primitives

We build the product on a small set of primitives - everything else in the UI is a view of them. Each Org (one customer company) can have many Agents. Every other primitive belongs to a single Agent.

- Agent - a customer's production agent (e.g. Ask Ramp) with its own repo (`agent/agent.py` is its Replica)
- Replica - our runnable copy of the Agent (so Evals + Fixes never touch production)
- Trace - one turn of a production conversation; a conversation is a session
  - Annotations are judgments on a Trace from a job, a judge, or an engineer (e.g. "Over budget" or an Issue match)
- Issue - a group of Traces that fail in the same way
- Eval - a Harbor task that replays a failure on the Replica + grades the answer
  - Engineers read it as a User prompt + Criteria
  - New Evals prove one Issue's failure and live on its evals branch until it ships
  - Grounded Evals are every Eval on main, which every Fix must keep passing (results call them Existing)
- Criterion - one rule an Eval checks, as a Code check or an LLM judge, on a scale ("Pass or fail", "1 to 5", or named levels)
- Grade - one Criterion's result on one trial, with the judge's reasoning
- Candidate - one proposed Fix on its own branch + its Eval runs
- Fix - a Candidate's code change (what engineers approve + apply to their Agent)
- Eval run - one run of the `grounded/run-evals` job, one trial per Eval
- Activity - what happened to an Issue, who did it, and when (one row per commit to its `issue.mdx`)
- Automation - a job Grounded runs for the Agent on a schedule, a push, or a pull request (e.g. Trace annotation nightly)
- Pebble - our own agent that works beside every screen (and does our overnight work)

## Issue states

Each Issue is in one of 4 states (each change is a commit, so it shows in Activity):

- Detected - every new Issue starts here until someone validates it
- Reviewing - engineers are working on it
- Resolved - engineers clicked Mark as shipped (its Fix is merged into main)
- Dismissed - engineers dismissed it with a reason

Engineers can step back - Move back to Detected (in Review) takes back a Validate, Reopen moves a Dismissed Issue to Reviewing, and Remove approval takes back an Approve. Only Grounded reopens a Resolved Issue.
Each Issue also shows at most one of 4 pills:

- Running - a job is queued or running on one of its branches
- Pending - the engineer is next
- Resurfaced - it's back in Reviewing after its Fix shipped
- Possible regression - it's Resolved + has an open pull request labeled `regression`

## Flows

Every Issue follows the same base flow:
Validate → Review/Debug → Deploy
On the happy path, engineers click through all 3 stages. In Review, they enter Debug when they don't like a Fix or the Evals behind it. Grounded has 7 main flows:

- Daily loop - Grounded fills the Inbox overnight
  Trace mining runs as 4 Automations in order (engineers can see each run in Automations):
  1. Trace annotation (`annotate-traces`) - grades a sample of new Traces against the general Criteria + writes Annotations like "Over budget"
  2. Issue matching (`grounded/match-issues`) - reruns each Issue's `match.sh` + writes each match as a `grounded/issue/<id>` Annotation
  3. Issue mining (`mine-issues`) - Pebble commits new Issues + pushes their Evals and Candidates (it also reopens an Issue that came back)
     - Pebble links Evals that already reproduce each Issue + writes New Evals for the rest
     - It often writes just one Candidate + marks one Recommended with a one-line reason when there are several
     - It leaves notes on what it tried when nothing works
  4. Eval runs (`grounded/run-evals`) - each push to an evals branch runs a baseline + each Candidate pull request runs on a test merge to compare against it
     In the morning, engineers open the Inbox and start with the Issue that matters most.
- Happy path - Validate → Review → Deploy without reading individual Traces
  1. Validate - engineers confirm the failure is real + worth fixing
     - They read the Facts, the Overview, and the Traces tab + can ask Pebble whether it matters
     - Validate is the header's primary + Dismiss sits beside it as the alternative
  2. Review - engineers pick a Candidate + decide whether they trust its Eval runs
     - The Candidates tab lists each Candidate with its branch color, its verdict (Ready to approve, Doesn't fix yet, Regresses, Running, Run failed, Out of date, Not run, or Not shipped once the Issue is closed) and its results ("3/3 New", "10/12 Existing", regressions in red)
     - The verdict opens its 4 proofs, each with a count and its run: Reproduction (New Evals fail on the baseline), Fix (they pass on the Candidate), Regression safety (Existing Evals keep passing) and Coverage (every Eval ran on the current test merge)
     - A Candidate's page has its rationale, Apply prompt, and a diff per changed file
     - Approve asks first like a pull request approval (the verdict and its proofs, the head and test merge shas, and the Candidate it replaces)
     - A proof that doesn't hold has its fix in place (Rerun Evals, Debug, Debug Evals), and "Approve <sha>" stays disabled until its Evals ran clean on the current test merge
     - A later push shows "Approved revision is out of date"
     - When results go out of date, Rerun Evals in the Issue header reruns each of them + Sync merges main into the evals branch when it's behind
  3. Deploy - engineers apply the approved Fix to their own Agent
     - They copy the Apply prompt into their own codebase (we can't open PRs on a customer's repo yet)
     - Mark as shipped confirms, then merges the Candidate + the Issue's Evals into main and resolves the Issue
     - Nothing changes in their production Agent until they apply the Fix - next-day Traces show whether it worked
- Debug Fix - engineers edit the code when no Candidate is good enough
  - Debug opens from a Candidate as a focused page with Files, Grades, and Traces tabs (Pebble stays docked beside it, and the sidebar starts as an icon rail)
  - Files is the Editor at full height (a file tree marking changed files beside the open file), and Grades is its own tab for the newest run, failing Evals first, with Eval run opening the run's page
  - Each Grade shows its Criteria at once + a click on the row opens the trial's full Trace; a failing one shows Ask Pebble on hover
  - Edit / Diff switches to every changed file side by side (unsaved edits included) + Revert drops one file's edits
  - Save asks where to save - a named New Candidate branched from this one (the default) or This Candidate - and always runs its Evals
  - New Candidate on the Candidates tab starts an empty one + opens Debug on it
  - The branch switcher in Debug's header jumps between the Issue's Candidates (each with its color and verdict) and the evals branch, and New Candidate there branches a named one off the Candidate in view
- Debug Evals - engineers fix an Eval that checks the wrong thing
  - Same workspace as Debug Fix, opened on the Issue's evals branch with its baseline run
  - Each save commits to the evals branch + reruns the baseline; Candidates keep their results and show them as out of date
  - New Eval asks Pebble to write a missing Eval
- Dismiss - engineers drop an Issue when it isn't worth fixing
  - Dismiss asks for one short reason (e.g. "Fixed in our next release") + the Facts show it as "Dismissed because"
  - New matches still join a Dismissed Issue (so Issue mining doesn't open it again)
- Resurfaced - engineers fix a failure that came back after its Fix went live
  - Issue mining finds new failing Traces + reopens the Issue in Reviewing with the Resurfaced pill
  - A suspected regression opens a pull request labeled `regression` + shows Possible regression until then
  - From there it's the happy path again (Approve → Deploy)
- Automations - engineers check what Grounded ran
  - Overview lists each Automation with its schedule, last result, and last run + Run now
  - Running shows live runs with their step + All runs is every run, 30 to a page
  - Each run opens to its trigger, ref, steps with their logs, and an Eval run's trials

## Layout

Everything in the app is scoped to the Agent picked in the sidebar, which stays picked on Settings and chats. Each tab, record and chat has its own URL.

### Navigation

The sidebar has platform's organization switcher, the Agent switcher, Search (⌘K), then Inbox, Traces, Grounded Evals, Automations, and Agent settings, then Chats, with Ask Pebble at the bottom. The sidebar's toggle sits beside the organization (first in the icon rail). The page's header shows the page path, the layout menu, and Org settings. The theme switches from ⌘K or Settings, as platform's header has no toggle.

- Inbox - a Board of Issues in 4 lanes (i.e. Detected, Reviewing, Resolved, and Dismissed) or a List, with a search
  - Each lane's header and the List's State carry the state's mark, the stepper's glyphs (a dashed ring Detected, a ring with a dot Reviewing, a check Resolved, a slashed ring Dismissed)
  - Each card shows its severity and ID, last seen as the time today or the day before, title, Trace count beside the Traces icon, and pill
  - A click on a card or List row opens its peek beside them: the ID, title, stepper, the overview in full, and Open Issue, which stays in view as the overview scrolls; Esc or the close button closes it, and Cmd-click or a middle click opens the Issue page
  - The List sorts by any column (Issue, State, Traces, and Last seen)
- Grounded Evals - every Eval on main with its result, last passed, Issues, and Criteria (failing first), with a Running tag while an Eval run is live
- Traces - every session for the Agent, production or Eval runs
- Automations - the jobs Grounded runs for the Agent
- Agent settings - Connections (the repository), API keys for tracing, and Delete agent
- Chats - your Pebble chats across every Agent, most recently used first, with search (it focuses on open and Esc closes it), New chat, Rename, and Archive; each opens in the main view

A few shortcuts work everywhere (Cmd+/ lists them):

- Cmd+K - go to a page, Issue or Agent (pages, the other Agents, Pebble, the theme and the shortcut list; Issues once you type), then the demo's Walkthroughs and Reset demo, and in Debug the editor's files by path once you type; any typed words also offer Search Traces for them
- Cmd+J opens or closes Pebble, and works while typing too
- In Debug, Cmd+S in the editor saves while there are unsaved edits

### Issue page

Each Issue opens into its own page. Investigations usually spread across tabs + tools - so we keep all of an Issue's work in one place.
No page has a back row - the page path in the header is the way back.
From top to bottom:

- Header - the Issue ID, title, and pill, with only the current phase's actions at the top right (one primary at most)
  - Every phase has one primary, Dismiss is a grey button, and the undo is a grey icon that steps back one phase
  - Validate - Validate
  - Review - Review Candidates opens the Candidates tab, and Move back to Detected is the undo
    - Approve and Debug live on a Candidate's page, so the Candidates tab and a Candidate's page hide Review Candidates
  - Deploy - Mark as shipped once the approval is current, with Remove approval as the undo
    - While the approval is out of date, Mark as shipped is disabled with that reason, and Approve (outline) approves the Candidate again
  - Dismissed - Reopen only; Resolved has no actions, since only Grounded reopens it
- Phases + Facts on one line under the header
  - Phases - Validate, Review, and Deploy, each done, current, or upcoming, easing forward as the Issue moves; each step's meaning is its tooltip, and a small Ask Pebble mark beside the current one fills Pebble's prompt with a question about that step and never sends it
  - Each phase opens where it's decided - Validate the Overview, Review the Candidates tab, and Deploy the approved Candidate (the Candidates tab before an approval)
  - A Detected Issue's Review and Deploy aren't links yet, and a Resolved Issue's open Activity, since its shipped Candidate is merged
  - Debug is a mode within Review, so the stepper's Review reads Debugging and stays the current step wherever it shows on a Debug page
- Facts - State with its mark, Approved (the Candidate's title), Fix, Dismissed because, Severity, Traces (a number linking to the tab), First seen, and Last seen
- Tabs - Overview, Traces, Evals, Candidates, and Activity, each shown only where the phase works in it
  - Validate shows Overview, Traces, and Activity, Review and Deploy show all 5, and a Resolved or Dismissed Issue keeps the tabs with something in them
  - A link to a tab the phase leaves out still opens it, with its tab in the row
  - Overview - the Issue overview, Pebble's write-up of what fails and when, with each Apply prompt as a copyable block
    - Under it, a small card per tab the phase shows, each opening its tab
    - Candidates - the count, the lead Candidate (the approved one, else the recommended or only one), and its status
    - Evals - the count, then how many New and Existing Evals pass on the lead Candidate, red when one fails
    - Traces - the count, the newest Trace's time, and the Trace that fails the most criteria
  - Each tab's actions sit at the right end of the tab row
  - Traces - every matched Trace (message, outcome, its Issues, and time) with Remove from Issue, plus Add Traces (search production Traces or add back removed ones)
  - Evals - the Evals on the Issue's evals branch + Debug Evals; with none, Add Evals asks Pebble for one
  - Candidates - one row per Candidate with its branch color, Recommended and Approved tags, verdict, and Eval results, plus New Candidate and Compare (two or more)
  - Activity - one row per commit by day, with its state, author, the service it came "via", and time

A Candidate opens inside the Candidates tab with its title, branch tag (its head commit), and tags, then Sync, Rerun, Debug (outline), and Approve in the tab row. Under them sit its verdict, results, and Eval run, its rationale with the Apply prompt folded, and the Fix as one list of changed files (the first open).
Compare shows two Candidates' results + only the Evals that differ, then the files that differ between them.

### Grounded Evals and runs

An Eval opens to its Facts (Reproduces, Criteria, Files) and 2 tabs:

- Definition - the User prompt + one row per Criterion, titled by its description, with its scale and kind (Code check or LLM judge)
- Runs - every trial of it, opening with Compare on a failing trial beside a passing one

A run page shows its trigger, ref, start, duration, steps with their logs, and an Eval run's results (each Eval's Grades, outcome, and time). An Automation's page shows its schedule, what it runs on, its steps, and its runs.
Compare puts 2 trials side by side:

- It opens with the listed trials counted as tags (e.g. "27 trials", "24 passed", "3 failed"), and the count's tooltip says a trial is one graded run of an Eval
- By default a failing trial sits beside a passing one, from the same Eval when there is one
- Each timeline row starts with its trial's picker, and each trial keeps one color on its picker and column
- Timelines share one scale + a click opens that step in the Trace
- Each column shows the failing Grades with their reasoning and "At <step>", plus Ask Pebble why it failed

### Traces page

Engineers can look through every Trace for the Agent here (e.g. for failures our Issues missed). The happy path never needs it - each Issue's Traces tab already has its evidence.

- A Production / Eval runs switch, a search, and an Annotations panel that counts each judgment's labels (a click filters by one)
- The table shows first message, turns, outcome, Issues, errors, tokens, and time (Grades in place of turns for Eval runs)
- A session opens with its Facts (session, outcome, Grades, Issues, time, duration, tokens, and cost), then its turns read like a coding agent's transcript
  - A layered timeline over the turns lays out every span by time, one row per depth (the Agent, its model and tool calls, a subagent's own), grey with only failures red, and a click opens that step
  - "N failing steps" with previous and next jumps to each, the step flashing as you land
  - Each turn is the user's message, one folded "Worked for 12s" line counting the tools it called, then the Agent's answer as Markdown with its citations as small chips that open their source
  - Inside the fold each tool call is one line, e.g. `Bash(pnpm test)`, a failed one with its error line under it; a step opens to its input over its output (Markdown or JSON), and on hover offers its span on the Spans page
  - Failing work opens by itself, and a step a failing Grade points at shows why under it, once; Expand all opens every turn
- A Steps / Flow switch shows the same session as one line per turn - a tinted pill per step in order (the user, each tool, the Agent), runs of one tool folded, failing ones red - and a click opens that step in Steps
- Spans on each turn opens its span tree with timings and attributes, and links back to the session

### Pebble

Pebble docks as a resizable side panel beside every page (Ask Pebble, Cmd+J), a whole pane, top to bottom, on either side that slides in from its edge, with a grip in the gutter between it and the page. It answers from what's on screen - each page tells it what's in view + suggests prompts.

- A click anywhere in the side chat (outside its controls), Open in main view, or a chat in the sidebar opens it in the main view (`/chat/<thread>`); going to any other page puts it back at the side, reading where you are
- The main view and the side panel are one chat - the same thread, turns, scroll, and unsent prompt, and the chat grows between them
- Open in side panel and Close in the main view go back to the page before it (Close with the panel shut)
- The page and Pebble are two panes - move either to the left or right, make either primary (they trade widths), or drag a header onto a drop zone
- Dragging the separator to the page's far edge and letting go opens the chat in the main view; dragging it shut closes the side panel, and dragging back opens it
- The sidebar's toggle collapses it to an icon rail on any page, for focused work like Debug

- Chats are titled threads: the panel's picker searches them (most recently used first, with Rename and Archive), and New chat reuses an empty one
- Archive drops a chat from the lists (its row slides out); an archived chat's link opens the newest chat
- Answers stream in with Thinking folded, Copy, Retry, and Stop
- Each answer's fold says how long Pebble worked and on how many records, and opens to what it read (the records in view and each mention, as chips) and what its chips did, with links
- A chat with no questions yet shows Pebble's welcome (its mark, plus a tagline in the main view) and the page's suggested prompts as chips above the prompt; a chip puts its words in the prompt rather than asking
- The prompt is a bordered box with Send at its corner and its controls under it: @ to mention, the model and its thinking level (when the Org has models), and Pebble's status at the right (Asleep, Waking, Ready for 3 seconds, Sleeping, or Wake failed with a retry)
- While the chats load, the chat shows a skeleton question and answer above the prompt
- Type @ to mention an Issue, Eval, Candidate, or Trace - the mention becomes a chip that opens it
- Its chips only run on a click - Open a record, Rerun Evals, or Add or Remove a Trace (it never approves or merges), and every open view rereads at once
- Failing Grades, runs, and trials offer a quiet Ask Pebble with the question filled in

### Settings

- Org settings (header gear) - Members (roles + invitations), Models (the organization's, shared ones, and usage), Sandboxes (running sandboxes against the organization's limit, for admins), and Appearance (Light and Dark)
- Agent settings - Connections + API keys (create, copy once with its OTLP header, revoke) + Delete agent
- Settings are titled pages of field groups, and a pick saves at once

## Demo

Demo code lives in 2 repos:

- demo-product - the product screens + the demo Org (an in-memory backend running platform's own Issue rules, Walkthroughs, and the Pebble Worker)
- demo-data - generates each Agent's repo, Traces, runs, Grades, and Walkthrough scripts from a brief

Pebble is the only live piece - everything else replays recorded data. A viewer's changes stay in their browser until Reset demo.
Walkthroughs drive the real product with captions and a ring on the control each caption names, and the arrow keys step back and forward. A Get started pill at the bottom of the sidebar lists them with Play all and Reset demo.

- Demo call: the presenter's walk for a live call, held on each caption until Next. A Detected Issue, its failing Trace, Validate, the Candidates, the Fix and its results, a question to Pebble, Approve, Mark as shipped, and the Issue resolved with its Fix
- Primary: Platform tour, Happy path, Dismiss, Debug a Candidate (save as a new Candidate that passes), Debug Evals (edit an Eval, rerun the Candidates on it to fresh results), Resurfaced
- Features: Compare Candidates and Pebble, Traces and Grounded Evals, Automations and Settings
  A Walkthrough's question to Pebble plays its recorded answer; anything else goes to live Pebble when it's connected.
  Demo calls are the second call in Design partnerships (Notion; that doc has prep, the script, and an FAQ).

## Under the hood

Platform is the source of truth for the backend. The browser calls an Org's data plane through `GroundedClient`, and the demo answers the same calls in memory.
Each Agent's repo follows platform's agent template:

- `agent/` - the Replica
- `.grounded/` - annotation schemas, the pre-commit hook, and `grounded/match-issues` + `grounded/run-evals` (engineers can't push here)
- `issues/<id>/` - `issue.mdx` (frontmatter + the overview), `match.sh`, `notes/`, and `candidates/<c>.mdx` (title, recommended reason, rationale, Apply prompt)
- `evals/tasks/<id>/` - Harbor tasks + `evals/registry.json`, rewritten on every commit
- `jobs/<name>/` - the team's own jobs (the demo's Trace annotation and Issue mining live here)

Work in progress sits on branches:

- `issue/<id>/evals` - an Issue's New + changed Evals (no pull request; they reach main at Mark as shipped)
- `issue/<id>/candidate/<c>` - one Fix, as a pull request into the evals branch
- `issue/<id>/regression` - a suspected regression, as a pull request labeled `regression`

These rules apply to every screen + job:

- Every state change is a commit to `issue.mdx` with `Grounded-Issue` + `Grounded-Action` trailers (Activity reads them back)
- A write based on an old commit is refused + the page rereads
- Each Candidate runs on a test merge with its evals branch, and its results go out of date when that branch moves
- Approve records the Candidate + its test merge and reruns nothing; Mark as shipped needs that approval to be current
- Every push to a Candidate's pull request runs its Evals
- Trials are sessions graded `grounded/grade/reward` + one Grade per Criterion
- Pages poll every 5 seconds while a run, Candidate, or Issue is pending

## Known gaps

We accept a few gaps for design partners at first:

- Pages poll for changes (live updates from git events come later)
- Pebble chats are private to their creator
- A Candidate saved as new carries added + changed files, but not the files the old one deleted
- Saving in Debug always runs Evals, since every push to a Candidate's pull request does
- Criterion edits don't run an LLM judge yet
