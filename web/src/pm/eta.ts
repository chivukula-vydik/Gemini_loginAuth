export type EtaStatus = 'none' | 'ontrack' | 'late';

// Compare an employee's personal completion estimate (datetime) against a
// date-only PM deadline, treating the deadline as the end of that day.
export function etaStatus(etaAt: string | null | undefined, deadlineDate: string | null | undefined): EtaStatus {
  if (!etaAt) return 'none';
  if (!deadlineDate) return 'ontrack';
  const cutoff = new Date(`${deadlineDate}T23:59:59.999Z`);
  return new Date(etaAt).getTime() > cutoff.getTime() ? 'late' : 'ontrack';
}
