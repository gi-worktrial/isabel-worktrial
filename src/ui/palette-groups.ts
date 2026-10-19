import { type ReactNode, useEffect, useLayoutEffect, useRef } from "react";

// groups after platform's own in the command palette, such as the demo's Walkthroughs and Debug's files
interface PaletteGroup {
  heading: string;
  // listed once the viewer types, as platform lists Issues
  searchOnly?: boolean;
  items: ReadonlyArray<{
    value: string;
    label?: string;
    icon: ReactNode;
    keywords?: string[];
    disabled?: boolean;
    onSelect(): void;
  }>;
}

type Source = () => readonly PaletteGroup[];

const sources = new Set<Source>();

// read as the palette renders, so a source answers for the page as it is when the palette opens
export function usePaletteGroups(source: Source): void {
  const latest = useRef(source);
  useLayoutEffect(() => {
    latest.current = source;
  });
  useEffect(() => {
    const read = () => latest.current();
    sources.add(read);
    return () => {
      sources.delete(read);
    };
  }, []);
}

export function paletteGroups(): PaletteGroup[] {
  return [...sources].flatMap((source) => source());
}
