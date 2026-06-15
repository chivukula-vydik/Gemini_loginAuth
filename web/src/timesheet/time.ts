export type Day = 'mon' | 'tue' | 'wed' | 'thu' | 'fri';
export const DAYS: Day[] = ['mon', 'tue', 'wed', 'thu', 'fri'];
export const DAY_LABELS: Record<Day, string> = {
  mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri',
};

// Parse flexible time text into whole minutes. Unparseable/empty -> 0.
// Accepts: "2h 30m", "2h", "30m", "90m", "2:30", "1.5h", "1.5", "2".
export function parseTimeInput(raw: string): number {
  const s = (raw ?? '').trim().toLowerCase();
  if (s === '') return 0;

  // H:MM colon format
  const colon = s.match(/^(\d+):([0-5]?\d)$/);
  if (colon) return Number(colon[1]) * 60 + Number(colon[2]);

  // unit-based: any combination of "<num>h" and "<num>m"
  if (/[hm]/.test(s)) {
    let minutes = 0;
    let matched = false;
    const h = s.match(/(\d+(?:\.\d+)?)\s*h/);
    if (h) { minutes += Math.round(Number(h[1]) * 60); matched = true; }
    const m = s.match(/(\d+(?:\.\d+)?)\s*m/);
    if (m) { minutes += Math.round(Number(m[1])); matched = true; }
    return matched ? minutes : 0;
  }

  // bare number -> hours (decimal allowed)
  const num = Number(s);
  if (Number.isFinite(num) && num >= 0) return Math.round(num * 60);
  return 0;
}

// Whole minutes -> "Hh MMm" with zero-padded minutes.
export function formatMinutes(min: number): string {
  const total = Math.max(0, Math.round(min || 0));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

// --- week helpers (all UTC to avoid TZ drift) ---

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Monday (YYYY-MM-DD) of the week containing `date` (defaults to today).
export function mondayOf(date: Date = new Date()): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dow = d.getUTCDay(); // 0=Sun..6=Sat
  const diff = (dow === 0 ? -6 : 1 - dow); // shift back to Monday
  d.setUTCDate(d.getUTCDate() + diff);
  return toISODate(d);
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return toISODate(d);
}

export const prevWeek = (weekStart: string) => addDays(weekStart, -7);
export const nextWeek = (weekStart: string) => addDays(weekStart, 7);

// Per-column label like "Mon 16" for a given weekStart Monday.
export function columnDates(weekStart: string): Record<Day, string> {
  const out = {} as Record<Day, string>;
  DAYS.forEach((day, i) => {
    const d = new Date(`${addDays(weekStart, i)}T00:00:00Z`);
    out[day] = `${DAY_LABELS[day]} ${d.getUTCDate()}`;
  });
  return out;
}

// Human label for the whole week, e.g. "Jun 15 – 19, 2026".
export function weekRangeLabel(weekStart: string): string {
  const start = new Date(`${weekStart}T00:00:00Z`);
  const end = new Date(`${addDays(weekStart, 4)}T00:00:00Z`);
  const mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const sameMonth = start.getUTCMonth() === end.getUTCMonth();
  const left = `${mon[start.getUTCMonth()]} ${start.getUTCDate()}`;
  const right = sameMonth
    ? `${end.getUTCDate()}`
    : `${mon[end.getUTCMonth()]} ${end.getUTCDate()}`;
  return `${left} – ${right}, ${end.getUTCFullYear()}`;
}
