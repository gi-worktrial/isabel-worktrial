import type { GitStatusEntry } from "@pierre/trees";
import { FileTree, useFileTree } from "@pierre/trees/react";
import { useEffect, useId, useRef, type ReactNode } from "react";

import { FileDiffs } from "#/file-diffs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "#/ui/collapsible";
import { CopyButton } from "#/ui/copy-button";
import { Markdown } from "#/ui/markdown";
import { splitApplyPrompt } from "#src/features/candidates/candidate-body";
import { needsDebug } from "#src/features/candidates/proofs";
import {
  type CandidateResults,
  type IssueState,
  type PullFile,
  getCandidateStatus,
} from "#src/sdk/index";
import { FileRail } from "#src/ui/file-tree";
import { FOLD } from "#src/ui/fold";

import treeStyles from "#src/ui/file-tree.css?inline";

const TREE_ROW_HEIGHT = 28;

/** A Candidate's rationale at the reading width, its Apply prompt folded behind its Copy, since the prompt repeats the rationale and the Fix shown on the page. */
export function CandidateBody({ body, children }: { body: string; children?: ReactNode }) {
  const { rationale, prompt } = splitApplyPrompt(body);
  if (rationale === "" && prompt === undefined && children === undefined) {
    return null;
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {rationale !== "" && <Markdown text={rationale} mdx />}
      {children}
      {prompt !== undefined && (
        <Collapsible asChild>
          <section aria-label="Apply prompt" className="flex flex-col gap-2">
            <div className="flex items-center gap-1">
              <CollapsibleTrigger>
                <span className="type-label-13 font-medium text-ink">View prompt</span>
              </CollapsibleTrigger>
            </div>
            <CollapsibleContent className={FOLD}>
              <div className="relative">
                <span className="absolute top-2 right-2 z-10">
                  <CopyButton text={prompt} label="Copy prompt" />
                </span>
                <pre className="max-h-96 overflow-auto rounded-sm bg-subtle p-3 pr-12 type-mono-12 whitespace-pre-wrap wrap-anywhere text-ink">
                  {prompt}
                </pre>
              </div>
            </CollapsibleContent>
          </section>
        </Collapsible>
      )}
    </div>
  );
}

/** The Candidate's changed files, with navigation and one expanded card per file. */
export function FixCard({ files }: { files: readonly PullFile[] }) {
  const id = useId().replaceAll(":", "");
  const fileIds = files.map((_, index) => `${id}-file-${index}`);

  return (
    <section aria-label="Fix" className="flex items-start gap-3">
      <ChangedFilesNav files={files} fileIds={fileIds} />
      <div className="min-w-0 flex-1">
        <FileDiffs files={files} separated fileIds={fileIds} />
      </div>
    </section>
  );
}

function ChangedFilesNav({
  files,
  fileIds,
}: {
  files: readonly PullFile[];
  fileIds: readonly string[];
}) {
  const ready = useRef(false);
  useEffect(() => {
    ready.current = true;
  }, []);
  const paths = files.map(({ filename }) => filename);
  const gitStatus: GitStatusEntry[] = files.map(({ filename, status }) => ({
    path: filename,
    status: status === "removed" ? "deleted" : status === "added" ? "added" : "modified",
  }));
  const { model } = useFileTree({
    paths,
    gitStatus,
    flattenEmptyDirectories: true,
    initialExpansion: "open",
    itemHeight: TREE_ROW_HEIGHT,
    icons: { set: "minimal", colored: false },
    unsafeCSS: treeStyles,
    onSelectionChange: (selected) => {
      if (!ready.current) {
        return;
      }
      const path = model.getFocusedPath();
      const index = path === null ? -1 : paths.indexOf(path);
      if (index !== -1 && selected.includes(path!)) {
        document.getElementById(fileIds[index]!)?.scrollIntoView({ block: "start" });
      }
    },
  });

  return (
    <div className="sticky top-3 hidden h-[calc(100dvh-7.5rem)] w-56 shrink-0 overflow-hidden card lg:flex">
      <FileRail
        label="Changed files"
        title={<span className="type-label-13 font-medium text-muted">Files</span>}
        className="w-56 border-r-0"
      >
        <FileTree model={model} aria-label="Changed files" className="min-h-0 flex-1 p-2" />
      </FileRail>
    </div>
  );
}

/** The Candidate's actions at the right end of its heading. */
export function CandidateActionsEnd({ children }: { children: ReactNode }) {
  return (
    <span
      role="group"
      aria-label="Candidate actions"
      data-edge="end"
      className="ml-auto flex items-center gap-2"
    >
      {children}
    </span>
  );
}

/** Debug's button look on a Candidate's page, the primary when the Candidate needs Debug's work. */
export function debugVariant(state: IssueState, results: CandidateResults | undefined) {
  return needsDebug(getCandidateStatus(state, results)) ? "primary" : "secondary";
}
