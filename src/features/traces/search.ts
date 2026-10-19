// the search our additions read on platform's session, run and Eval Runs pages; route options load with the first page,
// so this stays apart from the components that read it
import { z } from "zod";

/** The session page's search beside platform's `after`: the step a link opens at, and the Flow view. */
export const SESSION_VIEW_SEARCH = {
  step: z.string().optional(),
  view: z.literal("flow").optional(),
};

/** The compared trials on a run's or Eval's page. */
export const TRIALS_SEARCH = { trials: z.array(z.string()).optional() };
