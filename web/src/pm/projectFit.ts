// Project fit: is this person right for THIS project, right now? Pure verdict
// over the candidate signals the API already computes — no React, no fetch.

export const TASK_LIMIT = 5; // open assignments at/above which a person is "stretched"

export type FitVerdict = 'good' | 'ok' | 'poor';

type FitInput = {
  skillsOk: boolean;
  status: 'available' | 'standby' | 'busy';
  activeTaskCount: number;
};

export function projectFit({ skillsOk, status, activeTaskCount }: FitInput): FitVerdict {
  const overloaded = status === 'busy' || activeTaskCount >= TASK_LIMIT;
  if (skillsOk && !overloaded) return 'good';
  if (!skillsOk && overloaded) return 'poor';
  return 'ok';
}

export const FIT_LABEL: Record<FitVerdict, string> = {
  good: 'Good fit',
  ok: 'OK',
  poor: 'Poor',
};

// A displayed caution (not part of the score): staffing a PM/admin as a member.
export function roleNote(role: string | undefined): string | null {
  if (!role || role === 'employee') return null;
  const article = role === 'admin' ? 'an' : 'a';
  return `Adding ${article} ${role} as a member`;
}
