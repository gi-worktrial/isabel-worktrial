import { GroundedError, getCandidateBranchById } from "@grounded-intelligence/grounded-sdk";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { CandidateNotFound } from "#/candidate-results";
import { FileDiffs } from "#/file-diffs";
import { debugSearchSchema } from "#/debug-search";
import { FileEditor } from "#/file-editor";
import { usePebblePage } from "#/pebble/page";
import {
  RUN_POLL_INTERVAL,
  candidateQuery,
  candidatesQuery,
  isCandidatePending,
  issueQuery,
  treeQuery,
  useAgentRepo,
} from "#/queries";
import { buttonVariants } from "#/ui/button";
import { crumbs } from "#/crumbs";
import { useBranching } from "#src/features/debug/branching";
import { candidateBasehead, useDebugDiff } from "#src/features/debug/debug-diff";

const BRANCH_MOVED_STATUS = 409;
// Jobs checks for pushes every 15 seconds, so a save's run can take this long to appear.
const RUN_START_WAIT_MS = 30_000;
const DEBUG_PROMPTS = [
  "Why does this Candidate fail its Evals?",
  "Fix the failing Evals on this branch",
];

export const Route = createFileRoute(
  "/$orgId/agents/$agent/issues/$issue_/debug/candidates/$candidate",
)({
  staticData: { rail: true },
  validateSearch: debugSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ context: { queryClient }, params }) => {
    const [candidate, issue] = await Promise.all([
      queryClient.ensureQueryData(candidateQuery(params)),
      queryClient.ensureQueryData(issueQuery(params)),
      queryClient.ensureQueryData(candidatesQuery(params)),
    ]);
    await queryClient.ensureQueryData(treeQuery({ ...params, ref: candidate.head_sha }));
    return crumbs(
      { label: "Inbox", to: "/$orgId/agents/$agent/issues" },
      { label: issue.id, to: "/$orgId/agents/$agent/issues/$issue" },
      {
        label: candidate.title,
        to: "/$orgId/agents/$agent/issues/$issue/candidates/$candidate",
      },
    );
  },
  // a save as a new Candidate moves to its own Debug, which starts from that Candidate's head
  component: () => <DebugPage key={Route.useParams().candidate} />,
  notFoundComponent: () => <CandidateNotFound />,
});

function DebugPage() {
  const search = Route.useSearch();
  const params = Route.useParams();
  const { orgId, agent, issue } = params;
  const repo = useAgentRepo(params);
  const { client } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const [savedAt, setSavedAt] = useState<number>();
  const { data: candidate } = useSuspenseQuery({
    ...candidateQuery(params),
    refetchInterval: ({ state: { data } }) =>
      (data !== undefined && isCandidatePending(data)) ||
      (savedAt !== undefined && Date.now() - savedAt < RUN_START_WAIT_MS)
        ? RUN_POLL_INTERVAL
        : false,
  });
  // The editor stays at the head it loaded until a save, so a save can't silently overwrite a newer push.
  const [{ head, changes }, setBase] = useState({
    head: candidate.head_sha,
    changes: candidate.files,
  });
  const initialFile = search.file ?? changes[0]?.filename;
  const [openFile, setOpenFile] = useState(initialFile);
  const { data: tree } = useSuspenseQuery(treeQuery({ orgId, agent, ref: head }));
  const branch = getCandidateBranchById(issue, candidate.id);
  usePebblePage(
    `The engineer is debugging Candidate ${candidate.id}, "${candidate.title}", of Issue ${issue}. Its branch is ${branch}, at commit ${head}. Commit and push your edits to that branch, which reruns its Evals.`,
    DEBUG_PROMPTS,
  );
  const diff = useDebugDiff({ orgId, agent, basehead: candidateBasehead(issue, head) });

  async function save(files: { path: string; contents: string }[]) {
    try {
      await client.issues.updateCandidate({
        repo,
        id: issue,
        candidate: candidate.id,
        expectedHeadOid: head,
        files,
      });
      setSavedAt(Date.now());
    } catch (caught) {
      if (caught instanceof GroundedError && caught.status === BRANCH_MOVED_STATUS) {
        throw new Error("This Candidate changed since the page loaded, so it now shows the latest");
      }
      throw caught;
    } finally {
      await queryClient.invalidateQueries();
      const latest = queryClient.getQueryData(candidateQuery(params).queryKey);
      if (latest !== undefined) {
        setBase({ head: latest.head_sha, changes: latest.files });
      }
    }
  }
  const branching = useBranching({ candidate, tree, changes, saveHere: save });
  const location = [repo, ...(openFile === undefined ? ["Fix"] : openFile.split("/"))];

  return (
    <div className="flex h-[calc(100dvh-6rem)] flex-col gap-3">
      {branching.dialog}
      <div className="flex min-h-0 flex-1 gap-3">
        <FileEditor
          key={candidate.id}
          entries={tree}
          changes={changes}
          initialPath={initialFile}
          onFileChange={setOpenFile}
          railToTop
          saveInPaneHeader
          saveLabel="Save changes"
          paneHeader={
            <>
              <nav
                aria-label="Current file"
                className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden type-label-13 text-muted"
              >
                {location.map((part, index) => (
                  <span key={`${index}:${part}`} className="contents">
                    {index > 0 && <span aria-hidden="true">/</span>}
                    <span className="min-w-0 truncate" title={part}>
                      {part}
                    </span>
                  </span>
                ))}
              </nav>
              {branching.error}
              <Link
                to="/$orgId/agents/$agent/issues/$issue/candidates/$candidate"
                params={{ orgId, agent, issue, candidate: candidate.id }}
                className={buttonVariants({ variant: "secondary" })}
              >
                Cancel changes
              </Link>
            </>
          }
          overview={{ label: "Fix", content: <FileDiffs files={changes} /> }}
          primary
          diff={diff}
          renderSaveDialog={branching.renderSaveDialog}
        />
      </div>
    </div>
  );
}
