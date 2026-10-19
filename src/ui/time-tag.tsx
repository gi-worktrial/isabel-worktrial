import { Tag } from "#/ui/tag";
import { Timestamp } from "#/ui/timestamp";
import { ShortTimestamp } from "#src/ui/short-timestamp";

/** A moment in a neutral Tag, as on Traces, its day or time alone when `short`. */
export function TimeTag({ at, short = false }: { at: string; short?: boolean }) {
  return <Tag>{short ? <ShortTimestamp at={at} /> : <Timestamp at={at} />}</Tag>;
}
