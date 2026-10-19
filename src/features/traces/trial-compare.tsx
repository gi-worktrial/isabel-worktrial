import { useQueries } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Check, ChevronDown, X } from "lucide-react";
import { useId, useRef, useState } from "react";

import { sessionQuery } from "#/queries";
import { OutcomeTag, failingSteps, sessionGrades, turnSpans } from "#/trace-view";
import { SpanTimeline, counted } from "#/traces";
import { Button, buttonVariants } from "#/ui/button";
import { cn } from "#/ui/cn";
import { Input } from "#/ui/input";
import { Skeleton } from "#/ui/skeleton";
import { Tag } from "#/ui/tag";
import { Tooltip } from "#/ui/tooltip";
import { formatDuration } from "#src/features/traces/duration";
import { gradeLocation, locationText, markedSteps } from "#src/features/traces/failure";
import { FAIL_LABEL, PASS_LABEL } from "#src/sdk/evals";
import { AskPebble } from "#src/ui/ask-pebble";
import { ErrorView } from "#src/ui/error-view";
import { useListbox } from "#src/ui/listbox";
import { Popover } from "#src/ui/popover";
import { matchesWords } from "#src/ui/search";

/** A trial a run or Eval lists, by its session. */
export type TrialOption = {
  session: string;
  /** The Eval it ran, so a failing trial pairs with a passing trial of the same Eval first. */
  eval: string;
  label: string;
  annotations: ReadonlyArray<{ name: string; label: string }>;
};

// two trials side by side, each slot marked by its trace color on its picker, timeline and column
const SLOTS = [
  { name: "First trial", dot: "bg-trace-1" },
  { name: "Second trial", dot: "bg-trace-2" },
] as const;

type Slot = (typeof SLOTS)[number];

const failed = ({ annotations }: TrialOption) =>
  annotations.some(({ label }) => label === FAIL_LABEL);

const passed = (option: TrialOption) =>
  !failed(option) && option.annotations.some(({ label }) => label === PASS_LABEL);

/** The trial to set beside another: one with the other outcome from the same Eval, else from any Eval, else the next one. */
function partnerOf(first: TrialOption, options: readonly TrialOption[]) {
  const others = options.filter(({ session }) => session !== first.session);
  const differs = (option: TrialOption) => failed(option) !== failed(first);
  return (
    others.find((option) => option.eval === first.eval && differs(option)) ??
    others.find(differs) ??
    others[0]
  );
}

/** The picked trials that are still listed, else the first failing trial, with its partner filling an empty slot. */
export function comparedTrials(
  picked: readonly string[] | undefined,
  options: readonly TrialOption[],
) {
  const kept = [...new Set(picked)]
    .flatMap((session) => options.find((option) => option.session === session) ?? [])
    .slice(0, SLOTS.length);
  const first = kept[0] ?? options.find(failed) ?? options[0];
  if (first === undefined) {
    return [];
  }

  const second = kept[1] ?? partnerOf(first, options);
  return second === undefined ? [first] : [first, second];
}

/** Trial labels (such as each one's Eval), numbered where one repeats, as an Eval run more than once does. */
export function trialLabels(names: readonly string[]) {
  const counts = new Map<string, number>();
  for (const id of names) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  const seen = new Map<string, number>();
  return names.map((id) => {
    const nth = (seen.get(id) ?? 0) + 1;
    seen.set(id, nth);
    return (counts.get(id) ?? 0) > 1 ? `${id} #${nth}` : id;
  });
}

type Params = { orgId: string; agent: string };
type Loaded = ReturnType<typeof useCompared>[number];
/** A compared trial in its slot, with its session as it loads. */
type Side = { slot: Slot; option: TrialOption; loaded: Loaded | undefined };

function useCompared({ orgId, agent }: Params, compared: readonly TrialOption[]) {
  return useQueries({
    queries: compared.map(({ session }) =>
      sessionQuery({ orgId, agent, session, after: undefined }),
    ),
  });
}

function TraceDot({ slot }: { slot: Slot }) {
  return <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", slot.dot)} />;
}

/**
 * A run's or Eval's trials, counted by outcome, then two of them side by side: a failing one beside a passing one by
 * default, each picked from its timeline row, with a column each saying why it fails and where.
 */
export function TrialCompare({
  params,
  options,
  picked,
  onPick,
  askPrompt,
}: {
  params: Params;
  options: readonly TrialOption[];
  /** The trials picked to compare, or undefined for the default. */
  picked: readonly string[] | undefined;
  onPick(compared: string[]): void;
  /** What Ask Pebble asks about a failing trial. */
  askPrompt(option: TrialOption): string;
}) {
  const compared = comparedTrials(picked, options);
  const loaded = useCompared(params, compared);
  const sides = SLOTS.flatMap((slot, index) => {
    const option = compared[index];
    return option === undefined ? [] : [{ slot, option, loaded: loaded[index] }];
  });
  const failing = options.filter(failed).length;
  const passing = options.filter(passed).length;
  const pick = (slot: number, session: string) =>
    onPick(compared.map((option) => option.session).with(slot, session));

  return (
    <section aria-label="Compare trials" className="@container flex flex-col gap-3">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <h3 className="mr-1 type-label-13 font-semibold text-ink">Compare trials</h3>
        <Tooltip label="A trial is one graded run of an Eval">
          <Tag tabIndex={0}>{counted(options.length, "trials")}</Tag>
        </Tooltip>
        {passing > 0 && <Tag tone="success">{`${passing} passed`}</Tag>}
        {failing > 0 && <Tag tone="danger">{`${failing} failed`}</Tag>}
      </div>
      <Timelines params={params} options={options} sides={sides} onPick={pick} />
      <div className={cn("grid items-start gap-3", sides.length > 1 && "@2xl:grid-cols-2")}>
        {sides.map((side) => (
          <TrialColumn
            key={side.option.session}
            params={params}
            side={side}
            askPrompt={askPrompt(side.option)}
          />
        ))}
      </div>
    </section>
  );
}

const sessionLink = (params: Params, session: string) =>
  ({ to: "/$orgId/agents/$agent/traces/$session", params: { ...params, session } }) as const;

/** Each compared trial's picker and timeline on one scale, so longer trials read longer, a click opening the step in its trace. */
function Timelines({
  params,
  options,
  sides,
  onPick,
}: {
  params: Params;
  options: readonly TrialOption[];
  sides: readonly Side[];
  onPick(slot: number, session: string): void;
}) {
  const navigate = useNavigate();
  const longest = Math.max(
    1,
    ...sides.map(({ loaded }) => loaded?.data?.page.session.duration_ns ?? 0),
  );
  const taken = new Set(sides.map(({ option }) => option));

  return (
    <ol aria-label="Timelines" className="flex flex-col gap-2">
      {sides.map(({ slot, option, loaded }, index) => {
        const data = loaded?.data;
        const turns = data?.page.turns ?? [];
        return (
          <li
            key={option.session}
            className="grid grid-cols-[minmax(0,14rem)_minmax(0,1fr)_3.5rem] items-center gap-3"
          >
            <TrialPicker
              slot={slot}
              current={option}
              // the other slot's trial stays out, so the two never match
              options={options.filter((each) => each === option || !taken.has(each))}
              onChoose={(session) => onPick(index, session)}
            />
            {data === undefined ? (
              <Skeleton className="h-2 w-full" />
            ) : (
              <div style={{ width: `${(data.page.session.duration_ns / longest) * 100}%` }}>
                <SpanTimeline
                  traces={turns.map(({ spans }) => spans)}
                  failed={markedSteps(failingSteps(turns.map(turnSpans), data.annotations))}
                  onPick={({ span_id }) =>
                    void navigate({
                      ...sessionLink(params, option.session),
                      search: { step: span_id },
                    })
                  }
                />
              </div>
            )}
            <span className="text-right type-meta-12 text-muted tabular-nums">
              {data === undefined ? "" : formatDuration(data.page.session.duration_ns)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** A slot's trial as a button that opens the trials to pick from, searched by label, each with its outcome. */
function TrialPicker({
  slot,
  current,
  options,
  onChoose,
}: {
  slot: Slot;
  current: TrialOption;
  options: readonly TrialOption[];
  onChoose(session: string): void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const opener = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const shown = options.filter((option) => matchesWords(query, [option.label]));
  const choose = (option: TrialOption) => {
    setOpen(false);
    if (option !== current) {
      onChoose(option.session);
    }
  };
  const listbox = useListbox(shown, choose, query);

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      opener={opener}
      align="start"
      sideOffset={4}
      aria-label={slot.name}
      className="menu-panel flex w-96 flex-col gap-1 px-1"
      anchor={
        <Button
          ref={opener}
          size="small"
          aria-label={`${slot.name}, ${current.label}`}
          aria-haspopup="listbox"
          aria-expanded={open}
          className="min-w-0 justify-start"
          onClick={() => {
            setQuery("");
            setOpen(!open);
          }}
        >
          <TraceDot slot={slot} />
          <span className="min-w-0 truncate">{current.label}</span>
          <ChevronDown aria-hidden="true" className="ml-auto size-3.5 shrink-0 text-muted" />
        </Button>
      }
    >
      <Input
        aria-label="Search trials"
        placeholder="Search trials"
        role="combobox"
        aria-controls={listId}
        aria-expanded="true"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={listbox.onKeyDown}
        className="h-8"
      />
      <div
        ref={listbox.list}
        id={listId}
        role="listbox"
        aria-label="Trials"
        className="max-h-72 overflow-y-auto"
      >
        {shown.length === 0 && <p className="px-3 py-1 type-meta-12 text-muted">No trials match</p>}
        {shown.map((option, index) => (
          <button
            key={option.session}
            type="button"
            role="option"
            aria-selected={option === listbox.current}
            className="menu-item w-full text-left"
            onMouseEnter={() => listbox.setActive(index)}
            onClick={() => choose(option)}
          >
            <span className="flex size-3.5 shrink-0 items-center text-muted">
              {option === current && <Check aria-hidden="true" className="size-3.5" />}
            </span>
            <span className="min-w-0 flex-1 truncate">{option.label}</span>
            <OutcomeTag annotations={option.annotations} />
          </button>
        ))}
      </div>
    </Popover>
  );
}

const LINK = buttonVariants({ variant: "quiet", size: "small" });

/** A trial's failing Grades, each with its reasoning and a link to the step it points at, or that it passed. */
function TrialColumn({
  params,
  side: { slot, option, loaded },
  askPrompt,
}: {
  params: Params;
  side: Side;
  askPrompt: string;
}) {
  const data = loaded?.data;
  const grades =
    data === undefined ? [] : sessionGrades(data.annotations, data.page.turns).criteria;
  const failing = grades.filter(({ label }) => label === FAIL_LABEL);
  const views = data?.page.turns.map(turnSpans) ?? [];

  return (
    <article className="flex min-w-0 flex-col gap-2 card p-4">
      <header className="flex min-w-0 items-center gap-2">
        <TraceDot slot={slot} />
        <h4 className="min-w-0 truncate type-label-13 font-semibold text-ink" title={option.label}>
          {option.label}
        </h4>
        <OutcomeTag annotations={option.annotations} />
        <Link {...sessionLink(params, option.session)} className={cn("ml-auto", LINK)}>
          Open Trace
        </Link>
      </header>
      {loaded?.error ? (
        <ErrorView
          title="This trial could not load"
          error={loaded.error}
          onRetry={() => void loaded.refetch()}
        />
      ) : data === undefined ? (
        <div className="flex flex-col gap-2 py-1">
          <Skeleton className="h-3 w-3/5" />
          <Skeleton className="h-2.5 w-4/5" />
        </div>
      ) : failing.length === 0 ? (
        <p className="type-label-13 text-muted">
          {grades.length === 0
            ? "No Grades on this trial"
            : grades.length === 1
              ? "1 Grade passed"
              : `All ${grades.length} Grades passed`}
        </p>
      ) : (
        <>
          <ol aria-label="Failing Grades" className="flex flex-col">
            {failing.map((grade) => {
              const location = gradeLocation(views, grade);
              return (
                <li key={`${grade.name}:${grade.source.id}`} className="flex min-w-0 gap-2 py-1">
                  <span className="flex h-5 shrink-0 items-center">
                    <X aria-hidden="true" strokeWidth={2.5} className="size-4 text-danger" />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <p className="flex min-h-5 min-w-0 items-center gap-2 type-label-13 text-ink">
                      <span className="sr-only">Failed</span>
                      <span className="min-w-0 flex-1">{grade.description || grade.criterion}</span>
                      {location !== undefined && (
                        <Link
                          {...sessionLink(params, option.session)}
                          search={{ step: location.id }}
                          className={cn("max-w-48", LINK)}
                        >
                          <span className="truncate">{`At ${locationText(location, views.length)}`}</span>
                        </Link>
                      )}
                    </p>
                    {grade.explanation && (
                      <p className="line-clamp-2 max-w-reading type-label-13 text-muted">
                        {grade.explanation}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
          <div className="-ml-2">
            <AskPebble label="Ask Pebble why this failed" prompt={askPrompt} />
          </div>
        </>
      )}
    </article>
  );
}
