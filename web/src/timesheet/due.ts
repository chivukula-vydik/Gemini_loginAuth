export type DueUrgency = 'overdue' | 'soon' | 'ok';

export function daysUntil(dueISO: string, todayISO: string): number {
  const due = Date.parse(`${dueISO}T00:00:00Z`);
  const today = Date.parse(`${todayISO}T00:00:00Z`);
  if (Number.isNaN(due) || Number.isNaN(today)) return NaN;
  return Math.round((due - today) / 86_400_000);
}

// Classifies how close a deadline is. Completed tasks are never urgent.
export function dueUrgency(
  dueISO: string | null | undefined,
  todayISO: string,
  status?: string,
  soonDays = 3,
): DueUrgency | null {
  if (!dueISO) return null;
  if (status === 'done') return 'ok';
  const d = daysUntil(dueISO, todayISO);
  if (Number.isNaN(d)) return null;
  if (d < 0) return 'overdue';
  if (d <= soonDays) return 'soon';
  return 'ok';
}

export function dueLabel(dueISO: string, todayISO: string): string {
  const d = daysUntil(dueISO, todayISO);
  if (Number.isNaN(d)) return '';
  if (d < 0) return `${Math.abs(d)}d overdue`;
  if (d === 0) return 'due today';
  if (d === 1) return 'due tomorrow';
  return `${d}d left`;
}
