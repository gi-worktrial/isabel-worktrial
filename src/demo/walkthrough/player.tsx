import { useEffect, useEffectEvent, useRef, useState } from "react";

import {
  refreshReview,
  type Connection,
  setTheme,
  type Theme,
  useLocation,
  useNavigate,
  useParams,
  useQueryClient,
  useRouterState,
  useTheme,
} from "#src/app/public";
import { clearAnswer, recordAnswer } from "#src/demo/plane/answers";
import type { WalkthroughId } from "#src/demo/plane/seed/walkthroughs";
import { resetViewer, snapshotViewer } from "#src/demo/reset";
import {
  answered,
  answerText,
  failedAnswer,
  findTarget,
  press,
  pressKey,
  send,
  type,
} from "#src/demo/walkthrough/drive";
import { RestCard, Spotlight } from "#src/demo/walkthrough/spotlight";
import {
  DEFAULT_SPEED,
  getStarted,
  onWalkthroughRequest,
  requestedIds,
  type PlayOrder,
  requestWalkthrough,
  setPresenting,
  type Walkthrough,
  type WalkthroughBeat,
  type WalkthroughRequest,
  type Walkthroughs,
  type WalkthroughSpeed,
  type WalkthroughStep,
  walkthroughHoldMs,
  walkthroughGroupLabel,
  walkthroughOffers,
} from "#src/demo/walkthrough/state";

// a beat waiting on a run or draft sets its own waitMs, and a live answer can run past a minute
const FIND_MS = 8000;
const ANSWER_MS = 90_000;
const LATE = "Pebble did not answer in time.";
const BACK_MS = 2000;
const POLL_MS = 50;
const SETTLE_MS = 250;
// the pointer glides to and presses each control so viewers see what was clicked
const GLIDE_MS = 300;
const PRESS_MS = 120;

// the page header's toggle for Pebble's panel, pressed while the panel is open and named with its shortcut after the words
const ASK_PEBBLE = {
  role: "button",
  name: "/^Ask Pebble/",
} as const;
const PEBBLE_PUT_BACK_MS = 500;
const pebbleOpen = () => findTarget(ASK_PEBBLE)?.getAttribute("aria-pressed") === "true";

const KEYS: Partial<Record<string, "back" | "next">> = {
  ArrowLeft: "back",
  ArrowRight: "next",
};

// origin, agentId, theme and restoreViewer are put back when the Walkthrough ends
interface Session {
  walkthrough: Walkthrough;
  timing: Walkthroughs["timing"];
  origin: string;
  agentId: string;
  theme: Theme;
  // whether Pebble's panel was open, so a Walkthrough that opens it closes it again
  pebble: boolean;
  restoreViewer(): void;
  queue: WalkthroughId[];
  order: PlayOrder | null;
}

// each phase is a new object, so the effects that watch one start again when the beat does
type Phase =
  // settleMs is how long the control must hold still, and start is the page the first look keeps to
  | { kind: "finding"; since: number; waitMs: number; settleMs: number; start: string | null }
  | { kind: "showing"; element: HTMLElement }
  | { kind: "pressing"; element: HTMLElement }
  | { kind: "busy"; element: HTMLElement; waiting: "words" | "answer"; since: number }
  | { kind: "failed"; element: HTMLElement; message: string }
  | { kind: "missing" };

interface Playing {
  step: number;
  beat: number;
  phase: Phase;
  // the control the ring stands on, kept while the next one on the same page is found
  element: HTMLElement | null;
  paused: boolean;
  skipped: boolean;
  // the Nexts pressed before the control showed, each acting and moving on the moment its control does
  rushed: number;
}

const waitOf = (beat: WalkthroughBeat | undefined) => beat?.waitMs ?? FIND_MS;

function finding(waitMs: number, settleMs = POLL_MS, start: string | null = null): Phase {
  return { kind: "finding", since: Date.now(), waitMs, settleMs, start };
}

const opening = (phase: Phase): Playing => ({
  step: 0,
  beat: 0,
  phase,
  element: null,
  paused: false,
  skipped: false,
  rushed: 0,
});

// preparatory clicks come before the beat the caption is about
function captionBeat({ beats }: WalkthroughStep): number {
  const shows = beats.findLastIndex((beat) => beat.act === undefined);
  const loud = beats.findIndex((beat) => beat.quiet !== true);
  return shows === -1 ? Math.max(0, loud) : shows;
}

interface OpenedAgent {
  grounded: Connection;
  walkthroughs: Walkthroughs | null;
}

function restore(from: Session): void {
  from.restoreViewer();
  getStarted.keep();
}

const here = (location: { pathname: string; searchStr: string }) =>
  `${location.pathname}${location.searchStr}`;

// a Walkthrough starts from a fresh review and puts storage, theme and Agent back when it ends
export function WalkthroughPlayer({
  opened,
  agentId,
}: {
  opened: OpenedAgent | null;
  agentId: string | null;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const { orgId } = useParams({ strict: false });
  const pageOf = (agent: string | null, start: Walkthrough["start"] = "inbox") =>
    `/${orgId}/agents/${agent}/${start === "inbox" ? "issues" : start}`;
  const inbox = pageOf(agentId);
  const theme = useTheme();
  const [session, setSession] = useState<Session | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  const [resting, setResting] = useState(false);
  // the speed divides every timed hold, never the wait for a control or for Pebble's answer
  const [speed, setSpeed] = useState<WalkthroughSpeed>(DEFAULT_SPEED);
  const [playing, setPlaying] = useState<Playing>(() => opening(finding(FIND_MS)));
  // the pointer on the card holds the beat without the Pause the reader chose
  const [held, setHeld] = useState(false);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  // closing, Next or Back stops a beat's typing before its words are sent
  const live = useRef(false);
  const typingNow = useRef<Phase | null>(null);
  // put back once the page the Walkthrough was on has gone
  const leaving = useRef<{ from: Session; to: string | null } | null>(null);
  const steps = session?.walkthrough.steps ?? [];
  const step = steps[playing.step];
  const beat = step?.beats[playing.beat];
  const lastBeat =
    step !== undefined &&
    playing.step === steps.length - 1 &&
    playing.beat === step.beats.length - 1;
  const final = lastBeat && session !== null && session.queue.length === 0;
  // Pebble's status is a cache read that never renders the player again, so a request reads it afresh
  const offersNow = () =>
    opened === null || opened.walkthroughs === null ? [] : walkthroughOffers(opened.walkthroughs);
  const offers = offersNow();

  // what a put back wrote shows once the page it was written under has gone
  const leave = ({ from, to }: { from: Session; to: string | null }) => {
    restore(from);
    if (opened !== null) {
      void refreshReview(queryClient, opened.grounded);
    }
    if (to !== null && to !== here(location)) {
      void navigate({ href: to });
    }
  };
  const left = useEffectEvent(leave);
  // on the same Agent the storage goes back on the Inbox, since an Issue still on screen would write over it
  const putBack = (from: Session, to: string | null) => {
    live.current = false;
    clearAnswer();
    setTheme(from.theme);
    // the put back remounts the shell from the restored storage first, and leaves Pebble's main view, so Pebble's
    // panel is checked after both, since its toggle in the main view would close it by going back
    const putPebbleBack = () =>
      window.setTimeout(() => {
        const toggle = findTarget(ASK_PEBBLE);
        if (toggle !== null && pebbleOpen() !== from.pebble) {
          press(toggle);
        }
      }, PEBBLE_PUT_BACK_MS);
    if (agentId !== from.agentId) {
      restore(from);
      return void navigate({ href: to ?? pageOf(from.agentId) }).then(putPebbleBack);
    }
    if (location.pathname === inbox) {
      putPebbleBack();
      return leave({ from, to });
    }
    leaving.current = { from, to };
    void navigate({ href: inbox }).then(putPebbleBack);
  };
  const onScreen = useRouterState({ select: (state) => state.resolvedLocation?.pathname });
  useEffect(() => {
    const away = leaving.current;
    if (away === null || onScreen !== inbox) {
      return;
    }
    leaving.current = null;
    left(away);
  }, [onScreen, inbox]);

  // an open Issue keeps its layout and conversations in memory, so a Walkthrough started from one ends on the Inbox
  const end = () => {
    if (session === null) {
      return;
    }
    setResting(false);
    setHeld(false);
    setSession(null);
    putBack(
      session,
      session.origin.includes("/issues/") ? pageOf(session.agentId) : session.origin,
    );
  };

  // a total over one is Play all
  const start = useEffectEvent((ids: WalkthroughId[], total: number): boolean => {
    const [id, ...queue] = ids;
    const offer = offersNow().find(({ walkthrough }) => walkthrough.id === id);
    if (
      offer === undefined ||
      opened === null ||
      opened.walkthroughs === null ||
      agentId === null ||
      leaving.current !== null
    ) {
      return false;
    }
    if (offer.unavailable !== null) {
      setRefused(`${offer.walkthrough.name} cannot play here. ${offer.unavailable}.`);
      return false;
    }
    const { grounded } = opened;
    setRefused(null);
    clearAnswer();
    if (session !== null) {
      restore(session);
    }
    const restoreViewer = session?.restoreViewer ?? snapshotViewer(grounded.client);
    const startAt = pageOf(agentId, offer.walkthrough.start);
    void navigate({ href: startAt });
    resetViewer(grounded);
    live.current = true;
    setSession({
      walkthrough: offer.walkthrough,
      timing: opened.walkthroughs.timing,
      origin: session?.origin ?? here(location),
      agentId: session?.agentId ?? agentId,
      theme: session?.theme ?? theme,
      pebble: session?.pebble ?? pebbleOpen(),
      restoreViewer,
      queue,
      order:
        total > 1
          ? {
              label: walkthroughGroupLabel(opened.walkthroughs, offer.walkthrough.group),
              at: total - queue.length,
              total,
            }
          : null,
    });
    setPlaying(opening(finding(waitOf(offer.walkthrough.steps[0]?.beats[0]), SETTLE_MS, startAt)));
    return true;
  });

  const request = useEffectEvent((asked: WalkthroughRequest) => {
    const ids = requestedIds(offersNow(), asked);
    if (ids.length === 0) {
      return setRefused("No Walkthrough can play here.");
    }
    if (start(ids, ids.length)) {
      setSpeed(DEFAULT_SPEED);
    }
  });
  useEffect(() => onWalkthroughRequest((asked) => request(asked)), []);

  // between two Walkthroughs of Play all the Inbox shows a moment, with everything put back
  const rest = () => {
    if (session !== null) {
      setHeld(false);
      setResting(true);
      putBack(session, null);
    }
  };
  const atRest = resting && location.pathname === inbox;
  const restMs = session?.timing.restMs;
  const playNext = useEffectEvent(() => {
    setResting(false);
    if (session === null || !start(session.queue, session.order?.total ?? 1)) {
      end();
    }
  });
  useEffect(() => {
    if (!atRest || restMs === undefined) {
      return;
    }
    const timer = window.setTimeout(() => playNext(), restMs / speed);
    return () => window.clearTimeout(timer);
  }, [atRest, speed, restMs]);

  const moveOn = () => {
    if (session === null || step === undefined) {
      return;
    }
    clearAnswer();
    // a skipped answer skips the rest of its step, whose quiet acts would work on that answer
    const ends = playing.phase.kind === "failed" || playing.beat === step.beats.length - 1;
    if (lastBeat || (ends && playing.step === steps.length - 1)) {
      getStarted.tick(session.walkthrough.id);
      return session.queue.length > 0 ? rest() : end();
    }
    const next = ends
      ? { step: playing.step + 1, beat: 0 }
      : { step: playing.step, beat: playing.beat + 1 };
    const away = beat?.go === true;
    setPlaying({
      ...playing,
      ...next,
      phase: finding(waitOf(steps[next.step]?.beats[next.beat]), away ? SETTLE_MS : POLL_MS),
      // the page a go opens dims afresh, and a control on the same page takes the ring over
      element: away ? null : playing.element,
      skipped: false,
      rushed: Math.max(0, playing.rushed - 1),
    });
  };

  // the reader's Next presses at once and never skips a control still loading, the dwell's glides to it first
  const advance = (byReader = false) => {
    const { phase } = playing;
    if (byReader && phase.kind === "finding") {
      return setPlaying((current) => ({ ...current, rushed: current.rushed + 1 }));
    }
    if (phase.kind === "pressing") {
      press(phase.element);
      return moveOn();
    }
    if (phase.kind === "showing" && beat?.act === "click") {
      if (!byReader && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        const pressing: Phase = { kind: "pressing", element: phase.element };
        return setPlaying((current) => ({ ...current, phase: pressing }));
      }
      press(phase.element);
    }
    if (phase.kind === "showing" && beat?.act === "key ⌘K") {
      pressKey(beat.act);
    }
    moveOn();
  };
  // React may have remounted the control while the cursor glided to it
  const pressed = useEffectEvent((element: HTMLElement) => {
    press(element.isConnected || target === undefined ? element : (findTarget(target) ?? element));
    moveOn();
  });
  useEffect(() => {
    if (playing.phase.kind !== "pressing") {
      return;
    }
    const { element } = playing.phase;
    const box = element.getBoundingClientRect();
    setCursor({ x: box.left + box.width / 2, y: box.top + box.height / 2 });
    const timer = window.setTimeout(() => pressed(element), GLIDE_MS + PRESS_MS);
    return () => window.clearTimeout(timer);
  }, [playing.phase]);

  const back = () => {
    if (session === null || playing.step === 0) {
      return;
    }
    clearAnswer();
    setPlaying({
      ...playing,
      step: playing.step - 1,
      beat: 0,
      phase: finding(BACK_MS, SETTLE_MS),
      paused: true,
      skipped: false,
      rushed: 0,
    });
  };

  const arrive = useEffectEvent((element: HTMLElement) => {
    if (beat === undefined) {
      return;
    }
    const { act } = beat;
    // a quiet act is done at once, even under a pause, and leaves the ring where the step's words are
    if (beat.quiet === true) {
      if (act === "key ⌘K") {
        pressKey(act);
      } else if (typeof act === "object" && "fill" in act) {
        void type(
          element,
          act.fill,
          () => !live.current,
          1,
          () => findTarget(beat.target),
        );
      } else {
        press(element);
      }
      return moveOn();
    }
    // scroll only when the control is outside the window, a tall section from its heading
    const { top, bottom, height } = element.getBoundingClientRect();
    if (top < 0 || bottom > window.innerHeight) {
      element.scrollIntoView({
        block: height > window.innerHeight * 0.8 ? "start" : "center",
        inline: "nearest",
      });
    }
    // the actions under an answer show only under the pointer or with focus
    if (!element.checkVisibility({ opacityProperty: true })) {
      element.focus({ preventScroll: true });
    }
    const now = (phase: Phase) => setPlaying((current) => ({ ...current, phase, element }));
    if (typeof act !== "object") {
      return now({ kind: "showing", element });
    }
    const typing: Phase = { kind: "busy", element, waiting: "words", since: Date.now() };
    now(typing);
    // the next phase applies only if the beat is still the one typing
    const then = (phase: Phase) =>
      setPlaying((current) =>
        current.phase === typing ? { ...current, phase, element } : current,
      );
    typingNow.current = typing;
    const stopped = () => !live.current || typingNow.current !== typing;
    if ("fill" in act) {
      void type(element, act.fill, stopped, undefined, () => findTarget(beat.target)).then(() =>
        then({ kind: "showing", element }),
      );
    } else {
      void send(element, act.ask, stopped, () =>
        recordAnswer(act.ask, act.issueId, act.recorded, act.only),
      ).then(() => then({ kind: "busy", element, waiting: "answer", since: Date.now() }));
    }
  });

  // a control given up on skips to the next step whose first control is on screen, else waits for Next
  const giveUp = useEffectEvent(() => {
    const ahead = steps.findIndex(
      (each, index) =>
        index > playing.step &&
        each.beats[0] !== undefined &&
        findTarget(each.beats[0].target) !== null,
    );
    setPlaying((current) =>
      ahead === -1
        ? { ...current, phase: { kind: "missing" } }
        : { ...current, step: ahead, beat: 0, phase: finding(FIND_MS), skipped: true, rushed: 0 },
    );
  });
  const keepTo = useEffectEvent((page: string) => {
    if (location.pathname.replace(/\/$/, "") !== page.replace(/\/$/, "")) {
      void navigate({ href: page });
    }
  });
  const { phase } = playing;
  const target = beat?.target;
  const reveal = beat?.reveal;
  // the control shows once it has held still for the phase's settle, so a page still loading is never acted on
  useEffect(() => {
    if (phase.kind !== "finding" || target === undefined) {
      return;
    }
    let still = { box: "", since: Date.now() };
    let revealed = false;
    const timer = window.setInterval(() => {
      if (phase.start !== null) {
        keepTo(phase.start);
      }
      const found = findTarget(target);
      const late = Date.now() - phase.since > phase.waitMs;
      if (found === null && !late && !revealed && reveal !== undefined) {
        const opener = findTarget(reveal);
        if (opener !== null) {
          press(opener);
          revealed = true;
        }
      }
      if (found === null && !late) {
        return;
      }
      if (found !== null && !late) {
        const { x, y, width, height } = found.getBoundingClientRect();
        const box = `${x} ${y} ${width} ${height}`;
        if (box !== still.box) {
          still = { box, since: Date.now() };
        }
        if (Date.now() - still.since < phase.settleMs) {
          return;
        }
      }
      window.clearInterval(timer);
      if (found === null) {
        giveUp();
      } else {
        arrive(found);
      }
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [phase, target, reveal]);

  useEffect(() => {
    if (phase !== typingNow.current) {
      typingNow.current = null;
    }
  }, [phase]);

  useEffect(() => {
    if (phase.kind !== "busy" || phase.waiting !== "answer") {
      return;
    }
    const timer = window.setInterval(() => {
      const failed =
        failedAnswer(phase.element) ?? (Date.now() - phase.since > ANSWER_MS ? LATE : null);
      if (!answered(phase.element) && failed === null) {
        return;
      }
      window.clearInterval(timer);
      clearAnswer();
      const next: Phase =
        failed === null
          ? { kind: "showing", element: phase.element }
          : { kind: "failed", element: phase.element, message: failed };
      setPlaying((current) => (current.phase === phase ? { ...current, phase: next } : current));
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [phase]);

  const retry = () => {
    if (phase.kind !== "failed") {
      return;
    }
    const again = [...phase.element.querySelectorAll<HTMLElement>('button[aria-label="Retry"]')].at(
      -1,
    );
    if (again !== undefined) {
      const act = beat?.act;
      if (typeof act === "object" && "ask" in act) {
        recordAnswer(act.ask, act.issueId, act.recorded, act.only);
      }
      press(again);
    }
    setPlaying((current) => ({
      ...current,
      phase: { kind: "busy", element: phase.element, waiting: "answer", since: Date.now() },
    }));
  };

  // the search goes on under a pause and can give up, so Play looks again rather than let Next skip the beat's act
  const lookAgain = (current: Playing): Phase => {
    const { phase: now } = current;
    if (now.kind !== "finding" && now.kind !== "missing") {
      return now;
    }
    return finding(
      now.kind === "missing" ? BACK_MS : waitOf(steps[current.step]?.beats[current.beat]),
    );
  };
  const togglePause = () =>
    setPlaying((current) => ({
      ...current,
      paused: !current.paused,
      phase: current.paused && !held ? lookAgain(current) : current.phase,
    }));
  const hold = (next: boolean) => {
    if (next === held) {
      return;
    }
    setHeld(next);
    if (!next) {
      setPlaying((current) =>
        current.paused ? current : { ...current, phase: lookAgain(current) },
      );
    }
  };

  // the caption beat holds for its words and a glance at the answer, earlier beats a moment, the last for Done
  const asked = typeof beat?.act === "object" && "ask" in beat.act;
  const captioned = step !== undefined && playing.beat === captionBeat(step);
  const presenting = session?.walkthrough.waits === true;
  // a presenter's pointer rests on Next, so only their Pause stops the clicks before a caption
  const stopped = playing.paused || (held && !(presenting && !captioned));
  const words =
    phase.kind === "showing"
      ? `${captioned ? step.caption : ""} ${asked ? answerText(phase.element) : ""}`.trim()
      : "";
  // a presenter's Walkthrough holds each caption until Next
  const waits = presenting && captioned;
  const holdMs =
    phase.kind !== "showing" || final || session === null || waits
      ? null
      : words === ""
        ? session.timing.preparationMs / speed
        : walkthroughHoldMs(words, speed, session.timing);
  // the share of the hold already shown, so Play, the pointer leaving or a new speed goes on from where it stopped
  const spent = useRef({ phase, share: 0 });
  const onDwell = useEffectEvent(() => advance());
  const onRushed = useEffectEvent(() => advance(true));
  useEffect(() => {
    if (phase.kind === "showing" && playing.rushed > 0) {
      onRushed();
    }
  }, [phase, playing.rushed]);
  useEffect(() => {
    if (holdMs === null || stopped) {
      return;
    }
    if (spent.current.phase !== phase) {
      spent.current = { phase, share: 0 };
    }
    const { share } = spent.current;
    const since = Date.now();
    const timer = window.setTimeout(() => onDwell(), holdMs * (1 - share));
    return () => {
      window.clearTimeout(timer);
      spent.current = { phase, share: share + (Date.now() - since) / holdMs };
    };
  }, [phase, stopped, holdMs]);

  // Escape ends the Walkthrough and the arrows step it, before the page takes the key
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      return end();
    }
    const onCard =
      event.target instanceof Element && event.target.closest("[data-walkthrough-card]") !== null;
    const command = KEYS[event.key];
    if (command === undefined || onCard || event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (!event.repeat) {
      ({ back, next: () => advance(true) })[command]();
    }
  });
  const playingNow = session !== null;
  useEffect(() => () => clearAnswer(), []);
  useEffect(() => {
    if (!playingNow) {
      return;
    }
    setPresenting(true);
    const listener = (event: KeyboardEvent) => onKey(event);
    window.addEventListener("keydown", listener, { capture: true });
    return () => {
      setPresenting(false);
      window.removeEventListener("keydown", listener, { capture: true });
    };
  }, [playingNow]);

  const order = session?.order ?? null;
  const coming = offers.find(({ walkthrough }) => walkthrough.id === session?.queue[0]);
  if (resting && order !== null && coming !== undefined) {
    return <RestCard order={{ ...order, at: order.at + 1 }} next={coming.walkthrough.name} />;
  }
  if (session === null || step === undefined || resting) {
    return refused === null ? null : (
      <p
        key={refused}
        role="status"
        onAnimationEnd={() => setRefused(null)}
        className="fixed bottom-6 left-1/2 z-50 max-w-[calc(100vw-32px)] -translate-x-1/2 rounded-sm bg-ink px-3 py-2 type-label-13 text-surface shadow-float animate-notice"
      >
        {refused}
      </p>
    );
  }
  // the Walkthrough Get started lists after this one, offered on its last step
  const at = offers.findIndex(({ walkthrough }) => walkthrough.id === session.walkthrough.id);
  const upNext = offers.slice(at + 1).find(({ unavailable }) => unavailable === null)?.walkthrough;
  // an ask rings the composer while it types, then the answer
  const focus =
    !asked || phase.kind === "finding" || phase.kind === "missing"
      ? undefined
      : phase.kind === "busy" && phase.waiting === "words"
        ? "composer"
        : "answer";
  return (
    <>
      <Spotlight
        element={playing.element}
        target={target}
        focus={focus}
        card={{
          name: session.walkthrough.name,
          // the card moves to the next step at once, and the ring follows when its control is found
          caption: step.caption,
          beat: `${playing.step}:${playing.beat}`,
          step: playing.step + 1,
          steps: steps.length,
          // the last step's words wait for its control so Done never sits under the step before
          last: final && phase.kind !== "finding",
          order,
          paused: playing.paused,
          held,
          hold: holdMs === null || !captioned ? null : { ms: holdMs, running: !stopped },
          speed,
          phase: phase.kind,
          skipped: playing.skipped,
          failure: phase.kind === "failed" ? phase.message : null,
          upNext: upNext?.name ?? null,
        }}
        on={{
          refound: (element) => setPlaying((current) => ({ ...current, element })),
          back,
          next: () => advance(true),
          retry,
          pause: togglePause,
          hold,
          speed: setSpeed,
          replay: () => requestWalkthrough(session.walkthrough.id),
          upNext: () => (upNext === undefined ? undefined : requestWalkthrough(upNext.id)),
          close: end,
        }}
      />
      {cursor === null ? null : <Cursor at={cursor} pressing={phase.kind === "pressing"} />}
    </>
  );
}

function Cursor({ at, pressing }: { at: { x: number; y: number }; pressing: boolean }) {
  return (
    <div
      aria-hidden="true"
      data-walkthrough-cursor
      className="pointer-events-none fixed top-0 left-0 z-[53] ease-out motion-reduce:hidden"
      style={{
        transform: `translate(${at.x}px, ${at.y}px)`,
        transitionProperty: "transform",
        transitionDuration: `${GLIDE_MS}ms`,
      }}
    >
      <span
        className={`absolute -top-3 -left-3 size-6 rounded-full bg-accent/40 transition ease-out ${pressing ? "scale-150 opacity-0" : "scale-0 opacity-100 duration-0"}`}
        style={
          pressing ? { transitionDuration: `${PRESS_MS}ms`, transitionDelay: `${GLIDE_MS}ms` } : {}
        }
      />
      <svg viewBox="0 0 16 20" className="relative h-5 w-4 drop-shadow">
        <path
          d="M1 1v15l4-4 3 7 2.5-1-3-7h6z"
          className="fill-ink stroke-surface"
          strokeWidth="1.25"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
