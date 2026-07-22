// Event lifecycle: derived automatically from event_date.
// A "past" event is one whose event_date is strictly before today (local midnight).
// Events with no event_date are treated as upcoming (not yet scheduled).

export function isPastEvent(event: { event_date?: string | null } | null | undefined): boolean {
  if (!event) return false;
  const iso = event.event_date;
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d.getTime() < today.getTime();
}

export function isUpcomingEvent(event: { event_date?: string | null } | null | undefined): boolean {
  return !isPastEvent(event);
}

export function partitionByLifecycle<T extends { event_date?: string | null }>(
  events: T[],
): { upcoming: T[]; past: T[] } {
  const upcoming: T[] = [];
  const past: T[] = [];
  for (const e of events) (isPastEvent(e) ? past : upcoming).push(e);
  return { upcoming, past };
}
