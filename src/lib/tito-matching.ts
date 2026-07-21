// Pure helpers for reconciling tracker speakers against Tito tickets.
// No IO; every fn is deterministic so it can be unit-tested and re-used
// from both the server-fn handler and any client-side previews.

export function normEmail(e: string | null | undefined): string {
  return (e ?? "").trim().toLowerCase();
}

// Strip punctuation, collapse whitespace, split into tokens.
function tokenize(name: string | null | undefined): string[] {
  if (!name) return [];
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1); // drop initials/noise
}

// Jaccard similarity over the token sets. Robust to first/last order swaps
// and mismatched middle names.
export function nameSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  const A = new Set(tokenize(a));
  const B = new Set(tokenize(b));
  if (A.size === 0 || B.size === 0) return 0;
  let intersect = 0;
  for (const t of A) if (B.has(t)) intersect++;
  const union = A.size + B.size - intersect;
  return union === 0 ? 0 : intersect / union;
}

export type SpeakerLite = {
  id: string;
  name: string | null;
  email: string | null;
  company: string | null;
  status: string | null;
  source_ticket_id: string | null;
};

export type TicketLite = {
  id: string;
  name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  company_name: string | null;
  job_title: string | null;
  release_title: string | null;
  release_slug: string | null;
};

export type MatchResult = {
  // Confirmed speakers who don't have any Speaker Pass / Speaker Guest ticket
  // for this event — either they haven't registered yet, or they registered
  // with an email/name we couldn't confidently link.
  needsRegistration: Array<SpeakerLite & { copy_link_hint: string | null }>;
  // Tito Speaker Pass / Speaker Guest holders who aren't already in the tracker
  // (and aren't a fuzzy match against anyone).
  notInTracker: TicketLite[];
  // Cross-email matches worth confirming. Score is 0..1.
  likelyMatches: Array<{ speaker: SpeakerLite; ticket: TicketLite; score: number; reason: string }>;
  // Confirmed speakers with no email at all — unreachable, needs manual fix.
  unreachable: SpeakerLite[];
};

function isSpeakerRelease(title: string | null | undefined): "pass" | "guest" | null {
  const t = (title ?? "").toLowerCase();
  if (!t) return null;
  if (t.includes("speaker pass")) return "pass";
  if (t.includes("speaker guest") || t.includes("guest pass")) return "guest";
  return null;
}

/**
 * Reconcile a tracker's speakers against synced Tito tickets for one event.
 *
 * @param speakers          all tracker speakers for the event
 * @param tickets           all Tito tickets for the event's tito_slug
 * @param nameThreshold     Jaccard similarity threshold for "same person, different email" (default 0.75)
 */
export function reconcile(
  speakers: SpeakerLite[],
  tickets: TicketLite[],
  nameThreshold = 0.75,
): MatchResult {
  const speakerTicketIds = new Set(speakers.map((s) => s.source_ticket_id).filter(Boolean) as string[]);
  const speakersByEmail = new Map<string, SpeakerLite>();
  for (const s of speakers) {
    const e = normEmail(s.email);
    if (e) speakersByEmail.set(e, s);
  }

  const speakerPassTickets = tickets.filter((t) => isSpeakerRelease(t.release_title) != null);
  const passTicketsByEmail = new Map<string, TicketLite>();
  for (const t of speakerPassTickets) {
    const e = normEmail(t.email);
    if (e) passTicketsByEmail.set(e, t);
  }

  // ── 1) Speakers who need to register ─────────────────────────────────────
  // Confirmed speakers whose email doesn't match any Speaker Pass/Guest ticket
  // AND who aren't linked via source_ticket_id.
  const confirmed = speakers.filter((s) => s.status === "confirmed");
  const linkedTicketIds = new Set(
    speakers.map((s) => s.source_ticket_id).filter(Boolean) as string[],
  );
  const needsRegistration: MatchResult["needsRegistration"] = [];
  const unreachable: SpeakerLite[] = [];
  for (const s of confirmed) {
    const email = normEmail(s.email);
    if (!email) {
      unreachable.push(s);
      continue;
    }
    const emailMatch = passTicketsByEmail.get(email);
    const linkMatch = s.source_ticket_id && speakerPassTickets.some((t) => t.id === s.source_ticket_id);
    if (!emailMatch && !linkMatch) {
      needsRegistration.push({ ...s, copy_link_hint: null });
    }
  }

  // ── 2) Speaker Pass/Guest holders not in tracker ─────────────────────────
  // Excludes anyone whose ticket is already linked, whose email matches a
  // tracker email, or who is a strong fuzzy-name candidate.
  const notInTracker: TicketLite[] = [];
  const likelyMatches: MatchResult["likelyMatches"] = [];

  for (const t of speakerPassTickets) {
    // Already linked via source_ticket_id?
    if (linkedTicketIds.has(t.id)) continue;

    const tEmail = normEmail(t.email);
    if (tEmail && speakersByEmail.has(tEmail)) continue; // exact-email match → tracker already has them

    // Fuzzy-name search against any speaker on the event.
    const ticketFullName = t.name ?? [t.first_name, t.last_name].filter(Boolean).join(" ").trim();
    let best: { s: SpeakerLite; score: number } | null = null;
    for (const s of speakers) {
      if (s.source_ticket_id) continue; // already linked to some ticket
      const score = nameSimilarity(ticketFullName, s.name);
      if (score >= nameThreshold && (!best || score > best.score)) {
        best = { s, score };
      }
    }
    if (best) {
      likelyMatches.push({
        speaker: best.s,
        ticket: t,
        score: best.score,
        reason: "Same name, different email",
      });
      continue;
    }
    notInTracker.push(t);
  }

  return { needsRegistration, notInTracker, likelyMatches, unreachable };
}
