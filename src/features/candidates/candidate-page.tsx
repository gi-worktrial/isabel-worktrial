import { useId, type ReactNode } from "react";

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
import { FilePath } from "#src/ui/file-name";
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

/** The Candidate's changed files, with navigation and one expanded card per file. */
export function FixCard({ files }: { files: readonly PullFile[] }) {
  const id = useId().replaceAll(":", "");
  const fileIds = files.map((_, index) => `${id}-file-${index}`);

  return (
    <section aria-label="Fix" className="flex items-start gap-3">
      <nav
        aria-label="Changed files"
        className="sticky top-3 hidden max-h-[calc(100dvh-7.5rem)] w-56 shrink-0 flex-col overflow-auto card lg:flex"
      >
        <div className="flex h-10 shrink-0 items-center border-b border-divider px-3 type-label-13 font-medium text-muted">
          Files
        </div>
        <ul className="flex flex-col p-2">
          {files.map((file, index) => (
            <li key={file.filename}>
              <a
                href={`#${fileIds[index]}`}
                title={file.filename}
                className="flex h-8 min-w-0 items-center rounded-xs px-2 hover:bg-fill"
              >
                <FilePath path={file.filename} className="flex-1 type-mono-12 text-ink" />
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0 flex-1">
        <FileDiffs files={files} separated fileIds={fileIds} />
      </div>
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
