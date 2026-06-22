// Company fit: persistent, person-level reliability. Pure verdict over the
// reputation rollup the API returns. No React, no fetch. People with no history
// stay neutral (reliable) rather than being penalized for absence of data.

export type Reputation = {
  _id: string; displayName: string; email: string; role: string;
  reestimations: { total: number; approved: number; rejected: number; pending: number };
  direction: { under: number; over: number; same: number };
  completion: { done: number; assigned: number; rate: number };
  onTime: { measured: number; onTime: number; rate: number | null; avgDelayDays: number | null };
};

export type ReliabilityVerdict = 'reliable' | 'mixed' | 'unreliable';

const REEST_STRIKE = 3;        // total re-estimations at/above which it's a strike
const COMPLETION_MIN_TASKS = 3; // need this many assignments before completion counts
const COMPLETION_FLOOR = 0.5;   // completion rate below this is a strike
const ONTIME_FLOOR = 0.5;       // on-time rate below this is a strike

export function companyFit(r: Reputation): ReliabilityVerdict {
  let strikes = 0;
  if (r.reestimations.total >= REEST_STRIKE) strikes += 1;
  if (r.completion.assigned >= COMPLETION_MIN_TASKS && r.completion.rate < COMPLETION_FLOOR) strikes += 1;
  if (r.onTime.rate != null && r.onTime.rate < ONTIME_FLOOR) strikes += 1;
  if (strikes >= 2) return 'unreliable';
  if (strikes === 1) return 'mixed';
  return 'reliable';
}

export const RELIABILITY_LABEL: Record<ReliabilityVerdict, string> = {
  reliable: 'Reliable',
  mixed: 'Mixed',
  unreliable: 'Unreliable',
};
