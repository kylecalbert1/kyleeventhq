// Weekly helpers — Monday-based week key (YYYY-MM-DD of Monday).
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

export function currentWeekStart(): string {
  return toISODate(mondayOf(new Date()));
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
