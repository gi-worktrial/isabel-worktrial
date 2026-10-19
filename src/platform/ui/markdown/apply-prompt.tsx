import type { Data, Root, RootContent } from "mdast";
import type { MdxJsxFlowElement, MdxJsxTextElement } from "mdast-util-mdx-jsx";
import type { ReactNode } from "react";
import { visit } from "unist-util-visit";

import { CopyButton } from "#/ui/copy-button";

const isApplyPrompt = (
  node: RootContent | undefined,
): node is MdxJsxFlowElement | MdxJsxTextElement =>
  (node?.type === "mdxJsxFlowElement" || node?.type === "mdxJsxTextElement") &&
  node.name === "ApplyPrompt" &&
  node.attributes.length === 0 &&
  node.children.length > 0;

/** Turns each `<ApplyPrompt>` with no attributes and some content into an `apply-prompt` element holding its source. */
export function remarkApplyPrompt() {
  return (tree: Root, file: { value: unknown }) => {
    const source = String(file.value);
    const data = ({ children }: MdxJsxFlowElement | MdxJsxTextElement): Data => ({
      hName: "apply-prompt",
      hProperties: {
        prompt: source.slice(
          children.at(0)?.position?.start.offset,
          children.at(-1)?.position?.end.offset,
        ),
      },
    });

    visit(tree, (node) => {
      if (node.type === "mdxJsxFlowElement" && isApplyPrompt(node)) {
        node.data = data(node);
      }
      // A one-line `<ApplyPrompt>…</ApplyPrompt>` parses as the only child of a paragraph.
      const [only, ...rest] = node.type === "paragraph" ? node.children : [];
      if (
        node.type === "paragraph" &&
        rest.length === 0 &&
        only?.type === "mdxJsxTextElement" &&
        isApplyPrompt(only)
      ) {
        node.data = data(only);
        node.children = only.children;
      }
    });
  };
}

export function ApplyPrompt({ prompt, children }: { prompt: string; children?: ReactNode }) {
  return (
    <div className="my-2 rounded-xs bg-subtle first:mt-0 last:mb-0">
      <div className="flex h-9 items-center justify-between pr-2 pl-3">
        <span className="type-label-13 font-semibold text-ink">Apply prompt</span>
        <CopyButton text={prompt} label="Copy prompt" />
      </div>
      <div className="px-3 pb-3">{children}</div>
    </div>
  );
}
