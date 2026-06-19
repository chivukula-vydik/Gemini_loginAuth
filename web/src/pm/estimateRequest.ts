type EstimateLike = {
  myEstimatedHours?: number | null;
  myPendingHours?: number | null;
  assigneeCount?: number;
  submittedCount?: number;
  estimatesPending?: boolean;
  estimatedHours?: number;
};

export type EstimateState = 'empty' | 'pending-new' | 'approved' | 'pending-change';

export type TeamEstimate = { total: number | null; submitted: number; count: number; allIn: boolean };

export type EstimateView = {
  state: EstimateState;
  approvedHours: number | null;
  pendingHours: number | null;
  team: TeamEstimate | null;
};

export function estimateCellState(task: EstimateLike): EstimateView {
  const approvedHours = task.myEstimatedHours ?? null;
  const pendingHours = task.myPendingHours ?? null;

  let state: EstimateState;
  if (pendingHours != null) state = approvedHours != null ? 'pending-change' : 'pending-new';
  else state = approvedHours != null ? 'approved' : 'empty';

  const count = task.assigneeCount ?? 0;
  const team: TeamEstimate | null = count > 1
    ? {
        total: task.estimatesPending ? null : (task.estimatedHours ?? 0),
        submitted: task.submittedCount ?? 0,
        count,
        allIn: !task.estimatesPending,
      }
    : null;

  return { state, approvedHours, pendingHours, team };
}
