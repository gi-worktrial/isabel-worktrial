import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import {
  SESSION_PAGE_SIZE,
  baselineRunQuery,
  candidatesQuery,
  debugEvalsQuery,
  issueQuery,
  issueTracesQuery,
  useAgentRepo,
} from "#/queries";
import {
  EVALS_DIR,
  EVAL_REGISTRY_PATH,
  GroundedError,
  getEvalsBranchById,
} from "@grounded-intelligence/grounded-sdk";
import { Link, createFileRoute } from "@tanstack/react-router";

import { FileDiffs } from "#/file-diffs";
import { debugSearchSchema } from "#/debug-search";
import { DebugViews } from "#/debug-views";
import { FileEditor } from "#/file-editor";
import { useIssue } from "#/issue-view";
import { usePebbleDock, usePebblePage } from "#/pebble/page";
import { RunStatusTag } from "#/run-status";
import { Button, buttonVariants } from "#/ui/button";
import { Tag } from "#/ui/tag";
import { crumbs } from "#/crumbs";
import { BranchSwitcher } from "#src/features/candidates/branches";
import { DebugBand } from "#src/features/debug/debug-band";
import { useDebugDiff } from "#src/features/debug/debug-diff";
import { BaselineGrades } from "#src/features/debug/eval-grades";

const BRANCH_MOVED_STATUS = 409;
const DEBUG_PROMPTS = [
  "Which of this Issue's Evals check the wrong thing?",
  "Fix the failing Eval's judge prompt",
];
const NEW_EVAL_PROMPT = "Write a New Eval for this Issue: ";

export const Route = createFileRoute("/$orgId/agents/$agent/issues/$issue_/debug/evals")({
  staticData: { rail: true },
  validateSearch: debugSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ context: { queryClient }, params, deps }) => {
    const [, , issue] = await Promise.all([
      queryClient.ensureQueryData(debugEvalsQuery(params)),
      queryClient.ensureQueryData(baselineRunQuery(params)),
      queryClient.ensureQueryData(issueQuery(params)),
      queryClient.ensureQueryData(candidatesQuery(params)),
      deps.view === "traces" &&
        queryClient.ensureQueryData(
          issueTracesQuery({ ...params, after: deps.afters?.at(-1), limit: SESSION_PAGE_SIZE }),
        ),
    ]);
    return crumbs(
      { label: "Inbox", to: "/$orgId/agents/$agent/issues" },
      { label: issue.id, to: "/$orgId/agents/$agent/issues/$issue" },
      { label: "Evals", to: "/$orgId/agents/$agent/issues/$issue/evals" },
      { label: "Debugging", to: "/$orgId/agents/$agent/issues/$issue/debug/evals" },
    );
  },
  component: DebugEvalsPage,
});

function DebugEvalsPage() {
  const search = Route.useSearch();
  const { orgId, agent, issue } = Route.useParams();
  const repo = useAgentRepo({ orgId, agent });
  const { sha, tree, changes } = useSuspenseQuery(debugEvalsQuery({ orgId, agent, issue })).data;
  const { data: run } = useSuspenseQuery(baselineRunQuery({ orgId, agent, issue }));
  const { client } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const pebble = usePebbleDock();
  const branch = getEvalsBranchById(issue);
  const issueRecord = useIssue();
  usePebblePage(
    `The engineer is debugging the Evals of Issue ${issue}, in ${EVALS_DIR}/ on its branch ${branch}, at commit ${sha}. Commit and push your edits to that branch, which reruns the Issue's baseline but not its Candidates.`,
    DEBUG_PROMPTS,
  );
  const diff = useDebugDiff({ orgId, agent, basehead: `main...${sha}` });

  async function save(files: { path: string; contents: string }[]) {
    try {
      await client.issues.updateEvals({ repo, id: issue, expectedHeadOid: sha, files });
    } catch (caught) {
      if (caught instanceof GroundedError && caught.status === BRANCH_MOVED_STATUS) {
        throw new Error("These Evals changed since the page loaded, so it now shows the latest");
      }
      throw caught;
    } finally {
      await queryClient.invalidateQueries();
    }
  }

  return (
    <div className="flex h-[calc(100dvh-6rem)] flex-col gap-3">
      <DebugBand issue={issueRecord} />
      <header aria-label="Debug" className="flex min-w-0 flex-wrap items-center gap-3">
        <h1 className="flex min-w-0 flex-1 basis-64 items-center gap-2 type-heading-15 text-ink">
          <span className="min-w-0 truncate">Evals</span>
          <BranchSwitcher current={undefined} sha={sha} />
        </h1>
        {run === null ? (
          <Tag>Not run</Tag>
        ) : (
          <span className="flex items-center gap-2">
            <RunStatusTag run={run} />
            <Link
              to="/$orgId/agents/$agent/runs/$run"
              params={{ orgId, agent, run: run.id }}
              className={buttonVariants({ variant: "quiet", size: "small" })}
            >
              Eval run
            </Link>
          </span>
        )}
        <Button size="small" onClick={() => pebble.prefill(NEW_EVAL_PROMPT)}>
          New Eval
        </Button>
      </header>
      <div className="flex min-h-0 flex-1 gap-3">
        <DebugViews
          search={search}
          files={
            <FileEditor
              entries={tree}
              initialPath={search.file}
              exclude={[EVAL_REGISTRY_PATH]}
              changes={changes}
              overview={{
                label: "Evals",
                content: (
                  <FileDiffs
                    files={changes}
                    empty="These Evals don't change any files on main yet."
                  />
                ),
              }}
              primary
              diff={diff}
              onSave={save}
            />
          }
          grades={<BaselineGrades run={run} />}
        />
      </div>
    </div>
  );
}
