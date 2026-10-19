// the Trace pages' crumb labels, kept apart from the pages so the route loaders that name them stay small
import type { Turn } from "#src/sdk/agents";

const CRUMB_LENGTH = 60;

/** A session's title cut to fit the page path, whose last crumb truncates the rest. */
export const crumbTitle = (title: string) =>
  title.length > CRUMB_LENGTH ? `${title.slice(0, CRUMB_LENGTH).trimEnd()}…` : title;

/** The page path's name for a turn: "Turn 4", or its Trace ID when it isn't among the session's first turns. */
export const turnCrumb = (turns: readonly Turn[], trace: string) => {
  const turn = turns.find(({ trace_id }) => trace_id === trace);
  return turn === undefined ? `Trace ${trace.slice(0, 8)}` : `Turn ${turn.position}`;
};
