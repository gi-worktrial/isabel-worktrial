import grounded from "#/assets/grounded-mark-04-black.png";
import github from "#/assets/github-mark.svg";
import pebble from "#/assets/pebble.svg";

/** An image drawn in the text color, so it shows in either theme. */
function Masked({
  src,
  width,
  height,
  label,
  className = "",
}: {
  src: string;
  width: number;
  height: number;
  label?: string;
  className?: string;
}) {
  return (
    <span
      role={label === undefined ? undefined : "img"}
      aria-label={label}
      aria-hidden={label === undefined ? true : undefined}
      className={`inline-block shrink-0 bg-current ${className}`}
      style={{ width, height, mask: `url("${src}") center / contain no-repeat` }}
    />
  );
}

export function GroundedMark({ size = 22 }: { size?: number }) {
  return <Masked src={grounded} width={size} height={size} label="Grounded" className="text-ink" />;
}

const PEBBLE_COLUMNS = 14;
const PEBBLE_ROWS = 10;
const EYE_ROW = 5;
const EYE_COLUMNS = [7, 10];

/** How far the eyes are shifted from center, in grid cells. */
export type PebbleLook = { x: number; y: number };

const AHEAD: PebbleLook = { x: 0, y: 0 };

/** `pebble.svg` in the text color, `cell` CSS pixels per square, with each eye cut out by a square mask layer. */
export function PebbleMark({
  cell = 1,
  look = AHEAD,
  className = "",
}: {
  cell?: number;
  look?: PebbleLook;
  className?: string;
}) {
  const eyes = EYE_COLUMNS.map(
    (column) => `${(column + look.x) * cell}px ${(EYE_ROW + look.y) * cell}px`,
  );

  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 bg-current ${className}`}
      style={{
        width: PEBBLE_COLUMNS * cell,
        height: PEBBLE_ROWS * cell,
        maskImage: `linear-gradient(#000 0 0), linear-gradient(#000 0 0), url("${pebble}")`,
        maskPosition: `${eyes.join(", ")}, 0 0`,
        maskSize: `${cell}px ${cell}px, ${cell}px ${cell}px, 100% 100%`,
        maskRepeat: "no-repeat",
        maskComposite: "exclude, exclude, add",
      }}
    />
  );
}

export function GitHubMark({ className = "" }: { className?: string }) {
  return <Masked src={github} width={14} height={14} className={className} />;
}
