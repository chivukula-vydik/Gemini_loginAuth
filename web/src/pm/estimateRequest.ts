import type { EstimateUnit } from './pmApi';

type EstimateLike = {
  myEstimatedHours?: number | null;
  myPendingHours?: number | null;
  myPendingValue?: number;
  myPendingUnit?: EstimateUnit;
  myPendingReason?: string;
};

export type PendingRequest = { value: number; unit: EstimateUnit; hours: number; reason: string };

export type EstimateCellState = {
  approvedHours: number | null;
  pending: PendingRequest | null;
  buttonLabel: 'Submit estimate' | 'Request estimate change';
};

export function estimateCellState(task: EstimateLike): EstimateCellState {
  const approvedHours = task.myEstimatedHours ?? null;
  const pending = task.myPendingHours != null
    ? {
        value: task.myPendingValue ?? 0,
        unit: task.myPendingUnit ?? 'hours',
        hours: task.myPendingHours,
        reason: task.myPendingReason ?? '',
      }
    : null;
  const buttonLabel = approvedHours == null && pending == null ? 'Submit estimate' : 'Request estimate change';
  return { approvedHours, pending, buttonLabel };
}
