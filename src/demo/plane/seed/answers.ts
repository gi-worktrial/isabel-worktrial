// answers.json holds Pebble's answers to every page's suggested prompts, which demo-data composes from the seed's
// records, so a suggested prompt answers without a model
import { z } from "zod";

// answers are checked against Pebble's own answer schema on load
export function preparedAnswersSchema<Answer extends z.ZodType>(answer: Answer) {
  return z.strictObject({
    answers: z.array(
      z.strictObject({
        prompt: z.string().min(1),
        // words the screen names, each whole (the Issue, Candidate, run, session or Eval in view), and none for a
        // question about the whole Agent; the answer naming the most of them wins
        on: z.array(z.string().min(1)),
        answer,
      }),
    ),
  });
}
