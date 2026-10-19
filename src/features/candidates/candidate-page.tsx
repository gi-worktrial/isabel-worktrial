import type { ReactNode } from "react";

import { FileDiffs } from "#/file-diffs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "#/ui/collapsible";
import { CopyButton } from "#/ui/copy-button";
import { Markdown } from "#/ui/markdown";
import { splitApplyPrompt } from "#src/features/candidates/candidate-body";
import { totalLines } from "#src/features/candidates/file-fold";
import { needsDebug } from "#src/features/candidates/proofs";
import {
  type CandidateResults,
  type IssueState,
  type PullFile,
  getCandidateStatus,
} from "#src/sdk/index";
import { LineCounts } from "#src/ui/file-name";
import { FOLD } from "#src/ui/fold";

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

/** The Candidate's Fix in one card: how many files and lines it changes, then each file's diff. */
export function FixCard({ files }: { files: readonly PullFile[] }) {
  return (
    <section aria-label="Fix" className="overflow-clip card">
      <header className="flex h-10 items-center gap-2 border-b border-divider px-3">
        <h3 className="type-label-13 font-semibold text-ink">Fix</h3>
        <span className="type-label-13 text-muted tabular-nums">
          {files.length === 1 ? "1 file" : `${files.length} files`}
        </span>
        <LineCounts {...totalLines(files)} className="ml-auto type-mono-12" />
      </header>
      <FileDiffs files={files} />
    </section>
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
