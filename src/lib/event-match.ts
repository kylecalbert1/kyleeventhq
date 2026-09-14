/**
 * Best-effort matching of an email thread (subject + body) to an event, so the
 * "Apply status" modal can pre-select the right summit instead of guessing.
 */

export type MatchableEvent = { id: string; code: string; name: string };

const STOP = new Set([
  "summit",
  "conference",
  "event",
  "the",
  "and",
  "for",
  "of",
  "a",
  "an",
  "re",
  "fwd",
]);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean);
}

/** Weight a token: years and very short tokens are weak signals on their own. */
function weight(tok: string): number {
  if (/^(19|20)\d{2}$/.test(tok)) return 0.5;
  if (tok.length <= 2) return 0.25;
  return 1;
}

export function matchEventFromText(
  text: string,
  events: MatchableEvent[],
): string | null {
  const haystack = ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
  const hayTokens = new Set(tokenize(text));

  let best: { id: string; score: number } | null = null;
  let runnerUp = 0;

  for (const ev of events) {
    let score = 0;

    // Exact event code (e.g. "CCO-SF-26") mentioned anywhere is decisive.
    const code = ev.code?.toLowerCase().trim();
    if (code && haystack.includes(` ${code.replace(/[^a-z0-9]+/g, " ")} `)) {
      score += 5;
    }

    const nameTokens = tokenize(ev.name).filter((t) => !STOP.has(t));
    for (const t of nameTokens) {
      if (hayTokens.has(t)) score += weight(t);
    }

    // Acronym expansion: an event named "CCO ..." should match a thread that
    // spells out "Chief Customer Officer".
    for (const t of nameTokens) {
      if (t.length >= 2 && t.length <= 5 && t === t.toLowerCase()) {
        const initials = new RegExp(
          `\\b${t.split("").join("[a-z]+\\s+")}[a-z]+\\b`,
          "i",
        );
        if (!hayTokens.has(t) && initials.test(text)) score += 1;
      }
    }

    if (!best || score > best.score) {
      runnerUp = best?.score ?? 0;
      best = { id: ev.id, score };
    } else if (score > runnerUp) {
      runnerUp = score;
    }
  }

  // Require a real signal, and a clear winner over the next-best event.
  if (!best || best.score < 1.5 || best.score - runnerUp < 0.75) return null;
  return best.id;
}
