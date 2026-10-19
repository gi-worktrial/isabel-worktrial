import type { ReactNode } from "react";

// inherit tooltip ink to keep keys legible on its dark background
export function KeyHint({ label, keys }: { label: ReactNode; keys: string }) {
  return (
    <span className="flex items-baseline gap-2">
      <span className="min-w-0">{label}</span>
      <kbd className="shrink-0 font-sans opacity-60">{keys}</kbd>
    </span>
  );
}
