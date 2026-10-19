import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouteContext } from "@tanstack/react-router";
import { useState, useTransition } from "react";

import { useIssueParams } from "#/issue-view";
import { useAgentRepo } from "#/queries";
import { BranchSwatch, CandidateBranch, useBranchTones } from "#src/features/candidates/branches";
import type { SaveDialogProps } from "#src/features/debug/file-editor";
import { type EditedFile, branchFiles } from "#src/features/debug/files";
import { SaveCandidateDialog } from "#src/features/debug/save-dialog";
import type { Candidate, NestedEntry, PullFile } from "#src/sdk/index";

/**
 * Krish's Candidate branches in a Candidate's Debug: Save asks whether the edits go onto this Candidate (`saveHere`)
 * or a new one branched off it, and the branch switcher's New Candidate names a branch with no edits. Either new
 * Candidate opens in its own Debug.
 */
export function useBranching({
  candidate,
  tree,
  changes,
  saveHere,
}: {
  candidate: Candidate;
  /** The tree in the editor, at the head it loaded. */
  tree: readonly NestedEntry[];
  changes: readonly PullFile[];
  saveHere(files: EditedFile[]): Promise<void>;
}) {
  const params = useIssueParams();
  const { orgId, agent, issue } = params;
  const { client } = useRouteContext({ from: "/$orgId" });
  const repo = useAgentRepo(params);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { next } = useBranchTones();
  const [branching, setBranching] = useState(false);
  const [creating, startCreating] = useTransition();
  const [error, setError] = useState<string>();

  // a new Candidate opens off the evals branch, so it gets this one's changed files with the edits over them
  async function saveAsNew(title: string, files: EditedFile[]) {
    const contents = branchFiles(tree, changes, files);
    const created = await client.issues.createCandidate({ repo, id: issue, title });
    const opened = await client.issues.getCandidate({ agent, repo, id: issue, candidate: created });
    if (opened === undefined) {
      throw new Error(`Candidate ${created} didn't open`);
    }
    await client.issues.updateCandidate({
      repo,
      id: issue,
      candidate: created,
      expectedHeadOid: opened.head_sha,
      files: contents,
    });
    await queryClient.invalidateQueries();
    await navigate({
      to: "/$orgId/agents/$agent/issues/$issue/debug/candidates/$candidate",
      params: { orgId, agent, issue, candidate: created },
      search: true,
    });
  }

  const renderSaveDialog = (props: SaveDialogProps) => (
    <SaveCandidateDialog
      {...props}
      branch={<CandidateBranch candidate={candidate} named className="align-middle" />}
      swatch={<BranchSwatch tone={next} />}
      saveHere={saveHere}
      saveAsNew={saveAsNew}
    />
  );

  return {
    renderSaveDialog,
    /** Opens New Candidate's dialog, undefined while one is being created. */
    newCandidate: creating ? undefined : () => setBranching(true),
    dialog:
      branching &&
      renderSaveDialog({
        files: [],
        onClose: () => setBranching(false),
        onSave: (commit) => {
          setBranching(false);
          startCreating(async () => {
            try {
              await commit();
              setError(undefined);
            } catch (caught) {
              setError(caught instanceof Error ? caught.message : String(caught));
            }
          });
        },
      }),
    error: error !== undefined && (
      <span role="alert" className="type-label-13 text-danger">
        {error}
      </span>
    ),
  };
}
