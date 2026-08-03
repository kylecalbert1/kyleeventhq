/**
 * Build a one-click LinkedIn people-search URL for an attendee.
 * Tito never returns LinkedIn profiles, so the best we can do is pre-fill
 * LinkedIn's people search with the person's name + company.
 */
export function linkedinSearchUrl(
  name?: string | null,
  company?: string | null,
): string | null {
  const n = (name ?? "").trim();
  if (!n) return null;
  const keywords = [n, (company ?? "").trim()].filter(Boolean).join(" ");
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(
    keywords,
  )}`;
}
