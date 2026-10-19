import { Tag } from "#/ui/tag";
import { ShortTimestamp } from "#src/ui/short-timestamp";

/** A moment in a neutral Tag, using the same relative timestamp pattern as the Inbox. */
export function TimeTag({ at }: { at: string; short?: boolean }) {
  return (
    <Tag>
      <ShortTimestamp at={at} relative />
    </Tag>
  );
}
