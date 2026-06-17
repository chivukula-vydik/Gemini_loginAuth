import { useState } from 'react';
import type { Person } from './pmApi';
import { equalShares, normalizeShares } from './workload';

type Row = { userId: string; sharePct: number };
type Props = {
  members: Person[];
  value: Row[];
  onSave: (next: { user: string; sharePct: number }[]) => void;
  onClose: () => void;
};

export function AssigneesEditor({ members, value, onSave, onClose }: Props) {
  const [rows, setRows] = useState<Row[]>(value);

  const selected = new Set(rows.map((r) => r.userId));
  const total = rows.reduce((s, r) => s + r.sharePct, 0);

  function toggle(userId: string) {
    setRows((prev) => {
      const exists = prev.some((r) => r.userId === userId);
      const nextIds = exists
        ? prev.filter((r) => r.userId !== userId).map((r) => r.userId)
        : [...prev.map((r) => r.userId), userId];
      const shares = equalShares(nextIds.length);
      return nextIds.map((id, i) => ({ userId: id, sharePct: shares[i] }));
    });
  }

  function setShare(userId: string, pct: number) {
    setRows((prev) => prev.map((r) => (r.userId === userId ? { ...r, sharePct: pct } : r)));
  }

  function equalize() {
    setRows((prev) => {
      const shares = equalShares(prev.length);
      return prev.map((r, i) => ({ ...r, sharePct: shares[i] }));
    });
  }

  function save() {
    const normalized = normalizeShares(rows.map((r) => r.sharePct));
    onSave(rows.map((r, i) => ({ user: r.userId, sharePct: normalized[i] })));
  }

  return (
    <div className="assignees-editor">
      <div className="assignees-list">
        {members.length === 0 && <span className="ts-sub">No project members yet.</span>}
        {members.map((m) => {
          const row = rows.find((r) => r.userId === m._id);
          return (
            <div key={m._id} className="assignees-row">
              <label className="assignees-pick">
                <input type="checkbox" checked={selected.has(m._id)} onChange={() => toggle(m._id)} />
                {m.displayName || m.email}
              </label>
              {row && (
                <span className="assignees-share">
                  <input
                    className="ts-pct" type="number" min={0} max={100} value={row.sharePct}
                    onChange={(e) => setShare(m._id, Number(e.target.value))}
                  />%
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className="assignees-foot">
        <span className={`assignees-total${total === 100 ? '' : ' off'}`}>Total {total}%</span>
        <button className="link-btn" type="button" onClick={equalize} disabled={rows.length === 0}>Equal split</button>
        <button className="btn btn-primary" type="button" onClick={save}>Save</button>
        <button className="link-btn" type="button" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}
