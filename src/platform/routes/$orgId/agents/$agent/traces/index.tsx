import { useSuspenseQuery } from "@tanstack/react-query";
import { SESSION_PAGE_SIZE, annotationCountsQuery, sessionsQuery } from "#/queries";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  type AnnotationCounts,
  FAIL_LABEL,
  PASS_LABEL,
  getIssueMatchFilter,
  isGroundedAnnotation,
} from "@grounded-intelligence/grounded-sdk";
import { X } from "lucide-react";
import { z } from "zod";

import { SessionTable } from "../../../../../session-table";
import { EmptyState } from "#/ui/empty-state";
import { SearchField } from "#/ui/search-field";
import { SegmentedControl } from "#/ui/segmented-control";
import { crumbs } from "#/crumbs";
import { AnnotationFilters } from "#src/features/traces/filters";
import { sourceCounts } from "#src/features/traces/list";

const SOURCES = [
  { value: "production", label: "Production" },
  { value: "eval", label: "Eval runs" },
] as const;

// `afters` holds each earlier page's cursor, oldest first, so Previous pops one.
const searchSchema = z.object({
  q: z.string().regex(/\S/).optional(),
  source: z.enum(["production", "eval"]).optional(),
  annotation: z.string().optional(),
  issue: z.string().optional(),
  afters: z.array(z.string()).optional(),
});

type Search = z.infer<typeof searchSchema>;

const annotationFilters = ({ annotation, issue }: Search) => {
  const filters = annotation === undefined ? [] : [annotation];
  if (issue !== undefined) {
    filters.push(getIssueMatchFilter(issue));
  }

  return filters.length > 0 ? filters : undefined;
};

const tracesPageQuery = (orgId: string, agent: string, search: Search) =>
  sessionsQuery({
    orgId,
    agent,
    q: search.q,
    trial: search.source === "eval",
    annotation: annotationFilters(search),
    after: search.afters?.at(-1),
    limit: SESSION_PAGE_SIZE,
  });

function outcomeWords(label: string) {
  switch (label) {
    case PASS_LABEL:
      return "Passed";
    case FAIL_LABEL:
      return "Failed";
    default:
      return undefined;
  }
}

/** The agent's own annotations by name, split into pass-or-fail outcomes and other tags. */
function sectionsOf(counts: AnnotationCounts["counts"]) {
  const judgments = counts.filter(({ name }) => !isGroundedAnnotation(name));
  const names = [...new Set(judgments.map(({ name }) => name))];
  const criteria = names.map((name) => ({
    name,
    counts: judgments.filter((row) => row.name === name),
  }));
  const isOutcome = ({ counts }: (typeof criteria)[number]) =>
    counts.every(({ label }) => outcomeWords(label) !== undefined);
  return [
    { title: "Outcome", criteria: criteria.filter(isOutcome) },
    { title: "Tags", criteria: criteria.filter((criterion) => !isOutcome(criterion)) },
  ].filter((section) => section.criteria.length > 0);
}

export const Route = createFileRoute("/$orgId/agents/$agent/traces/")({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ context: { queryClient }, params: { orgId, agent }, deps }) => {
    await Promise.all([
      queryClient.ensureQueryData(tracesPageQuery(orgId, agent, deps)),
      queryClient.ensureQueryData(annotationCountsQuery({ orgId, agent })),
    ]);
    return crumbs({ label: "Traces", to: "/$orgId/agents/$agent/traces" });
  },
  component: Traces,
});

function Traces() {
  const { orgId, agent } = Route.useParams();
  const search = Route.useSearch();
  const page = useSuspenseQuery(tracesPageQuery(orgId, agent, search)).data;
  const sections = sectionsOf(
    sourceCounts(search, useSuspenseQuery(annotationCountsQuery({ orgId, agent })).data.counts),
  );
  const navigate = useNavigate({ from: Route.fullPath });
  const afters = search.afters ?? [];
  const filtered =
    search.q !== undefined || search.annotation !== undefined || search.issue !== undefined;
  const filter = (changes: Partial<Search>) =>
    void navigate({
      search: (prev) => ({ ...prev, ...changes, afters: undefined }),
      replace: true,
    });

  return (
    <div className="flex flex-col gap-3">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="type-title-18 text-ink">Traces</h1>
        <div role="group" aria-label="Filters" className="flex flex-1 basis-96 flex-wrap items-center gap-2">
          <SegmentedControl
            label="Source"
            value={search.source ?? "production"}
            segments={SOURCES}
            onChange={(source) => filter({ source: source === "production" ? undefined : source })}
          />
          <AnnotationFilters
            sections={sections}
            annotation={search.annotation}
            onFilter={(annotation) => filter({ annotation })}
          />
          {search.issue !== undefined && (
            <button
              type="button"
              aria-label={`Clear Issue ${search.issue}`}
              onClick={() => filter({ issue: undefined })}
              className="inline-flex h-8 items-center gap-1.5 rounded-sm bg-inset px-2.5 type-label-13 text-ink hover:bg-subtle"
            >
              Issue {search.issue}
              <X className="size-3.5 text-muted" />
            </button>
          )}
          <SearchField
            label="Search Traces"
            placeholder="Search Traces"
            value={search.q ?? ""}
            onChange={(q) => filter({ q: /\S/.test(q) ? q : undefined })}
            className="ml-auto w-64 max-w-full"
          />
        </div>
      </header>
      <div className="flex items-start gap-4">
        <SessionTable
          orgId={orgId}
          agent={agent}
          page={page}
          source={search.source ?? "production"}
          afters={afters}
          empty={
            filtered ? (
              <EmptyState title="No Traces match" onClear={() => void navigate({ search: {} })} />
            ) : (
              <EmptyState
                title="No Traces yet"
                description="Traces join a session when their root span sets gen_ai.conversation.id."
              />
            )
          }
        />
      </div>
    </div>
  );
}
