// Shared fuzzy / typo-tolerant search scoring used by every search bar in the
// app. Goals:
//  1. tolerate 1-2 character typos  ("custmer sucess" → "Customer Success")
//  2. tolerate word order + extra words ("2025 customer support" →
//     "Customer Support Summit 2025")
//  3. tolerate partial words ("cust succ" → "Customer Success")
//  4. rank exact / closer matches above loose fuzzy ones
//
// Implementation is a small token-based scorer on top of a bounded
// Levenshtein distance – no dependency, deterministic, cheap enough to run
// over a few thousand rows inside a useMemo.

export function normalizeText(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokens(s: string): string[] {
  const n = normalizeText(s);
  return n ? n.split(" ") : [];
}

/** Levenshtein distance, bailing out early once it exceeds `max`. */
export function levenshtein(a: string, b: string, max = 3): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev = new Array<number>(b.length + 1);
  const cur = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return max + 1;
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j];
  }
  return prev[b.length];
}

/** How many edits we forgive for a token of this length. */
function allowedEdits(len: number): number {
  if (len <= 3) return 0;
  if (len <= 5) return 1;
  return 2;
}

/** Score one query token against one haystack token. 0 = no match. */
function scoreToken(q: string, t: string): number {
  if (q === t) return 1;
  if (t.startsWith(q)) {
    // partial word: "cust" → "customer". Longer prefixes score higher.
    return 0.75 + 0.2 * (q.length / t.length);
  }
  if (q.length >= 3 && t.includes(q)) return 0.7;
  const max = allowedEdits(Math.max(q.length, t.length));
  if (max > 0) {
    const d = levenshtein(q, t, max);
    if (d <= max) return 0.72 - 0.12 * d;
    // typo against a prefix of the token ("sucess" vs "successful")
    if (q.length + max < t.length) {
      const dp = levenshtein(q, t.slice(0, q.length + 1), max);
      if (dp <= max) return 0.6 - 0.1 * dp;
    }
  }
  return 0;
}

/**
 * Score a query against a haystack string.
 * Returns 0 when the record should be filtered out, otherwise a positive
 * relevance score (higher = better).
 */
export function fuzzyScore(query: string, haystack: string | null | undefined): number {
  const qNorm = normalizeText(query);
  if (!qNorm) return 1;
  const hNorm = normalizeText(haystack);
  if (!hNorm) return 0;

  // Fast path: the whole query appears verbatim.
  if (hNorm.includes(qNorm)) {
    return 3 + (hNorm.startsWith(qNorm) ? 1 : 0) + qNorm.length / (hNorm.length + 1);
  }

  const qTokens = qNorm.split(" ");
  const hTokens = hNorm.split(" ");
  let total = 0;
  let exacts = 0;
  for (const qt of qTokens) {
    let best = 0;
    for (const ht of hTokens) {
      const s = scoreToken(qt, ht);
      if (s > best) best = s;
      if (best === 1) break;
    }
    if (best === 0) return 0; // every query token must match something
    if (best === 1) exacts++;
    total += best;
  }
  const avg = total / qTokens.length;
  // Ordered matches rank a little above shuffled ones.
  const ordered = hTokens.filter((_, i) => i < qTokens.length && hTokens[i] === qTokens[i]).length;
  return avg + exacts * 0.05 + ordered * 0.02;
}

/** Score a query against several fields; best field wins. */
export function fuzzyScoreFields(
  query: string,
  fields: Array<string | null | undefined>,
): number {
  const qNorm = normalizeText(query);
  if (!qNorm) return 1;
  let best = 0;
  // Combined haystack lets multi-word queries span fields (name + company).
  const combined = fields.filter(Boolean).join(" ");
  best = fuzzyScore(query, combined);
  for (const f of fields) {
    const s = fuzzyScore(query, f);
    if (s > best) best = s;
  }
  return best;
}

/** True when the record should stay visible for this query. */
export function fuzzyMatch(
  query: string,
  ...fields: Array<string | null | undefined>
): boolean {
  return fuzzyScoreFields(query, fields) > 0;
}

/**
 * Filter + rank a list. When the query is empty the original order is kept.
 */
export function fuzzyFilter<T>(
  items: T[],
  query: string,
  getFields: (item: T) => Array<string | null | undefined>,
): T[] {
  if (!normalizeText(query)) return items;
  return items
    .map((item, i) => ({ item, i, score: fuzzyScoreFields(query, getFields(item)) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => (b.score - a.score) || (a.i - b.i))
    .map((r) => r.item);
}
