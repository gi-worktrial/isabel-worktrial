import { createMarkdownRenderer } from "fumadocs-core/content/md";
import { remarkGfm } from "fumadocs-core/mdx-plugins/remark-gfm";
import {
  type MdxJsxFlowElement,
  type MdxJsxTextElement,
  mdxJsxFromMarkdown,
} from "mdast-util-mdx-jsx";
import type { State } from "mdast-util-to-hast";
import { mdxJsx } from "micromark-extension-mdx-jsx";
import { mdxMd } from "micromark-extension-mdx-md";
import { createElement, type ComponentProps } from "react";
import type {} from "remark-parse";
import type { Processor } from "unified";

import { cn } from "#/ui/cn";
import { ApplyPrompt, remarkApplyPrompt } from "#/ui/markdown/apply-prompt";
import { remarkCitations } from "#/ui/markdown/citations";
import { Citation } from "#src/ui/citation";
import { CodeBlock } from "#src/ui/code-block";
import { parseRecordHref } from "#src/ui/record-href";
import { RecordLink } from "#src/ui/record-link";

// Elements other than `<ApplyPrompt>` render only their children.
const MDX_HANDLERS = {
  mdxJsxFlowElement: (state: State, node: MdxJsxFlowElement) =>
    node.data?.hName === undefined
      ? state.all(node)
      : state.applyData(node, {
          type: "element",
          tagName: "div",
          properties: {},
          children: state.all(node),
        }),
  mdxJsxTextElement: (state: State, node: MdxJsxTextElement) => state.all(node),
};

/** MDX without expressions or imports, since bodies have none and their parser (acorn) is most of `remark-mdx`. */
function remarkMdxJsx(this: Processor) {
  const data = this.data();
  (data.micromarkExtensions ??= []).push(mdxJsx(), mdxMd());
  (data.fromMarkdownExtensions ??= []).push(mdxJsxFromMarkdown());
}

const { Markdown: RenderMdx } = createMarkdownRenderer({
  remarkPlugins: [remarkMdxJsx, remarkGfm, remarkApplyPrompt, remarkCitations],
  remarkRehypeOptions: { handlers: MDX_HANDLERS },
});
const { Markdown: RenderMarkdown } = createMarkdownRenderer({
  remarkPlugins: [remarkGfm, remarkCitations],
});

const BLOCK = "my-2 first:mt-0 last:mb-0";

function prose(tag: string, styles: string) {
  return function Prose({ className, ...props }: ComponentProps<"div">) {
    return createElement(tag, { ...props, className: cn(styles, className) });
  };
}

function Link({ href, ...props }: ComponentProps<"a">) {
  const record = href === undefined ? undefined : parseRecordHref(href, window.location.href);
  if (record !== undefined) {
    return <RecordLink href={href} record={record} {...props} />;
  }
  const external = href?.startsWith("http") === true;
  return (
    <a
      {...props}
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener" : undefined}
      className="text-accent underline-offset-2 hover:underline"
    />
  );
}

const heading = (tag: string) =>
  prose(tag, `mt-5 mb-2 first:mt-0 ${tag === "h1" ? "type-title-18" : "type-heading-15"}`);

const components = {
  h1: heading("h1"),
  h2: heading("h2"),
  h3: heading("h3"),
  h4: heading("h4"),
  h5: heading("h5"),
  h6: heading("h6"),
  p: prose("p", `${BLOCK} whitespace-pre-line`),
  li: prose("li", "my-1 pl-1 marker:text-muted"),
  strong: prose("strong", "font-semibold"),
  em: prose("em", "italic"),
  td: prose("td", "px-3 py-2 align-top"),
  th: prose("th", "h-9 border-b border-divider px-3 text-left font-semibold text-ink"),
  ul: prose("ul", `${BLOCK} list-disc pl-6`),
  ol: prose("ol", `${BLOCK} list-decimal pl-6`),
  blockquote: prose("blockquote", `${BLOCK} border-l-2 border-divider pl-4 text-muted`),
  table: ({ children }: ComponentProps<"table">) => (
    <div className={`${BLOCK} overflow-x-auto`}>
      <table className="w-full border-collapse type-label-13">{children}</table>
    </div>
  ),
  pre: CodeBlock,
  code: ({ className, children }: ComponentProps<"code">) => (
    <code className={cn("rounded-xs bg-fill px-1 py-px type-mono-12", className)}>{children}</code>
  ),
  hr: () => <hr className="my-4 border-divider" />,
  a: Link,
  "apply-prompt": ApplyPrompt,
  citation: Citation,
};

/** Renders Markdown, or MDX without its expressions, imports, or components other than `<ApplyPrompt>`. */
export function Markdown({
  text,
  mdx = false,
  className,
}: {
  text: string;
  mdx?: boolean;
  className?: string;
}) {
  const Render = mdx ? RenderMdx : RenderMarkdown;
  return (
    <div className={cn("min-w-0 type-copy-14 wrap-anywhere text-ink", className)}>
      <Render components={components}>{text}</Render>
    </div>
  );
}
