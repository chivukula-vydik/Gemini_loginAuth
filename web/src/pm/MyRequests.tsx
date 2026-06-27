import { useEffect, useState } from 'react';
import { authed } from '../fetchHelper';

interface MyRequestItem {
  type: 'leave' | 'regularisation' | 'overtime';
  _id: string;
  status: string;
  details: Record<string, unknown>;
  submittedAt: string;
  decidedAt?: string;
}

const TYPE_LABELS: Record<string, string> = {
  leave: 'Leave',
  regularisation: 'Regularisation',
  overtime: 'Overtime',
};

const STATUS_COLORS: Record<string, string> = {
  pending: '#f59e0b',
  approved: '#22c55e',
  rejected: '#ef4444',
  cancelled: '#6b7280',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 12,
      fontSize: 12,
      fontWeight: 600,
      background: `${STATUS_COLORS[status] || '#6b7280'}22`,
      color: STATUS_COLORS[status] || '#6b7280',
    }}>
      {status}
    </span>
  );
}

function detailSummary(item: MyRequestItem): string {
  const d = item.details;
  if (item.type === 'leave') {
    const dates = d.startDate === d.endDate ? String(d.startDate) : `${d.startDate} → ${d.endDate}`;
    return `${d.leaveType} · ${dates} · ${d.days} day(s)`;
  }
  if (item.type === 'regularisation') {
    return `${d.date} · ${d.reason || 'No reason'}`;
  }
  if (item.type === 'overtime') {
    return `${d.date} · ${d.startTime} → ${d.endTime} · ${d.minutes}m`;
  }
  return '';
}

export function MyRequests() {
  const [items, setItems] = useState<MyRequestItem[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authed('/my-requests')
      .then((data) => setItems(data as MyRequestItem[]))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="ts-page">
      <header className="ts-header">
        <div>
          <h1 className="ts-h1">My Requests</h1>
          <p className="ts-sub">Track the status of your submitted requests</p>
        </div>
      </header>

      {error && <p className="ts-error">{error}</p>}
      {loading && <p className="ts-sub">Loading…</p>}

      <div className="ts-card">
        <table className="ts-table">
          <thead>
            <tr>
              <th className="ts-task">Type</th>
              <th className="col-left">Details</th>
              <th className="col-left">Submitted</th>
              <th className="col-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && !loading && (
              <tr><td colSpan={4} className="ts-empty">No requests found.</td></tr>
            )}
            {items.map((item) => (
              <tr key={`${item.type}-${item._id}`}>
                <td className="ts-task">{TYPE_LABELS[item.type] || item.type}</td>
                <td className="col-left">{detailSummary(item)}</td>
                <td className="col-left">{item.submittedAt ? new Date(item.submittedAt).toLocaleDateString() : '—'}</td>
                <td className="col-left"><StatusBadge status={item.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
