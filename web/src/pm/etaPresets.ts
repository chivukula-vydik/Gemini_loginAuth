export const WORKDAY_END_HOUR = 18; // 6 PM local — default "end of day" for a completion estimate.

export type EtaPreset = {
  key: 'today' | 'tomorrow' | 'in2' | 'friday' | 'deadline';
  label: string;
  dateISO: string;
};

// A local calendar date (YYYY-MM-DD) at `hour` local time, as an ISO (UTC) string.
export function etaIsoAt(dateISO: string, hour = WORKDAY_END_HOUR): string {
  const [y, m, d] = dateISO.split('-').map(Number);
  return new Date(y, m - 1, d, hour, 0, 0, 0).toISOString();
}

function parseUTC(dateISO: string): Date {
  const [y, m, d] = dateISO.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function addDaysISO(dateISO: string, n: number): string {
  const dt = parseUTC(dateISO);
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

// Friday of the Mon-Fri week containing `dateISO`.
function fridayOfWeekISO(dateISO: string): string {
  const dt = parseUTC(dateISO);
  const dow = dt.getUTCDay(); // 0=Sun..6=Sat
  const toMonday = dow === 0 ? -6 : 1 - dow;
  dt.setUTCDate(dt.getUTCDate() + toMonday + 4);
  return dt.toISOString().slice(0, 10);
}

export function presetDates(todayISO: string, deadlineISO: string | null): EtaPreset[] {
  const presets: EtaPreset[] = [
    { key: 'today', label: 'Today EOD', dateISO: todayISO },
    { key: 'tomorrow', label: 'Tomorrow EOD', dateISO: addDaysISO(todayISO, 1) },
    { key: 'in2', label: 'In 2 days', dateISO: addDaysISO(todayISO, 2) },
    { key: 'friday', label: 'This Friday', dateISO: fridayOfWeekISO(todayISO) },
  ];
  if (deadlineISO) presets.push({ key: 'deadline', label: 'On deadline', dateISO: deadlineISO });
  return presets;
}
