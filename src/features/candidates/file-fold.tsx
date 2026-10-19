import type { ReactNode } from "react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "#/ui/collapsible";
import type { PullFile } from "#src/sdk/index";
import { FilePath } from "#src/ui/file-name";
import { FOLD } from "#src/ui/fold";

/** One file of a list: its path row, with `meta` at the right, folding its diff away. Rows part with one hairline. */
export function FileFold({
  id,
  path,
  meta,
  action,
  defaultOpen,
  separated = false,
  children,
}: {
  id?: string;
  path: string;
  meta?: ReactNode;
  action?: ReactNode;
  defaultOpen: boolean;
  separated?: boolean;
  children: ReactNode;
}) {
  return (
    <Collapsible defaultOpen={defaultOpen} asChild>
      <section
        id={id}
        aria-label={path}
        className={separated ? "overflow-clip card" : "border-b border-divider last:border-b-0"}
      >
        <div className="flex items-center bg-subtle hover:bg-fill">
          <CollapsibleTrigger className="focus-inset mx-0 h-9 min-w-0 flex-1 rounded-none px-3 hover:bg-transparent">
            <FilePath path={path} className="flex-1 type-mono-12 text-ink" />
            {meta}
          </CollapsibleTrigger>
          {action === undefined ? null : (
            <span className="flex shrink-0 items-center gap-1 pr-2">{action}</span>
          )}
        </div>
        <CollapsibleContent className={FOLD}>
          <div className="border-t border-divider">{children}</div>
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}

/** Lines added and removed across `files`. */
export const totalLines = (files: readonly PullFile[]) => ({
  added: files.reduce((sum, { additions }) => sum + additions, 0),
  removed: files.reduce((sum, { deletions }) => sum + deletions, 0),
});
