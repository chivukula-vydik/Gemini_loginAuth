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
