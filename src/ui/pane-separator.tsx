import type { Ref } from "react";
import { Separator } from "react-resizable-panels";

// an 8px gutter between the panes, with platform's grip in its middle: always shown, inked on
// hover and focus, longer while dragged
const SEPARATOR =
  "relative w-2 shrink-0 cursor-col-resize outline-none after:absolute after:top-1/2 after:left-1/2 after:h-8 after:w-1 after:-translate-1/2 after:rounded-full after:bg-divider-strong motion-safe:after:transition-[background-color,height] motion-safe:after:duration-120 motion-safe:after:ease-out focus-visible:after:bg-ring data-[separator=active]:after:h-12 data-[separator=active]:after:bg-ring data-[separator=hover]:after:bg-ring";

export function PaneSeparator({ label, ref }: { label: string; ref?: Ref<HTMLDivElement> }) {
  return <Separator aria-label={label} elementRef={ref} className={SEPARATOR} />;
}
