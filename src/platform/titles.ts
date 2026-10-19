import { type Job, type SessionSummary, messageText } from "@grounded-intelligence/grounded-sdk";

import { flat } from "#/ui/format";

// the titles route loaders name their crumbs with, apart from the pages that render them, so a loader keeps its
// page lazy instead of pulling the trace view (with Markdown) or Automations (with cronstrue) into the first load

/** A session's first input on one line, or its ID when the agent doesn't export content. */
export function sessionTitle(session: SessionSummary) {
  return flat(messageText(session.first_input)) || session.session_id;
}

export const jobTitle = (job: Job) =>
  (job.state === "active" ? job.display_name : null) ?? job.name;
