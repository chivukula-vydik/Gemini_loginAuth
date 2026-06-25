import { useEffect, useState } from 'react';
import {
  listSubmittedTimesheets, decideTimesheet, getTimesheetDetail,
  SubmittedTimesheet, TimesheetDetail, ReviewTaskDetail,
} from '../pm/pmApi';
import { personName } from '../pm/personName';
import { formatMinutes, DAY_LABELS, columnDates, weekRangeLabel } from './time';
import type { Day } from './time';

const DAYS: Day[] = ['mon', 'tue', 'wed', 'thu', 'fri'];

export function TimesheetReview() {
  const [sheets, setSheets] = useState<SubmittedTimesheet[]>([]);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TimesheetDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [returnReason, setReturnReason] = useState('');

  function reload() {
    listSubmittedTimesheets().then(setSheets).catch((e) => setError(e.message));
  }
  useEffect(() => { reload(); }, []);

  async function openDetail(id: string) {
    if (selectedId === id) { setSelectedId(null); setDetail(null); return; }
    setSelectedId(id);
    setDetail(null);
    setLoadingDetail(true);
    try {
      const d = await getTimesheetDetail(id);
      setDetail(d);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingDetail(false);
    }
  }

  async function decide(id: string, decision: 'approve' | 'return') {
    setError('');
    try {
      await decideTimesheet(id, decision, decision === 'return' ? returnReason : undefined);
      setSelectedId(null);
      setDetail(null);
      setReturnReason('');
      reload();
    } catch (e) { setError((e as Error).message); }
  }

  return (
    <div>
      <p className="ts-sub" style={{ marginBottom: 16 }}>
        {sheets.length} timesheet{sheets.length === 1 ? '' : 's'} awaiting review
      </p>
      {error && <p className="ts-error">{error}</p>}

      <div className="ts-review-list">
        {sheets.length === 0 && <p className="ts-empty">No submitted timesheets to review.</p>}
        {sheets.map((s) => {
          const isOpen = selectedId === s._id;
          return (
            <div key={s._id} className={`ts-review-card${isOpen ? ' ts-review-card-open' : ''}`}>
              <button className="ts-review-row" type="button" onClick={() => openDetail(s._id)}>
                <span className={`ts-expand-arrow${isOpen ? ' open' : ''}`}>&#9654;</span>
                <span className="ts-review-name">{personName(s.user)}</span>
                <span className="ts-review-meta">{s.weekStart} &middot; {(s.totalMinutes / 60).toFixed(1)}h</span>
                <span className="ts-review-meta ts-review-submitted">
                  Submitted {s.submittedAt ? s.submittedAt.slice(0, 10) : ''}
                </span>
              </button>

              {isOpen && (
                <div className="ts-review-detail">
                  {loadingDetail && <p className="ts-sub">Loading timesheet…</p>}
                  {detail && <TimesheetDetailView detail={detail} />}
                  {detail && (
                    <div className="ts-review-actions">
                      <button className="table-action approve" onClick={() => decide(s._id, 'approve')}>
                        Approve
                      </button>
                      <div className="ts-review-return-group">
                        <input
                          className="input ts-review-reason"
                          placeholder="Return reason (optional)"
                          value={returnReason}
                          onChange={(e) => setReturnReason(e.target.value)}
                        />
                        <button className="table-action danger" onClick={() => decide(s._id, 'return')}>
                          Return
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TimesheetDetailView({ detail }: { detail: TimesheetDetail }) {
  const colDates = columnDates(detail.weekStart);
  const rangeLabel = weekRangeLabel(detail.weekStart);

  const dayTotals = DAYS.map((d) =>
    detail.tasks.reduce((sum, t) => sum + (t.entries[d] || 0), 0),
  );
  const weekTotal = dayTotals.reduce((a, b) => a + b, 0);

  const billableTotal = detail.tasks.reduce((sum, t) =>
    sum + DAYS.reduce((s, d) => {
      const mins = t.entries[d] || 0;
      const isBillable = t.billable?.[d] ?? (t.projectBillingType !== 'non-billable');
      return s + (isBillable ? mins : 0);
    }, 0), 0);

  return (
    <div className="ts-detail-view">
      <div className="ts-detail-header">
        <span className="ts-detail-range">{rangeLabel}</span>
        <span className="ts-detail-totals">
          Total: <strong>{formatMinutes(weekTotal)}</strong>
          {billableTotal > 0 && <> &middot; Billable: <strong>{formatMinutes(billableTotal)}</strong></>}
        </span>
      </div>

      <div className="ts-card">
        <table className="ts-table ts-detail-table">
          <thead>
            <tr>
              <th className="ts-task">Task</th>
              <th className="ts-project-col">Project</th>
              {DAYS.map((d) => (
                <th key={d} className="ts-day-col">{colDates[d]}</th>
              ))}
              <th className="ts-total-col">Total</th>
            </tr>
          </thead>
          <tbody>
            {detail.tasks.map((t) => (
              <TaskRow key={t.id} task={t} />
            ))}
          </tbody>
          <tfoot>
            <tr className="ts-totals-row">
              <td className="ts-task"><strong>Daily Total</strong></td>
              <td className="ts-project-col" />
              {DAYS.map((d, i) => (
                <td key={d} className="ts-day-col"><strong>{formatMinutes(dayTotals[i])}</strong></td>
              ))}
              <td className="ts-total-col"><strong>{formatMinutes(weekTotal)}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function TaskRow({ task }: { task: ReviewTaskDetail }) {
  const rowTotal = DAYS.reduce((s, d) => s + (task.entries[d] || 0), 0);
  const hasNotes = DAYS.some((d) => task.notes[d]);

  return (
    <>
      <tr>
        <td className="ts-task">{task.name || 'Untitled'}</td>
        <td className="ts-project-col">
          {task.projectName && <span className="ts-project-tag">{task.projectName}</span>}
        </td>
        {DAYS.map((d) => {
          const mins = task.entries[d] || 0;
          const isBillable = task.billable?.[d] ?? (task.projectBillingType !== 'non-billable');
          return (
            <td key={d} className={`ts-day-col${isBillable ? ' ts-billable-cell' : ''}`}>
              {mins > 0 ? formatMinutes(mins) : '—'}
            </td>
          );
        })}
        <td className="ts-total-col"><strong>{formatMinutes(rowTotal)}</strong></td>
      </tr>
      {hasNotes && (
        <tr className="ts-note-row">
          <td colSpan={2 + DAYS.length + 1}>
            <div className="ts-inline-notes">
              {DAYS.filter((d) => task.notes[d]).map((d) => (
                <span key={d} className="ts-inline-note">
                  <strong>{DAY_LABELS[d]}:</strong> {task.notes[d]}
                </span>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
