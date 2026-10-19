// git's merge rules, shared by the browser's git and demo-data's seed builder so a merge lands on the same tree in both

/** git's merge-base, the common ancestor no other common ancestor reaches, or undefined when the histories never meet. */
export function mergeBase(
  ancestors: (sha: string) => ReadonlySet<string>,
  left: string,
  right: string,
): string | undefined {
  const mine = ancestors(left);
  const common = [...ancestors(right)].filter((sha) => mine.has(sha));
  return common.find((sha) => !common.some((other) => other !== sha && ancestors(other).has(sha)));
}

/** One path three ways, where the changed side wins, both removed gives undefined and differing changes give null. */
export function pick3<T>(
  base: T | undefined,
  ours: T | undefined,
  theirs: T | undefined,
  same: (left: T | undefined, right: T | undefined) => boolean,
): T | undefined | null {
  if (same(ours, theirs)) {
    return ours;
  }
  if (same(ours, base)) {
    return theirs;
  }
  return same(theirs, base) ? ours : null;
}
