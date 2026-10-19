import { Columns2 } from "lucide-react";
import {
  type PointerEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { IconButton } from "#/ui/button";
import { cn } from "#/ui/cn";
import { Dropdown, MenuItem } from "#/ui/menu";

/** Where a dragged pane lands: docked at an edge, or made the wide one in the middle. */
export type PaneZone = "left" | "center" | "right";

export interface PaneAction {
  label: string;
  icon: ReactNode;
  run(): void;
}

const ZONES = ["left", "center", "right"] as const;
// the edge zones each take a quarter of the panes, as the drop grid draws them
const EDGE_SHARE = 0.25;
// a press moves this far before it counts as a drag, so a click stays a click
const DRAG_START_PX = 6;
const OWN_PRESS = 'a, button, input, textarea, select, [role="button"]';

const swallow = (click: MouseEvent) => click.stopPropagation();

/** A pane's layout actions behind one icon in its header. */
export function PaneMenu({ label, actions }: { label: string; actions: readonly PaneAction[] }) {
  return (
    <Dropdown
      align="end"
      trigger={
        <IconButton label={label} size="small">
          <Columns2 className="size-4" />
        </IconButton>
      }
    >
      {actions.map(({ label: name, icon, run }) => (
        <MenuItem key={name} onSelect={run}>
          <span
            aria-hidden="true"
            className="flex size-4 shrink-0 items-center justify-center text-muted [&>svg]:size-4"
          >
            {icon}
          </span>
          {name}
        </MenuItem>
      ))}
    </Dropdown>
  );
}

/** Drags a pane by its header over `area`, which shows the zones it can land in; Escape cancels. */
export function usePaneDrag<Pane extends string>(
  area: RefObject<HTMLElement | null>,
  onDrop: (pane: Pane, zone: PaneZone) => void,
) {
  const [drag, setDrag] = useState<{ pane: Pane; zone: PaneZone }>();
  const dropped = useRef(onDrop);
  const stop = useRef<() => void>(undefined);
  useLayoutEffect(() => {
    dropped.current = onDrop;
  });
  useEffect(() => () => stop.current?.(), []);

  const zoneAt = (x: number): PaneZone => {
    const box = area.current?.getBoundingClientRect();
    if (box === undefined) {
      return "center";
    }
    const at = (x - box.left) / box.width;
    return at < EDGE_SHARE ? "left" : at > 1 - EDGE_SHARE ? "right" : "center";
  };

  function start(pane: Pane, event: PointerEvent<HTMLElement>) {
    const target = event.target instanceof Element ? event.target : null;
    if (event.button !== 0 || target === null || target.closest(OWN_PRESS) !== null) {
      return;
    }
    // no text selection while the header is held
    event.preventDefault();
    const from = { x: event.clientX, y: event.clientY };
    let zone: PaneZone | undefined;
    const move = (moved: globalThis.PointerEvent) => {
      if (
        zone === undefined &&
        Math.hypot(moved.clientX - from.x, moved.clientY - from.y) < DRAG_START_PX
      ) {
        return;
      }
      zone = zoneAt(moved.clientX);
      setDrag({ pane, zone });
    };
    const end = (land: boolean) => {
      stop.current?.();
      setDrag(undefined);
      if (zone === undefined) {
        return;
      }
      // the release still clicks whatever it is over, which must not act as a click of its own
      window.addEventListener("click", swallow, { capture: true, once: true });
      window.setTimeout(() => window.removeEventListener("click", swallow, { capture: true }));
      if (land) {
        dropped.current(pane, zone);
      }
    };
    const up = () => end(true);
    const cancel = () => end(false);
    const key = (pressed: KeyboardEvent) => {
      if (pressed.key === "Escape") {
        pressed.preventDefault();
        pressed.stopPropagation();
        end(false);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", key, { capture: true });
    stop.current = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key, { capture: true });
      stop.current = undefined;
    };
  }

  return { drag, start };
}

/** The zones a dragged pane can land in, laid over the panes, the one under the pointer picked. */
export function PaneDropZones({
  zone,
  labels,
}: {
  zone: PaneZone;
  labels: Record<PaneZone, string>;
}) {
  return (
    <div
      role="status"
      aria-label={`Drop to ${labels[zone].toLowerCase()}`}
      className="absolute inset-0 z-30 grid cursor-grabbing grid-cols-[1fr_2fr_1fr] gap-2 bg-subtle/30 p-2"
    >
      {ZONES.map((each) => (
        <div
          key={each}
          className={cn(
            "flex items-center justify-center rounded-sm border border-dashed type-label-13 font-medium motion-safe:transition-colors",
            each === zone
              ? "border-accent bg-selection text-accent-ink"
              : "border-divider-strong bg-surface/50 text-muted",
          )}
        >
          {labels[each]}
        </div>
      ))}
    </div>
  );
}
