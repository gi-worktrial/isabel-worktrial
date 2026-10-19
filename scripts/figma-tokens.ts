// the tokens as a payload for the Figma variables (Grounded Color in Light and Dark, Grounded Scale), printed as JSON
// for the apply snippet in docs/design-workflow.md; code is the source, so run this after any change to tokens.css or tokens-demo.css
// run with node
import { readTokenSheets, tokens } from "./design-spec.ts";

type ColorVariable = {
  name: string;
  web: string;
  scopes: string[];
  light: string;
  dark: string;
};
type FloatVariable = { name: string; web: string; scopes: string[]; value: number };

// Tailwind's whole spacing steps the code uses (1 = 4px); half steps fail repo/layout-spacing-scale
const SPACING_STEPS = [1, 2, 3, 4, 5, 6, 8, 10, 12];

// colors that paint words or glyphs as well as fills; tints, surfaces, lines and kit fills stay out of the text picker
const TEXT =
  /^(white|black|ink|muted|faint|on-primary|accent|success|danger|warning|teal|purple|[a-z]+-ink|branch-\d)$/u;

const px = (value: string) => Number(/^(\d+)px$/u.exec(value)?.[1] ?? Number.NaN);

const pair = (value: number) => value.toString(16).padStart(2, "0");

// #rrggbb, or #rrggbbaa from an rgb(r g b / a) wash; the two forms tokens.css uses, in the form Figma's hex reader takes
export function hex(value: string): string {
  if (/^#[\da-f]{6}$/iu.test(value)) {
    return value.toLowerCase();
  }
  const rgb = /^rgb\((\d+) (\d+) (\d+)(?: \/ ([\d.]+))?\)$/u.exec(value);
  if (rgb === null) {
    throw new Error(`Unreadable color ${value}`);
  }
  const alpha = rgb[4] === undefined ? "" : pair(Math.round(Number(rgb[4]) * 255));
  return `#${rgb
    .slice(1, 4)
    .map((part) => pair(Number(part)))
    .join("")}${alpha}`;
}

export function payload(tokenSheets: readonly string[]) {
  const all = tokens(tokenSheets);
  const colors: ColorVariable[] = all
    .filter(({ name }) => name.startsWith("color-"))
    .map(({ name, light, dark }) => {
      const short = name.slice("color-".length);
      return {
        name: `color/${short}`,
        web: `var(--${name})`,
        scopes: [
          "FRAME_FILL",
          "SHAPE_FILL",
          ...(TEXT.test(short) ? ["TEXT_FILL"] : []),
          "STROKE_COLOR",
        ],
        light: hex(light),
        dark: hex(dark ?? light),
      };
    });
  const scale: FloatVariable[] = [
    ...all
      .filter(({ name }) => name.startsWith("radius-"))
      .map(({ name, light }) => ({
        name: `radius/${name.slice("radius-".length)}`,
        web: `var(--${name})`,
        scopes: ["CORNER_RADIUS"],
        value: px(light),
      })),
    ...SPACING_STEPS.map((step) => ({
      name: `space/${step * 4}`,
      web: `calc(var(--spacing) * ${step})`,
      scopes: ["WIDTH_HEIGHT", "GAP"],
      value: step * 4,
    })),
    ...all
      .filter(({ name }) => name.startsWith("container-"))
      .map(({ name, light }) => ({
        name: `size/${name.slice("container-".length)}`,
        web: `var(--${name})`,
        scopes: ["WIDTH_HEIGHT"],
        value: px(light),
      })),
  ];
  const unreadable = scale.filter(({ value }) => Number.isNaN(value));
  if (unreadable.length > 0) {
    throw new Error(`Not a px value: ${unreadable.map(({ name }) => name).join(", ")}`);
  }
  return {
    color: { collection: "Grounded Color", modes: ["Light", "Dark"], variables: colors },
    scale: { collection: "Grounded Scale", variables: scale },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.stdout.write(`${JSON.stringify(payload(readTokenSheets()))}\n`);
}
