import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { CandidateCompare } from "#src/features/candidates/candidate-compare";
import { runEvalsQuery } from "#src/queries/extra";
import { crumbs } from "#/crumbs";
import { candidatesQuery } from "#/queries";
import { EmptyState } from "#/ui/empty-state";

export const Route = createFileRoute("/$orgId/agents/$agent/issues/$issue/candidates/compare")({
  validateSearch: z.object({ a: z.string().optional(), b: z.string().optional() }),
  loader: async ({ context: { queryClient }, params }) => {
    const candidates = await queryClient.ensureQueryData(candidatesQuery(params));
    // each side's Eval results, so the Evals that differ show at once
    await Promise.all(
      candidates.flatMap(({ results }) =>
        results === undefined
          ? []
          : [
              queryClient.ensureQueryData(
                runEvalsQuery({ ...params, run: results.run.id, sha: results.run.sha }),
              ),
            ],
      ),
    );
    return crumbs({
      label: "Compare",
      to: "/$orgId/agents/$agent/issues/$issue/candidates/compare",
    });
  },
  component: ComparePage,
});

function ComparePage() {
  const params = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const candidates = useSuspenseQuery(candidatesQuery(params)).data;
  const pick = (id: string | undefined, fallback: number) =>
    candidates.find((candidate) => candidate.id === id) ?? candidates[fallback];
  const a = pick(search.a, 0);
  const b = pick(search.b, 1);

  // the Candidates tab above and the page path are the way back
  return (
    <section aria-label="Compare Candidates" className="flex flex-col">
      {a === undefined || b === undefined ? (
        <div className="card">
          <EmptyState
            title="Compare needs two Candidates"
            description="Save an edit in Debug as a new Candidate to compare it with this one."
          />
        </div>
      ) : (
        <CandidateCompare
          candidates={candidates}
          a={a}
          b={b}
          onPick={(side, id) =>
            void navigate({ search: { a: a.id, b: b.id, [side]: id }, replace: true })
          }
        />
      )}
    </section>
  );
}
