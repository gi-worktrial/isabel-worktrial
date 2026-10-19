import { Check, Copy } from "lucide-react";
import { type ReactNode, useState } from "react";

import { IconButton } from "#/ui/button";
import { cn } from "#/ui/cn";
import { Tooltip } from "#/ui/tooltip";

const COPIED_MS = 1500;

export function CopyButton({
  text,
  label = "Copy",
  children,
  className,
}: {
  text: string;
  label?: string;
  children?: ReactNode;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), COPIED_MS);
  };

  return children === undefined ? (
    <IconButton label={copied ? "Copied" : label} size="small" onClick={() => void copy()}>
      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
    </IconButton>
  ) : (
    <Tooltip label={copied ? "Copied" : label}>
      <button
        type="button"
        aria-label={label}
        onClick={() => void copy()}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-xs type-label-13 font-normal text-muted hover:text-ink focus-visible:-outline-offset-2",
          className,
        )}
      >
        {children}
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </button>
    </Tooltip>
  );
}
