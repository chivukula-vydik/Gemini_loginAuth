import type { PastRecord } from './pmApi';

// A short scoping-risk signal read while staffing: how often this person has
// asked for re-estimations and how those resolved. Returns null when they never
// have, so the row stays clean (no false signal).
export function pastRecordLabel(pr: PastRecord | undefined): string | null {
  if (!pr || pr.total === 0) return null;
  const times = `asked re-estimation ${pr.total}×`;
  const parts: string[] = [];
  if (pr.approved) parts.push(`${pr.approved} approved`);
  if (pr.rejected) parts.push(`${pr.rejected} rejected`);
  if (pr.pending) parts.push(`${pr.pending} pending`);
  return parts.length ? `${times} · ${parts.join(', ')}` : times;
}

// Frequent re-estimators are worth a visual flag in the staffing list.
export function isScopingRisk(pr: PastRecord | undefined, threshold = 3): boolean {
  return !!pr && pr.total >= threshold;
}
