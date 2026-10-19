import type { Phase } from "#/issue-view";
import type { Issue } from "#src/sdk/issues";
import { AskPebble } from "#src/ui/ask-pebble";

// each step's question, as the mark's tooltip and the prompt it fills
const STEP_PROMPTS = {
  review: {
    label: "Ask Pebble which Candidate to approve",
    prompt: ({ id }: Issue) => `Which Candidate for ${id} should I approve, and why?`,
  },
  deploy: {
    label: "Ask Pebble what to check before shipping",
    prompt: ({ id, approved }: Issue) =>
      `What should I check before shipping ${approved?.candidate ?? `the fix for ${id}`}?`,
  },
} as const satisfies Record<Phase, { label: string; prompt(issue: Issue): string }>;

/** A small Ask Pebble mark beside the Issue's current step, about that step; the step's own tooltip says what it means. */
export function AskPebbleStep({ issue, phase }: { issue: Issue; phase: Phase }) {
  const { label, prompt } = STEP_PROMPTS[phase];
  return <AskPebble iconOnly label={label} prompt={prompt(issue)} className="size-6" />;
}
