export function queryWords(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[\s/]+/)
    .filter(Boolean);
}

export function matchesWords(
  query: string,
  texts: ReadonlyArray<string | null | undefined>,
): boolean {
  const hay = texts.join(" ").toLowerCase();
  return queryWords(query).every((word) => hay.includes(word));
}

function fuzzy(needle: string, hay: string): number | null {
  let at = -1;
  let first = -1;
  for (const letter of needle) {
    at = hay.indexOf(letter, at + 1);
    if (at === -1) {
      return null;
    }
    first = first === -1 ? at : first;
  }
  return (hay.includes(needle) ? 0 : 1000) + (at - first) + hay.length / 100;
}

// rank whole words in the title, whole words elsewhere, then scattered letters in the same order
const TIER = 10_000;

function wordScore(word: string, title: string, rest: string): number | null {
  const inTitle = fuzzy(word, title);
  const inRest = fuzzy(word, rest);
  const tiers = [
    title.includes(word) ? inTitle : null,
    rest.includes(word) ? inRest : null,
    inTitle,
    inRest,
  ];
  const tier = tiers.findIndex((score) => score !== null);
  return tier === -1 ? null : tier * TIER + (tiers[tier] ?? 0);
}

// every word must match
export function rankByWords<Item>(
  items: readonly Item[],
  query: string,
  text: (item: Item) => { title: string; rest: string },
): Item[] {
  const words = queryWords(query);
  return items
    .flatMap((item) => {
      const { title, rest } = text(item);
      const scores = words.map((word) => wordScore(word, title.toLowerCase(), rest.toLowerCase()));
      return scores.includes(null)
        ? []
        : [{ item, points: scores.reduce<number>((a, b) => a + (b ?? 0), 0) }];
    })
    .toSorted((left, right) => left.points - right.points)
    .slice(0, 60)
    .map((match) => match.item);
}
