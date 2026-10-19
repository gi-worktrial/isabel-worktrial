// walkthroughs.json holds finished plans so the player builds nothing
import { z } from "zod";

// Play all's order, then the features in Get started's order
export const STORY_IDS = ["tour", "happy", "dismiss", "debug", "evals", "resurfaced"] as const;
const FEATURE_IDS = [
  "compare",
  "pebble",
  "traces",
  "grounded-evals",
  "automations",
  "settings",
] as const;
// a presenter plays these on a call, so Get started's progress leaves them out
const PRESENTER_IDS = ["demo"] as const;
export const WALKTHROUGH_IDS = [...PRESENTER_IDS, ...STORY_IDS, ...FEATURE_IDS] as const;
export type WalkthroughId = (typeof WALKTHROUGH_IDS)[number];

/** Group ids stay stable while their labels and order come from the authored plans. */
export const WalkthroughGroupSchema = z.enum(["story", "features"]);

const ROLES = [
  "alertdialog",
  "article",
  "button",
  "checkbox",
  "columnheader",
  "combobox",
  "dialog",
  "group",
  "link",
  "list",
  "menu",
  "menuitem",
  "menuitemradio",
  "navigation",
  "option",
  "radio",
  "radiogroup",
  "region",
  "row",
  "rowgroup",
  "status",
  "table",
  "textbox",
] as const;
type WalkthroughRole = (typeof ROLES)[number];

// found by role and accessible name the way the journeys find it
export interface WalkthroughTarget {
  role: WalkthroughRole;
  name: string;
  // for a name that is not unique on the page
  within?: WalkthroughTarget | undefined;
  // a regex for words shown besides the name, like a Recommended tag
  shows?: string | undefined;
  // the last match, as for the newest Pebble answer
  last?: true | undefined;
}
const TargetSchema: z.ZodType<WalkthroughTarget> = z.lazy(() =>
  z.strictObject({
    role: z.enum(ROLES),
    name: z.string().min(1),
    within: TargetSchema.optional(),
    shows: z.string().min(1).optional(),
    last: z.literal(true).optional(),
  }),
);

/** Role selectors treat slash-delimited names as regular expressions. */
export function walkthroughName(name: string): string | RegExp {
  const source = /^\/(.+)\/$/su.exec(name)?.[1];
  return source === undefined ? name : new RegExp(source, "u");
}

/** Rejects malformed selectors before a plan reaches the browser. */
export function targetProblems(target: WalkthroughTarget): string[] {
  const problems: string[] = [];
  try {
    walkthroughName(target.name);
  } catch {
    problems.push(`${target.role} "${target.name}" has an invalid name selector`);
  }
  if (target.shows !== undefined) {
    try {
      RegExp(target.shows, "u");
    } catch {
      problems.push(`${target.role} "${target.name}" has an invalid display selector`);
    }
  }
  return [...problems, ...(target.within === undefined ? [] : targetProblems(target.within))];
}

// recorded answers are checked against Pebble's own answer schema on load
export function walkthroughsSchema<Answer extends z.ZodType>(answer: Answer) {
  const act = z.union([
    z.enum(["click", "key ⌘K"]),
    // a field takes the words as its value, and a code editor types them at the end of its file
    z.strictObject({ fill: z.string() }),
    // the recorded answer plays when live Pebble is silent, or always with only
    z.strictObject({
      ask: z.string().min(1),
      issueId: z.string().min(1),
      // Pebble's messages as Pi writes them, then its chips
      recorded: answer,
      only: z.literal(true).optional(),
    }),
  ]);
  const beat = z.strictObject({
    target: TargetSchema,
    // opens a hidden target's container without toggling one that is already visible
    reveal: TargetSchema.optional(),
    act: act.optional(),
    // click after the caption and wait for the next page
    go: z.literal(true).optional(),
    // done at once with no words, like opening a tab before the step shows it
    quiet: z.literal(true).optional(),
    // only when longer than the player's own wait
    waitMs: z.number().int().positive().optional(),
  });
  const walkthrough = z.strictObject({
    id: z.enum(WALKTHROUGH_IDS),
    name: z.string().min(1),
    group: WalkthroughGroupSchema,
    // Get started folds a Feature's Walkthroughs under its topic
    topic: z.string().min(1).optional(),
    purpose: z.string().min(1),
    minutes: z.number().int().positive(),
    start: z.enum(["inbox", "traces", "evals", "automations"]),
    needs: z.array(z.literal("pebble")),
    // each caption holds until Next, so a presenter talks over it, and Play all leaves it out
    waits: z.literal(true).optional(),
    // steps are empty when this Agent cannot play it
    unavailable: z.string().min(1).optional(),
    steps: z.array(z.strictObject({ caption: z.string().min(1), beats: z.array(beat).min(1) })),
  });
  return z.strictObject({
    agent: z.strictObject({ agentId: z.string(), name: z.string() }),
    groups: z
      .array(z.strictObject({ id: WalkthroughGroupSchema, label: z.string().min(1) }))
      .length(WalkthroughGroupSchema.options.length)
      .refine((groups) => new Set(groups.map(({ id }) => id)).size === groups.length),
    timing: z.strictObject({
      captionMinMs: z.number().int().positive(),
      wordMs: z.number().int().positive(),
      preparationMs: z.number().int().positive(),
      restMs: z.number().int().positive(),
    }),
    walkthroughs: z.array(walkthrough),
  });
}

// tests seed this key directly
export const GET_STARTED_KEY = "grounded.get-started.v3";
