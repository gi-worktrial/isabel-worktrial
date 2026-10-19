import type { PullFile } from "@grounded-intelligence/grounded-sdk";
import { preloadHighlighter } from "@pierre/diffs";
import { PatchDiff } from "@pierre/diffs/react";
import { Maximize2, Minimize2 } from "lucide-react";
import { lazy, Suspense, useState } from "react";

import { EmptyState } from "#/ui/empty-state";
import { IconButton } from "#/ui/button";
import { useTheme } from "#/ui/theme";
import { FileFold } from "#src/features/candidates/file-fold";
import { LineCounts } from "#src/ui/file-name";
import { LinesSkeleton } from "#src/ui/skeleton";

export const THEME = { light: "pierre-light", dark: "pierre-dark" } as const;
const HIDE_COLLAPSED_CONTEXT = '[data-separator="line-info"] { display: none; }';

/** A code view mounted before the shared highlighter has its themes can miss its render, so it waits for them. */
export const preloadThemes = () =>
  preloadHighlighter({ themes: [THEME.light, THEME.dark], langs: [] });

const HighlightedPatchDiff = lazy(() => preloadThemes().then(() => ({ default: PatchDiff })));

// `patch` holds only the hunks, as on GitHub, and PatchDiff needs the file headers.
const filePatch = ({ filename, status, patch }: PullFile) =>
  [
    status === "added" ? "--- /dev/null" : `--- a/${filename}`,
    status === "removed" ? "+++ /dev/null" : `+++ b/${filename}`,
    patch ?? "",
    "",
  ].join("\n");

/** Changed files, one unified diff each. */
export function FileDiffs({
  files,
  empty = "This Candidate doesn't change any files yet.",
  separated = false,
  fileIds,
}: {
  files: readonly PullFile[];
  empty?: string;
  separated?: boolean;
  fileIds?: readonly string[];
}) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  if (files.length === 0) {
    return <EmptyState title="No changes" description={empty} />;
  }

  const folds = files.map((file, index) => (
    <FileFold
      key={file.filename}
      {...(fileIds?.[index] === undefined ? {} : { id: fileIds[index] })}
      path={file.filename}
      defaultOpen={separated || index === 0}
      separated={separated}
      action={
        file.patch === undefined ? undefined : (
          <IconButton
            label={
              expanded.has(file.filename) ? "Collapse unchanged lines" : "Expand unchanged lines"
            }
            size="small"
            onClick={() =>
              setExpanded((current) => {
                const next = new Set(current);
                if (next.has(file.filename)) {
                  next.delete(file.filename);
                } else {
                  next.add(file.filename);
                }
                return next;
              })
            }
          >
            {expanded.has(file.filename) ? (
              <Minimize2 className="size-3.5" />
            ) : (
              <Maximize2 className="size-3.5" />
            )}
          </IconButton>
        )
      }
      meta={
        <LineCounts
          added={file.additions}
          removed={file.deletions}
          className="type-mono-12"
        />
      }
    >
      {file.patch === undefined ? (
        <p className="px-3 py-2 type-meta-12 text-muted">No text diff for this file.</p>
      ) : (
        <PatchView patch={filePatch(file)} expandUnchanged={expanded.has(file.filename)} />
      )}
    </FileFold>
  ));
  return separated ? <div className="flex flex-col gap-3">{folds}</div> : folds;
}

/** One unified diff, highlighted for the current theme. */
export function PatchView({
  patch,
  expandUnchanged = false,
}: {
  patch: string;
  expandUnchanged?: boolean;
}) {
  const theme = useTheme();
  return (
    <Suspense fallback={<LinesSkeleton lines={4} label="Loading diff" className="p-3" />}>
      <HighlightedPatchDiff
        patch={patch}
        options={{
          theme: THEME,
          themeType: theme,
          diffStyle: "unified",
          disableFileHeader: true,
          expandUnchanged,
          unsafeCSS: HIDE_COLLAPSED_CONTEXT,
          overflow: "wrap",
        }}
      />
    </Suspense>
  );
}
