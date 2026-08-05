// Weekly helpers - Monday-based week key (YYYY-MM-DD of Monday).
export function mondayOf(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay(); // 0 = Sun
  const diff = (day + 6) % 7; // days since Monday
  x.setDate(x.getDate() - diff);
  return x;
}

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Always compute "today" in Europe/London so the week key is identical whether
// this runs in the browser or on a server in some other timezone.
export function currentWeekStart(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date()); // YYYY-MM-DD
  const [y, m, d] = parts.split("-").map(Number);
  // Build as UTC-noon to avoid any DST edge shifting the calendar day.
  const local = new Date(Date.UTC(y, m - 1, d, 12));
  const day = local.getUTCDay();
  const diff = (day + 6) % 7;
  local.setUTCDate(local.getUTCDate() - diff);
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}-${String(local.getUTCDate()).padStart(2, "0")}`;
}

export function formatWeekLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `W/C ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${String(y).slice(2)}`;
}

export function shiftWeek(iso: string, weeks: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + weeks * 7);
  return toISODate(dt);
}
