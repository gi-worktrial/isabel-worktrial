import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Treat each type-* utility as a font-size and line-height pair.
const merge = extendTailwindMerge({
  extend: {
    classGroups: { "font-size": [{ type: [(value: string) => /^[a-z]+-\d+$/.test(value)] }] },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return merge(clsx(inputs));
}
