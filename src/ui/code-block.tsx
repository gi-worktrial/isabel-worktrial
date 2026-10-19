import { type ComponentProps, isValidElement, type ReactNode } from "react";

import { CopyButton } from "#/ui/copy-button";

// the words of a fenced block, for its Copy button
function codeText(children: ReactNode): string {
  if (typeof children === "string") {
    return children;
  }
  return isValidElement<{ children?: ReactNode }>(children)
    ? codeText(children.props.children)
    : "";
}

/** Markdown's fenced block on a light panel without a frame, as the Trace transcript shows code, with its language and a Copy button, scrolling past 24 lines. */
export function CodeBlock({ children }: ComponentProps<"pre">) {
  const language = isValidElement<{ className?: string }>(children)
    ? /language-(\S+)/u.exec(children.props.className ?? "")?.[1]
    : undefined;
  return (
    <div className="group/code relative my-2 rounded-sm bg-subtle first:mt-0 last:mb-0">
      <div className="absolute top-1 right-1 flex items-center gap-1 opacity-0 group-hover/code:opacity-100 group-focus-within/code:opacity-100">
        {language !== undefined && <span className="px-1 type-meta-12 text-muted">{language}</span>}
        <CopyButton label="Copy code" text={codeText(children)} />
      </div>
      <pre className="max-h-96 overflow-auto p-3 type-mono-12 text-ink [&>code]:bg-transparent [&>code]:p-0">
        {children}
      </pre>
    </div>
  );
}
