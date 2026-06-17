export type SubmitStatus = 'draft' | 'submitted' | 'approved' | 'returned';

export function canSubmit(status: SubmitStatus, weekStart: string, currentMondayISO: string): boolean {
  return (status === 'draft' || status === 'returned') && weekStart <= currentMondayISO;
}

export function weekLocked(status: SubmitStatus): boolean {
  return status === 'submitted' || status === 'approved';
}
