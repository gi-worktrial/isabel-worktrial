import { expect, test } from "vitest";

import { parseRecordHref, recordHrefName } from "./record-href.ts";

const BASE = "https://app.test/acme/agents/support/issues/ISS-1";
const at = { orgId: "acme", agent: "support" };

test.each([
  ["/acme/agents/support/issues/ISS-2", { record: "issue", issue: "ISS-2" }],
  ["/acme/agents/support/issues/ISS-2/traces", { record: "issue", issue: "ISS-2" }],
  [
    "/acme/agents/support/issues/ISS-2/candidates/fix-a",
    { record: "candidate", issue: "ISS-2", candidate: "fix-a" },
  ],
  ["/acme/agents/support/traces/s1", { record: "trace", session: "s1", trace: undefined }],
  ["/acme/agents/support/traces/s1/t1", { record: "trace", session: "s1", trace: "t1" }],
  ["/acme/agents/support/evals/greets", { record: "eval", eval: "greets" }],
  ["/acme/agents/support/evals/greets/runs", { record: "eval", eval: "greets" }],
  ["/acme/agents/support/runs/r1", { record: "run", run: "r1" }],
])("%s links to its record", (href, record) => {
  expect(parseRecordHref(href, BASE)).toEqual({ ...at, href, ...record });
});

test("relative and absolute links on the page's origin resolve, keeping search and hash", () => {
  expect(parseRecordHref("candidates/fix-a?x=1#y", `${BASE}/`)).toMatchObject({
    record: "candidate",
    candidate: "fix-a",
    href: "/acme/agents/support/issues/ISS-1/candidates/fix-a?x=1#y",
  });
  expect(parseRecordHref("../evals/greets", `${BASE}/traces`)).toBeUndefined();
  expect(parseRecordHref("../evals/greets", BASE)).toMatchObject({ eval: "greets" });
  expect(parseRecordHref("https://app.test/acme/agents/support/runs/r1", BASE)).toMatchObject({
    run: "r1",
  });
  expect(parseRecordHref("/acme/agents/support/issues/ISS%202", BASE)).toMatchObject({
    issue: "ISS 2",
  });
});

test.each([
  "https://example.com/acme/agents/support/issues/ISS-2",
  "mailto:someone@example.com",
  "#notes",
  "/acme/agents/support/issues",
  "/acme/agents/support/issues/ISS-2/candidates/compare",
  "/acme/agents/support/issues/ISS-2/debug/candidates/fix-a",
  "/acme/agents/support/jobs/run-evals",
  "/acme/settings",
  "/acme/agents/support/issues/%E0%A4%A",
])("%s stays a plain link", (href) => {
  expect(parseRecordHref(href, BASE)).toBeUndefined();
});

test("a chip names its record when the link's words are its URL", () => {
  const name = (href: string) => {
    const link = parseRecordHref(href, BASE);
    return link === undefined ? undefined : recordHrefName(link);
  };
  expect(name("/acme/agents/support/issues/ISS-2")).toBe("ISS-2");
  expect(name("/acme/agents/support/traces/s1/0123456789")).toBe("Trace 01234567");
  expect(name("/acme/agents/support/runs/abcdef0123")).toBe("Run abcdef01");
});
