import { ShortTimestamp } from "#src/ui/short-timestamp";

export function Timestamp({ at, className }: { at: string; className?: string }) {
  return <ShortTimestamp at={at} relative className={className ?? ""} />;
}

/** A relative moment using the platform's shared Inbox timestamp pattern. */
export function RelativeTimestamp({ at, className }: { at: string; className?: string }) {
  return <ShortTimestamp at={at} relative className={className ?? ""} />;
}

/** A relative moment using the platform's shared Inbox timestamp pattern. */
export function AgeTimestamp({ at, className }: { at: string; className?: string }) {
  return <ShortTimestamp at={at} relative className={className ?? ""} />;
}
