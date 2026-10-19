import { MultiFileDiff } from "@pierre/diffs/react";
import { Suspense, lazy } from "react";

import { THEME, preloadThemes } from "#/file-diffs";
import { useTheme } from "#/ui/theme";
import { LinesSkeleton } from "#src/ui/skeleton";

const HighlightedTextDiff = lazy(() => preloadThemes().then(() => ({ default: MultiFileDiff })));

/** Two versions of a file side by side, highlighted for the current theme. */
export function TextDiff({ path, before, after }: { path: string; before: string; after: string }) {
  const theme = useTheme();
  return (
    <Suspense fallback={<LinesSkeleton lines={4} label="Loading diff" className="p-3" />}>
      <HighlightedTextDiff
        oldFile={{ name: path, contents: before }}
        newFile={{ name: path, contents: after }}
        options={{
          theme: THEME,
          themeType: theme,
          diffStyle: "split",
          disableFileHeader: true,
          overflow: "wrap",
        }}
      />
    </Suspense>
  );
}
