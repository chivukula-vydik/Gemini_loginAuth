import { useState } from 'react';
import { applyLeave, LeaveType, LEAVE_TYPE_LABELS } from './leaveApi';

const LEAVE_OPTIONS: LeaveType[] = ['casual', 'sick', 'earned', 'unpaid'];

// Shared leave-request modal used by both the Attendance and Timesheet pages.
export function LeaveModal({ today, start: initialStart, onClose, onSubmitted }: {
  today: string;
  start?: string;                 // optional preselected start/end date
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const base = initialStart || today;
  const [type, setType] = useState<LeaveType>('casual');
  const [start, setStart] = useState(base);
  const [end, setEnd] = useState(base);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!start || !end) { setErr('Pick a start and end date.'); return; }
    if (end < start) { setErr('End date is before the start date.'); return; }
    setBusy(true); setErr('');
    try {
      await applyLeave(type, start, end, reason.trim());
      onSubmitted();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="att-modal-backdrop" onClick={onClose}>
      <div className="att-modal ts-card" onClick={(e) => e.stopPropagation()}>
        <h2 className="section-title">Apply for leave</h2>
        <label className="att-field">
          <span>Type</span>
          <select value={type} onChange={(e) => setType(e.target.value as LeaveType)}>
            {LEAVE_OPTIONS.map((t) => <option key={t} value={t}>{LEAVE_TYPE_LABELS[t]}</option>)}
          </select>
        </label>
        <div className="att-field-row">
          <label className="att-field">
            <span>From</span>
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className="att-field">
            <span>To</span>
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
        </div>
        <label className="att-field">
          <span>Reason</span>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Optional note for your approver" />
        </label>
        {err && <p className="ts-error">{err}</p>}
        <div className="att-modal-actions">
          <button className="att-act" disabled={busy} onClick={onClose}>Cancel</button>
          <button className="att-act att-act-primary" disabled={busy} onClick={submit}>Submit request</button>
        </div>
      </div>
    </div>
  );
}
