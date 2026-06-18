type A = { estimatedHours?: number | null };

export function estimateSummary(assignees: A[]) {
  const list = assignees || [];
  const submitted = list.filter((a) => a && a.estimatedHours != null).length;
  const total = list.reduce((s, a) => s + (a && a.estimatedHours != null ? Number(a.estimatedHours) : 0), 0);
  return { submitted, total, count: list.length, allIn: list.length > 0 && submitted === list.length };
}
