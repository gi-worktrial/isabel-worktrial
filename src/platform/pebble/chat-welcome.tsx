import { useEffect, useRef, useState } from "react";

import { cn } from "#/ui/cn";
import { PebbleMark, type PebbleLook } from "#/ui/marks";

const TAGLINES = [
  "Find your next step with Pebble.",
  "Take a closer look with Pebble.",
  "Make sense of it with Pebble.",
  "Turn insights into action with Pebble.",
];

/** Pointer distance, in CSS pixels, at which the eyes reach their furthest cell. */
const LOOK_REACH_PX = 160;
const EYE_TRAVEL = { x: 2, y: 1 };

function eyeOffset(distance: number, travel: number) {
  return Math.round(Math.max(-1, Math.min(1, distance / LOOK_REACH_PX)) * travel);
}

const HOP_MS = 1600;
const IDLE_MS = 5400;
const HOP_OUT_MS = 420;
const FRAME_MS = 40;
/** How high the hop lifts, as a fraction of the pebble's height. */
const HOP_HEIGHT = 0.42;
const IDLE_BREATHS = 3;
const IDLE_SQUASH = 0.025;
const IDLE_LEAN_DEG = 2;
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

type Pose = { squash: number; lift: number; lean: number };

function smoothstep(t: number) {
  return t * t * (3 - 2 * t);
}

/** Squash (positive flattens, negative stretches) and lift at `t` from 0 to 1 through a hop. */
function hopAt(t: number): Pose {
  if (t < 0.14) {
    return { squash: 0.14 * smoothstep(t / 0.14), lift: 0, lean: 0 };
  }
  if (t < 0.22) {
    return { squash: 0.14 - 0.26 * smoothstep((t - 0.14) / 0.08), lift: 0, lean: 0 };
  }
  if (t < 0.58) {
    const p = (t - 0.22) / 0.36;
    const squash = p < 0.5 ? -0.12 * (1 - 2 * p) : -0.07 * (2 * p - 1);
    return { squash, lift: 4 * p * (1 - p), lean: 0 };
  }

  const p = (t - 0.58) / 0.42;
  return { squash: 0.18 * Math.exp(-5 * p) * Math.cos(3.2 * Math.PI * p), lift: 0, lean: 0 };
}

/** Breathing and a slow lean at `t` from 0 to 1 through one idle cycle. */
function idleAt(t: number): Pose {
  return {
    squash: IDLE_SQUASH * Math.sin(2 * Math.PI * IDLE_BREATHS * t),
    lift: 0,
    lean: IDLE_LEAN_DEG * Math.sin(2 * Math.PI * t),
  };
}

/** Samples `poseAt` every frame, since a few eased keyframes stall at each one. */
function sampleFrames(durationMs: number, poseAt: (t: number) => Pose): Keyframe[] {
  const frames: Keyframe[] = [];
  for (let ms = 0; ms <= durationMs; ms += FRAME_MS) {
    const { squash, lift, lean } = poseAt(ms / durationMs);
    const scaleY = 1 - squash;
    frames.push({
      offset: ms / durationMs,
      transform: `translateY(${-lift * HOP_HEIGHT * 100}%) skewX(${lean}deg) scale(${scaleY ** -0.8}, ${scaleY})`,
    });
  }
  return frames;
}

const HOP_FRAMES = sampleFrames(HOP_MS, hopAt);
const IDLE_FRAMES = sampleFrames(IDLE_MS, idleAt);

function WatchingPebble({ leaving, onLeft }: { leaving: boolean; onLeft: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [look, setLook] = useState<PebbleLook>({ x: 0, y: 0 });

  useEffect(() => {
    if (leaving) {
      return;
    }

    function onPointerMove(event: PointerEvent) {
      if (!ref.current) {
        return;
      }

      const box = ref.current.getBoundingClientRect();
      const x = eyeOffset(event.clientX - (box.left + box.width / 2), EYE_TRAVEL.x);
      const y = eyeOffset(event.clientY - (box.top + box.height / 2), EYE_TRAVEL.y);
      setLook((current) => (current.x === x && current.y === y ? current : { x, y }));
    }

    window.addEventListener("pointermove", onPointerMove);
    return () => window.removeEventListener("pointermove", onPointerMove);
  }, [leaving]);

  useEffect(() => {
    const element = ref.current;
    if (!element || matchMedia(REDUCED_MOTION).matches) {
      return;
    }

    const hop = element.animate(HOP_FRAMES, HOP_MS);
    const idle = element.animate(IDLE_FRAMES, {
      duration: IDLE_MS,
      delay: HOP_MS,
      iterations: Infinity,
    });
    return () => {
      hop.cancel();
      idle.cancel();
    };
  }, []);

  useEffect(() => {
    const element = ref.current;
    if (!leaving || !element) {
      return;
    }
    if (matchMedia(REDUCED_MOTION).matches) {
      onLeft();
      return;
    }

    const from = getComputedStyle(element).transform;
    element.getAnimations().forEach((animation) => animation.pause());
    const hopOut = element.animate(
      [
        { transform: from },
        { offset: 0.3, transform: "scale(1.14, 0.84)", opacity: 1 },
        { offset: 0.55, transform: "translateY(-30%) scale(0.88, 1.14)", opacity: 1 },
        { transform: "translateY(-110%) scale(0.94, 1.06)", opacity: 0 },
      ],
      { duration: HOP_OUT_MS, easing: "ease-in", fill: "forwards" },
    );
    hopOut.finished.then(onLeft, () => {});
    return () => hopOut.cancel();
  }, [leaving, onLeft]);

  return (
    <div ref={ref} className="origin-bottom text-accent">
      <PebbleMark cell={4} look={look} />
    </div>
  );
}

/** Hops in on mount; `leaving` hops it out, then `onLeft` lets the conversation take its place. */
export function ChatWelcome({ leaving, onLeft }: { leaving: boolean; onLeft: () => void }) {
  const [tagline] = useState(() => TAGLINES[Math.floor(Math.random() * TAGLINES.length)]);

  return (
    <div className="mx-auto flex w-full max-w-(--chat-width) shrink-0 flex-col items-center gap-4 px-6 pb-6 text-center enter-fade">
      <WatchingPebble leaving={leaving} onLeft={onLeft} />
      <h2
        className={cn(
          "type-title-18 transition-opacity duration-200 in-[[data-layout=dock]]:hidden",
          leaving && "opacity-0",
        )}
      >
        {tagline}
      </h2>
    </div>
  );
}
