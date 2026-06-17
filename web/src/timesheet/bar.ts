export type BarSegment = {
  startCol: number;
  endCol: number;
  continuesLeft: boolean;
  continuesRight: boolean;
};

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function weekBarSegment(
  weekStart: string,
  startISO: string | null | undefined,
  endISO: string | null | undefined,
): BarSegment | null {
  if (!startISO || !endISO) return null;
  const dates = [0, 1, 2, 3, 4].map((i) => addDays(weekStart, i));
  const monday = dates[0];
  const friday = dates[4];
  if (endISO < monday || startISO > friday) return null;

  let startCol = 0;
  for (let i = 0; i < 5; i++) { if (dates[i] >= startISO) { startCol = i; break; } }
  if (startISO <= monday) startCol = 0;

  let endCol = 4;
  for (let i = 4; i >= 0; i--) { if (dates[i] <= endISO) { endCol = i; break; } }
  if (endISO >= friday) endCol = 4;

  return {
    startCol,
    endCol,
    continuesLeft: startISO < monday,
    continuesRight: endISO > friday,
  };
}
