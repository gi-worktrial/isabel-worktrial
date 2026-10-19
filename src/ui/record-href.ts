/** A link to one of an Agent's records, as its in-app route names it. */
export type RecordHref = {
  orgId: string;
  agent: string;
  /** The path with its search and hash, to navigate to in the app. */
  href: string;
} & (
  | { record: "issue"; issue: string }
  | { record: "candidate"; issue: string; candidate: string }
  | { record: "trace"; session: string; trace: string | undefined }
  | { record: "eval"; eval: string }
  | { record: "run"; run: string }
);

// an Issue's tabs still name the Issue, and Compare is no Candidate
const ISSUE_TABS = new Set(["traces", "evals", "candidates", "activity"]);
const EVAL_TABS = new Set(["runs"]);

/** The record an href links to, resolved against `base` (the page's URL) and only on its origin, else undefined. */
export function parseRecordHref(href: string, base: string): RecordHref | undefined {
  // an anchor stays on the page it's on
  if (href.startsWith("#")) {
    return undefined;
  }
  let url: URL;
  let parts: string[];
  try {
    url = new URL(href, base);
    parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  } catch {
    return undefined;
  }
  if (url.origin !== new URL(base).origin) {
    return undefined;
  }

  const [orgId, agents, agent, kind, id, ...rest] = parts;
  if (orgId === undefined || agents !== "agents" || agent === undefined || id === undefined) {
    return undefined;
  }
  const at = { orgId, agent, href: `${url.pathname}${url.search}${url.hash}` };
  const [tab, more] = rest;
  switch (kind) {
    case "issues":
      if (tab === undefined || (more === undefined && ISSUE_TABS.has(tab))) {
        return { ...at, record: "issue", issue: id };
      }
      return tab === "candidates" && more !== undefined && more !== "compare" && rest.length === 2
        ? { ...at, record: "candidate", issue: id, candidate: more }
        : undefined;
    case "traces":
      return rest.length <= 1 ? { ...at, record: "trace", session: id, trace: tab } : undefined;
    case "evals":
      return tab === undefined || (more === undefined && EVAL_TABS.has(tab))
        ? { ...at, record: "eval", eval: id }
        : undefined;
    case "runs":
      return tab === undefined ? { ...at, record: "run", run: id } : undefined;
    default:
      return undefined;
  }
}

/** A record's name on its chip when the link's own words are only its URL. */
export function recordHrefName(link: RecordHref): string {
  switch (link.record) {
    case "issue":
      return link.issue;
    case "candidate":
      return `Candidate ${link.candidate}`;
    case "trace":
      return `Trace ${(link.trace ?? link.session).slice(0, 8)}`;
    case "eval":
      return `Eval ${link.eval}`;
    case "run":
      return `Run ${link.run.slice(0, 8)}`;
  }
}
