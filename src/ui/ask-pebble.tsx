// a quiet Ask Pebble beside guidance, which fills Pebble's prompt and never sends it, so the engineer reads the
// question and presses Enter
import { usePebbleDock } from "#/pebble/page";
import { Button, IconButton } from "#/ui/button";
import { PebbleMark } from "#/ui/marks";

export function AskPebble({
  label = "Ask Pebble",
  prompt,
  iconOnly = false,
  className,
}: {
  label?: string;
  prompt: string;
  /** just the mark, with the label as its tooltip, where words would crowd the line */
  iconOnly?: boolean;
  className?: string;
}) {
  const { prefill } = usePebbleDock();
  if (iconOnly) {
    return (
      <IconButton label={label} size="small" onClick={() => prefill(prompt)} className={className}>
        <PebbleMark />
      </IconButton>
    );
  }
  return (
    <Button variant="quiet" size="small" onClick={() => prefill(prompt)} className={className}>
      <PebbleMark />
      {label}
    </Button>
  );
}
