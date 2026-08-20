import { distance } from 'fastest-levenshtein';

/**
 * Application-side fuzzy matching. Doc 6, T-07 requires "a one-character
 * typo still matches" — MariaDB has no equivalent to Postgres's pg_trgm
 * or MySQL 8's ngram FULLTEXT parser (see the 20260818104243 migration
 * comment), so there is no database feature to lean on here. At the
 * documented catalogue size (<=5,000 SKUs) scoring every candidate in
 * Node is easily fast enough — see product.test.ts's timed test against
 * a real few-thousand-row seed, not just this comment's say-so.
 */

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

/** How many edits still count as "basically the same word" — scales
 * with word length so a typo in "milo" isn't held to the same bar as
 * one in "worcestershire". */
function editThreshold(wordLength: number): number {
  if (wordLength <= 4) return 1;
  if (wordLength <= 8) return 2;
  return 3;
}

/**
 * Every word in the query must fuzzy-match some word in the candidate
 * text (a prefix match costs nothing; otherwise the best Levenshtein
 * distance found, if within threshold). Returns null when any query
 * word doesn't match closely enough to anything — a non-match, not a
 * bad score. Lower is better among matches.
 */
export function matchScore(query: string, candidateTexts: string[]): number | null {
  const queryWords = tokenize(query);
  if (queryWords.length === 0) return 0;

  const candidateWords = candidateTexts.flatMap(tokenize);
  if (candidateWords.length === 0) return null;

  let total = 0;
  for (const q of queryWords) {
    let best = Infinity;
    for (const c of candidateWords) {
      if (c === q) {
        best = 0;
        break;
      }
      if (c.startsWith(q) || q.startsWith(c)) {
        best = Math.min(best, 0.5); // real, but weaker than an exact hit
        continue;
      }
      const d = distance(q, c);
      if (d < best) best = d;
    }
    if (best > editThreshold(q.length)) return null;
    total += best;
  }
  return total;
}
