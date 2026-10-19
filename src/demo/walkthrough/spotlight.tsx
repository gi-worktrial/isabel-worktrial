import { ChevronLeft, Pause, Play, RotateCcw, X } from "lucide-react";
import { Popover } from "radix-ui";
import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from "react";

import { Button, IconButton } from "#/ui/button";
import { Dropdown, MenuLabel, MenuRadioGroup, MenuRadioItem } from "#/ui/menu";
import { Tag } from "#/ui/tag";
import { Tooltip } from "#/ui/tooltip";
import type { WalkthroughTarget } from "#src/demo/plane/seed/walkthroughs";
import { askFocus, findTarget } from "#src/demo/walkthrough/drive";
import {
  DEFAULT_SPEED,
  type PlayOrder,
  WALKTHROUGH_SPEEDS,
  type WalkthroughSpeed,
} from "#src/demo/walkthrough/state";
import { KeyHint } from "#src/ui/kbd";
import { shortcutKeys, SHORTCUTS } from "#src/ui/keys";

type Box = Record<"top" | "left" | "bottom" | "right", number>;

const CARD_WIDTH = 320;
const GAP = 12;
const MARGIN = 16;
// where a card with nothing to stand beside rests
const GUTTER = 24;
// the ring stands a little off the control, closer round a small one or a menu row
const PAD = 4;
const TIGHT_PAD = 2;
// a control React remounted is looked for again this long before the ring counts it gone
const REFIND_MS = 1000;
const DIM = "bg-black/30 dark:bg-black/50";
const HOLE = "shadow-[0_0_0_200vmax_rgb(0_0_0/0.3)] dark:shadow-[0_0_0_200vmax_rgb(0_0_0/0.5)]";
const GLIDE =
  "transition-[top,left,width,height] duration-[220ms] ease-out motion-reduce:transition-none";
const VIEW = (): Box => ({ top: 0, left: 0, bottom: window.innerHeight, right: window.innerWidth });
// an open menu, list or dialog shows whole round the ringed row in it, so its other rows never read as disabled
const LAYER = '[role="menu"], [role="listbox"], [role="dialog"]:not([data-walkthrough-card])';

function clamp(box: Box, pad: number, bounds: Box): Box {
  return {
    top: Math.max(box.top - pad, bounds.top),
    left: Math.max(box.left - pad, bounds.left),
    bottom: Math.min(box.bottom + pad, bounds.bottom),
    right: Math.min(box.right + pad, bounds.right),
  };
}

const styled = ({ top, left, bottom, right }: Box) => ({
  top,
  left,
  width: right - left,
  height: bottom - top,
});

type Boxes = Record<"ring" | "hole", Box>;

function boxesOf(element: HTMLElement, clip: HTMLElement | null): Boxes {
  const layer = element.closest<HTMLElement>(LAYER);
  const outer = layer ?? clip;
  const bounds = outer === null ? VIEW() : clamp(outer.getBoundingClientRect(), 0, VIEW());
  const rect = element.getBoundingClientRect();
  const tight = rect.height < 28 || (layer !== null && layer.getAttribute("role") !== "dialog");
  const ring = clamp(rect, tight ? TIGHT_PAD : PAD, bounds);
  return { ring, hole: layer === null ? ring : bounds };
}

type Focus = "composer" | "answer";

// read every frame so the ring follows a scroll, a resize or a moving row
function useBoxes(
  element: HTMLElement | null,
  target: WalkthroughTarget | undefined,
  focus: Focus | undefined,
  onRefound: (element: HTMLElement) => void,
): Boxes | null {
  const [boxes, setBoxes] = useState<Boxes | null>(null);
  const refound = useEffectEvent(onRefound);
  useLayoutEffect(() => {
    if (element === null) {
      setBoxes(null);
      return;
    }
    let current = element;
    let lost: number | null = null;
    let frame = 0;
    let last = "";
    const read = () => {
      if (!current.isConnected) {
        const again = target === undefined ? null : findTarget(target);
        if (again !== null) {
          current = again;
          lost = null;
          refound(again);
        } else {
          lost ??= Date.now();
        }
      }
      const next = !current.isConnected
        ? Date.now() - (lost ?? 0) > REFIND_MS
          ? null
          : undefined
        : focus === undefined
          ? boxesOf(current, null)
          : boxesOf(askFocus(current, focus), current);
      const key = JSON.stringify(next);
      if (next !== undefined && key !== last) {
        last = key;
        setBoxes(next);
      }
      frame = requestAnimationFrame(read);
    };
    read();
    return () => cancelAnimationFrame(frame);
  }, [element, target, focus]);
  return boxes;
}

type Side = "bottom" | "right" | "top" | "left";
type Placement = { side: Side; align: "start" | "center" | "end"; anchor: Box };

const overlaps = (a: Box, b: Box) =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

// below, right, above, then left, wherever the card fits whole
function beside(box: Box, height: number): Placement | undefined {
  const room = {
    bottom: window.innerHeight - box.bottom,
    right: window.innerWidth - box.right,
    top: box.top,
    left: box.left,
  };
  const fits = (side: Side) =>
    room[side] - GAP - MARGIN >= (side === "bottom" || side === "top" ? height : CARD_WIDTH);
  const side = (["bottom", "right", "top", "left"] as const).find(fits);
  // above or below, the card's left edge meets the control's
  return side === undefined
    ? undefined
    : { side, align: side === "bottom" || side === "top" ? "start" : "center", anchor: box };
}

// a card at rest stays in the page column in view, which ends where Pebble's panel begins
function pageBox(): Box {
  const page = document.querySelector("main")?.getBoundingClientRect();
  return page === undefined ? VIEW() : clamp(page, 0, VIEW());
}

// beside the dialog or menu the control sits in, else beside the control, else the page column's corner clear of it
function placementOf(boxes: Boxes | null, height: number): Placement {
  const near =
    boxes === null ? undefined : (beside(boxes.hole, height) ?? beside(boxes.ring, height));
  if (near !== undefined) {
    return near;
  }
  const page = pageBox();
  const [left, right] = [page.left + GUTTER, page.right - GUTTER];
  const [top, bottom] = [page.top + GUTTER, page.bottom - GUTTER];
  const corners = [
    { side: "top", align: "end", x: right, y: bottom },
    { side: "top", align: "start", x: left, y: bottom },
    { side: "bottom", align: "end", x: right, y: top },
    { side: "bottom", align: "start", x: left, y: top },
  ] as const;
  const cardAt = ({ side, align, x, y }: (typeof corners)[number]): Box => ({
    top: side === "top" ? y - height : y,
    bottom: side === "top" ? y : y + height,
    left: align === "end" ? x - CARD_WIDTH : x,
    right: align === "end" ? x : x + CARD_WIDTH,
  });
  const corner =
    corners.find((each) => boxes === null || !overlaps(cardAt(each), boxes.ring)) ?? corners[0];
  const point = { top: corner.y, bottom: corner.y, left: corner.x, right: corner.x };
  return { side: corner.side, align: corner.align, anchor: point };
}

interface SpotlightCard {
  name: string;
  caption: string;
  // "step:beat" for the journeys to follow
  beat: string;
  // counted from one, so each number is one caption
  step: number;
  steps: number;
  // where Next reads Done
  last: boolean;
  order: PlayOrder | null;
  paused: boolean;
  held: boolean;
  // stopped while held or paused, and null while the beat waits on the page or Done
  hold: { ms: number; running: boolean } | null;
  speed: WalkthroughSpeed;
  phase: string;
  skipped: boolean;
  failure: string | null;
  upNext: string | null;
}

function Segments({ card: { step, steps, hold } }: { card: SpotlightCard }) {
  return (
    <div aria-hidden="true" className="absolute inset-x-0 top-0 flex gap-1">
      {Array.from({ length: steps }, (_, index) => (
        <span key={index} className="h-[3px] flex-1 overflow-hidden bg-divider">
          {index + 1 < step ? <span className="block size-full bg-accent" /> : null}
          {index + 1 === step && hold !== null ? (
            <span
              key={hold.ms}
              className="block size-full origin-left bg-accent motion-reduce:hidden"
              style={{
                animation: `walkthrough-fill ${hold.ms}ms linear both`,
                animationPlayState: hold.running ? "running" : "paused",
              }}
            />
          ) : null}
        </span>
      ))}
      <style>
        {
          "@keyframes walkthrough-fill { from { transform: scaleX(0) } to { transform: scaleX(1) } }"
        }
      </style>
    </div>
  );
}

export function RestCard({ order, next }: { order: PlayOrder; next: string }) {
  return (
    <div className={`fixed inset-0 z-[51] flex items-center justify-center ${DIM}`}>
      <p
        role="status"
        className="flex flex-col gap-1 float-layer rounded-sm px-4 py-3"
        style={{ width: CARD_WIDTH }}
      >
        <span className="type-meta-12 text-muted">{`${order.label} ${order.at} of ${order.total}`}</span>
        <span className="type-heading-15 text-ink">Next: {next}</span>
      </p>
    </div>
  );
}

export function Spotlight({
  element,
  target,
  focus,
  card,
  on,
}: {
  element: HTMLElement | null;
  target: WalkthroughTarget | undefined;
  focus: Focus | undefined;
  card: SpotlightCard;
  on: Record<"back" | "next" | "retry" | "pause" | "replay" | "upNext" | "close", () => void> & {
    refound(element: HTMLElement): void;
    hold(held: boolean): void;
    speed(speed: WalkthroughSpeed): void;
  };
}) {
  const boxes = useBoxes(element, target, focus, on.refound);
  const { caption, name, beat, step, steps, last, order, paused, held, speed, phase } = card;
  const lit = boxes !== null && phase !== "missing";
  const ref = useRef<HTMLDivElement>(null);
  // the pointer anywhere off the card lets it go, even where the card slid out from under it
  const letGo = useEffectEvent((event: PointerEvent) => {
    if (!(event.target instanceof Node && ref.current?.contains(event.target) === true)) {
      on.hold(false);
    }
  });
  useEffect(() => {
    if (!card.held) {
      return;
    }
    window.addEventListener("pointermove", letGo);
    return () => window.removeEventListener("pointermove", letGo);
  }, [card.held]);
  const [height, setHeight] = useState(160);
  useLayoutEffect(() => {
    const measured = ref.current?.offsetHeight;
    if (measured !== undefined) {
      setHeight(measured);
    }
  }, [caption, card.failure, card.skipped, phase, last]);
  // while the next step's control is still loading, the card waits faded where it last stood, so it moves once
  const kept = useRef<Placement | null>(null);
  const placement = lit ? placementOf(boxes, height) : (kept.current ?? placementOf(null, height));
  const waiting = !lit && phase !== "missing";
  // a ref because Radix reads the anchor every frame
  const placed = useRef(placement.anchor);
  useLayoutEffect(() => {
    placed.current = placement.anchor;
    if (lit) {
      kept.current = placement;
    }
  });
  const anchor = useRef({
    getBoundingClientRect: () => {
      const { top, left, bottom, right } = placed.current;
      return new DOMRect(left, top, right - left, bottom - top);
    },
  });
  const next = card.failure !== null ? "Skip" : last ? "Done" : "Next";
  const upNext = last && card.failure === null ? card.upNext : null;
  return (
    <>
      {/* above the page's menus (z-50) so the ring round a menu row draws over the menu */}
      <div className="fixed inset-0 z-[51]" data-walkthrough-layer>
        {/* keyed so the dim never becomes the hole, which glides only between lit boxes */}
        {lit ? (
          <>
            <div
              key="hole"
              className={`absolute rounded-xs ${HOLE} ${GLIDE}`}
              style={styled(boxes.hole)}
            />
            <div
              key="ring"
              data-spotlight
              aria-hidden="true"
              className={`absolute rounded-xs ring-2 ring-accent outline-6 outline-accent/20 outline-solid ${GLIDE}`}
              style={styled(boxes.ring)}
            />
          </>
        ) : (
          <div
            key="dim"
            className={`absolute inset-0 transition-opacity duration-200 ${DIM} ${phase === "finding" ? "opacity-0" : ""}`}
          />
        )}
      </div>
      <Popover.Root open modal={false}>
        <Popover.Anchor virtualRef={anchor} />
        <Popover.Portal>
          <Popover.Content
            ref={ref}
            side={placement.side}
            align={placement.align}
            sideOffset={placement.anchor.top === placement.anchor.bottom ? 0 : GAP}
            collisionPadding={MARGIN}
            updatePositionStrategy="always"
            aria-label="Walkthrough step"
            onOpenAutoFocus={(event) => event.preventDefault()}
            onCloseAutoFocus={(event) => event.preventDefault()}
            onInteractOutside={(event) => event.preventDefault()}
            onEscapeKeyDown={(event) => event.preventDefault()}
            data-walkthrough-card
            data-phase={phase}
            data-beat={beat}
            // a pointer the card slid under holds nothing until it moves, so a still mouse never stutters the beat
            onPointerMove={(event) => {
              if (event.movementX !== 0 || event.movementY !== 0) {
                on.hold(true);
              }
            }}
            // a click leaves focus where it was, so the arrows still reach the player after one
            onMouseDown={(event) => event.preventDefault()}
            className={`relative z-[52] overflow-hidden float-layer rounded-sm px-4 pt-4 pb-3 outline-none transition-opacity duration-200 dark:bg-fill ${waiting ? "opacity-60" : ""}`}
            style={{ width: CARD_WIDTH }}
          >
            <Segments card={card} />
            <div className="flex h-5 items-center gap-2">
              <p className="min-w-0 truncate type-meta-12 text-muted">{name}</p>
              {order === null ? null : (
                <Tag tone="accent">{`${order.label} ${order.at} of ${order.total}`}</Tag>
              )}
              {paused || held ? <Tag tone="neutral">Paused</Tag> : null}
              <IconButton
                label="Close Walkthrough"
                shortcut="Esc"
                size="small"
                className="-my-1 -mr-2 ml-auto"
                onClick={on.close}
              >
                <X className="size-4" />
              </IconButton>
            </div>
            <p className="mt-2 type-copy-14 text-ink">{caption}</p>
            {card.skipped ? <p className="mt-1 type-meta-12 text-muted">Skipped a step</p> : null}
            {phase === "missing" ? (
              <p className="mt-1 type-meta-12 text-muted">
                Waiting for this step. Press Next to skip.
              </p>
            ) : null}
            {card.failure === null ? null : (
              <p role="alert" className="mt-1 type-meta-12 text-muted">
                {card.failure}
              </p>
            )}
            {upNext === null ? null : (
              <Tooltip label={upNext}>
                <p className="mt-3 truncate type-meta-12 text-muted">{`Up next: ${upNext}`}</p>
              </Tooltip>
            )}
            <div
              className={
                upNext === null ? "mt-3 flex items-center gap-1" : "mt-1 flex items-center gap-1"
              }
            >
              <IconButton
                label="Back"
                shortcut={SHORTCUTS.previous}
                size="small"
                className="-ml-2"
                disabled={step === 1}
                aria-keyshortcuts={shortcutKeys(SHORTCUTS.previous)}
                onClick={on.back}
              >
                <ChevronLeft className="size-4" />
              </IconButton>
              {/* the count opens the speed, a setting the reader seldom changes */}
              <Dropdown
                side="top"
                align="start"
                className="z-[60] min-w-28"
                trigger={
                  <button
                    type="button"
                    aria-label={`Step ${step} of ${steps}, speed ${speed}×`}
                    className="h-7 rounded-xs px-2 type-meta-12 font-medium whitespace-nowrap text-muted tabular-nums hover:bg-inset hover:text-ink"
                  >
                    {`${step} of ${steps}`}
                    {speed === DEFAULT_SPEED ? null : (
                      <span className="text-faint">{` ${speed}×`}</span>
                    )}
                  </button>
                }
              >
                <MenuLabel>Speed</MenuLabel>
                <MenuRadioGroup
                  value={String(speed)}
                  onValueChange={(value) => {
                    const chosen = WALKTHROUGH_SPEEDS.find((each) => String(each) === value);
                    if (chosen !== undefined) {
                      on.speed(chosen);
                    }
                  }}
                >
                  {WALKTHROUGH_SPEEDS.map((each) => (
                    <MenuRadioItem key={each} value={String(each)}>
                      <span className="flex-1">{`${each}×`}</span>
                    </MenuRadioItem>
                  ))}
                </MenuRadioGroup>
              </Dropdown>
              <span className="ml-auto" />
              {card.failure === null ? null : (
                <Button size="small" onClick={on.retry}>
                  Retry
                </Button>
              )}
              {last ? (
                <IconButton label="Replay" size="small" onClick={on.replay}>
                  <RotateCcw className="size-4" />
                </IconButton>
              ) : (
                <IconButton label={paused ? "Play" : "Pause"} size="small" onClick={on.pause}>
                  {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
                </IconButton>
              )}
              {/* the last step offers the next Walkthrough as the one primary, and Done steps back */}
              <Tooltip label={<KeyHint label={next} keys={SHORTCUTS.next} />}>
                <Button
                  variant={upNext === null ? "primary" : "secondary"}
                  size="small"
                  className="min-w-12"
                  aria-keyshortcuts={shortcutKeys(SHORTCUTS.next)}
                  onClick={on.next}
                >
                  {next}
                </Button>
              </Tooltip>
              {upNext === null ? null : (
                <Button variant="primary" size="small" className="min-w-12" onClick={on.upNext}>
                  Next
                </Button>
              )}
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </>
  );
}
