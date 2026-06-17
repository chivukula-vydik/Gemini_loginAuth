// Pure share math for multi-assignee workload distribution.

export function equalShares(n) {
  const count = Math.max(0, Math.floor(n));
  if (count === 0) return [];
  const base = Math.floor(100 / count);
  let rem = 100 - base * count;
  return Array.from({ length: count }, () => {
    if (rem > 0) { rem -= 1; return base + 1; }
    return base;
  });
}

export function normalizeShares(shares) {
  if (!Array.isArray(shares) || shares.length === 0) return [];
  const clamped = shares.map((s) => Math.min(100, Math.max(0, Number(s) || 0)));
  const sum = clamped.reduce((a, b) => a + b, 0);
  if (sum === 0) return equalShares(clamped.length);
  const scaled = clamped.map((s) => Math.round((s / sum) * 100));
  const drift = 100 - scaled.reduce((a, b) => a + b, 0);
  scaled[0] += drift; // park rounding drift on the first entry
  return scaled;
}

export function assigneeHours(estimatedHours, sharePct) {
  const est = Number(estimatedHours);
  const pct = Number(sharePct);
  if (!Number.isFinite(est) || est < 0 || !Number.isFinite(pct) || pct < 0) return 0;
  return Math.round((est * pct) / 10) / 10;
}
