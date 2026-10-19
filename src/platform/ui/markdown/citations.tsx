import type { PhrasingContent, Root } from "mdast";
import type { ReactNode } from "react";
import { SKIP, visit } from "unist-util-visit";

const MARKER = /\[(cit_[0-9A-Za-z]+)\]/u;

/** Turns each `[cit_…]` marker into a `citation` element numbered by first appearance. */
export function remarkCitations() {
  return (tree: Root) => {
    const numbers = new Map<string, number>();
    visit(tree, "text", (node, index, parent) => {
      if (parent === undefined || index === undefined || !MARKER.test(node.value)) {
        return undefined;
      }
      const parts = node.value.split(MARKER).map((part, at): PhrasingContent => {
        if (at % 2 === 0) {
          return { type: "text", value: part };
        }
        const number = numbers.get(part) ?? numbers.size + 1;
        numbers.set(part, number);
        return {
          type: "text",
          value: String(number),
          data: {
            hName: "citation",
            hProperties: { ariaLabel: `Citation ${number}`, dataCitation: part },
          },
        };
      });
      parent.children.splice(index, 1, ...parts);
      return [SKIP, index + parts.length];
    });
  };
}

export function Citation({
  children,
  "aria-label": label,
}: {
  children?: ReactNode;
  "aria-label"?: string;
}) {
  return (
    <sup
      aria-label={label}
      className="mx-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-xs bg-fill px-1 align-text-top type-meta-12 font-medium text-muted tabular-nums"
    >
      {children}
    </sup>
  );
}
