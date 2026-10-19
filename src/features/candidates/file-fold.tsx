import type { ReactNode } from "react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "#/ui/collapsible";
import type { PullFile } from "#src/sdk/index";
import { FilePath } from "#src/ui/file-name";
import { FOLD } from "#src/ui/fold";

/** One file of a list: its path row, with `meta` at the right, folding its diff away. Rows part with one hairline. */
export function FileFold({
  path,
  meta,
  defaultOpen,
  children,
}: {
  path: string;
  meta?: ReactNode;
  defaultOpen: boolean;
  children: ReactNode;
}) {
  return (
    <Collapsible defaultOpen={defaultOpen} asChild>
      <section aria-label={path} className="border-b border-divider last:border-b-0">
        <CollapsibleTrigger className="focus-inset mx-0 h-9 w-full rounded-none px-3 hover:bg-subtle">
          <FilePath path={path} className="flex-1 type-mono-12 text-ink" />
          {meta}
        </CollapsibleTrigger>
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
