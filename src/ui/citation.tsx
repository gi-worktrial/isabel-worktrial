import { createContext, type ReactNode, use } from "react";

import { Tooltip } from "#/ui/tooltip";
import { Chip } from "#src/ui/chip";

/** A cited source: its quote, and where it came from opened in place. */
type CitationSource = { quote: string; open(): void };

/** Finds a citation's source by its id; a Trace's transcript provides it. */
export const CitationSources = createContext<(id: string) => CitationSource | undefined>(
  () => undefined,
);

/** Platform's numbered `[cit_…]` marker as a small chip, its quote on hover, and a click opens the step it came from. */
export function Citation({
  children,
  "aria-label": label,
  "data-citation": id = "",
}: {
  "children"?: ReactNode;
  "aria-label"?: string;
  "data-citation"?: string;
}) {
  const source = use(CitationSources)(id);
  return (
    <Tooltip label={source?.quote ?? id}>
      <Chip onClick={source?.open} aria-label={label} className="px-1">
        {children}
      </Chip>
    </Tooltip>
  );
}
