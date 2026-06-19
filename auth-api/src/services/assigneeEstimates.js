export function submittedCount(assignees) {
  return (assignees || []).filter((a) => a && a.estimatedHours != null).length;
}

export function allEstimatesIn(assignees) {
  const list = assignees || [];
  return list.length > 0 && list.every((a) => a && a.estimatedHours != null);
}

export function sumEstimatedHours(assignees) {
  return (assignees || []).reduce((sum, a) => sum + (a && a.estimatedHours != null ? Number(a.estimatedHours) : 0), 0);
}

export function mergeAssignees(prevAssignees, userIds, shares) {
  const prevByUser = new Map((prevAssignees || []).map((a) => [String(a.user), a]));
  return userIds.map((user, i) => {
    const prev = prevByUser.get(String(user));
    return {
      user,
      sharePct: shares[i],
      estimatedHours: prev ? prev.estimatedHours ?? null : null,
      pendingValue: prev ? prev.pendingValue ?? 0 : 0,
      pendingUnit: prev ? prev.pendingUnit ?? 'hours' : 'hours',
      pendingHours: prev ? prev.pendingHours ?? null : null,
      pendingReason: prev ? prev.pendingReason ?? '' : '',
    };
  });
}
