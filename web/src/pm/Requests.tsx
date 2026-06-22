import { useEffect, useState } from 'react';
import {
  listEditRequests, decideEditRequest, EditReq,
  listClaimRequests, decideClaimRequest, ClaimReq,
  listSubmittedTimesheets, decideTimesheet, SubmittedTimesheet,
} from './pmApi';
import { personName } from './personName';
import { getPendingRegularise, decideRegularise, RegularisePending } from '../attendance/attendanceApi';
import { getPendingLeave, decideLeave, LeavePending, LEAVE_TYPE_LABELS } from '../attendance/leaveApi';

const DAY_LABEL: Record<string, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri' };

export function Requests() {
  const [reqs, setReqs] = useState<EditReq[]>([]);
  const [claims, setClaims] = useState<ClaimReq[]>([]);
  const [sheets, setSheets] = useState<SubmittedTimesheet[]>([]);
  const [regs, setRegs] = useState<RegularisePending[]>([]);
  const [leaves, setLeaves] = useState<LeavePending[]>([]);
  const [error, setError] = useState('');

  function reload() {
    listEditRequests().then(setReqs).catch((e) => setError(e.message));
    listClaimRequests().then(setClaims).catch((e) => setError(e.message));
    listSubmittedTimesheets().then(setSheets).catch((e) => setError(e.message));
    getPendingRegularise().then(setRegs).catch((e) => setError(e.message));
    getPendingLeave().then(setLeaves).catch((e) => setError(e.message));
  }
  useEffect(() => { reload(); }, []);

  async function decideReg(id: string, decision: 'approved' | 'rejected') {
    setError('');
    try { await decideRegularise(id, decision); reload(); }
    catch (e) { setError((e as Error).message); }
  }

  async function decideLeaveReq(id: string, decision: 'approved' | 'rejected') {
    setError('');
    try { await decideLeave(id, decision); reload(); }
    catch (e) { setError((e as Error).message); }
  }

  async function decideSheet(id: string, decision: 'approve' | 'return') {
    setError('');
    try { await decideTimesheet(id, decision); reload(); }
    catch (e) { setError((e as Error).message); }
  }

  async function decideEdit(id: string, decision: 'approved' | 'denied') {
    setError('');
    try { await decideEditRequest(id, decision); reload(); }
    catch (e) { setError((e as Error).message); }
  }

  async function decideClaim(id: string, decision: 'approved' | 'denied') {
    setError('');
    try { await decideClaimRequest(id, decision); reload(); }
    catch (e) { setError((e as Error).message); }
  }

  const totalPending = sheets.length + reqs.length + claims.length + regs.length + leaves.length;

  return (
    <div className="ts-page">
      <header className="ts-header">
        <div>
          <h1 className="ts-h1">Requests</h1>
          <p className="ts-sub">{totalPending} item{totalPending === 1 ? '' : 's'} awaiting your review</p>
        </div>
      </header>

      <div className="ts-tiles">
        <div className="ts-tile ts-tile-accent">
          <span className="ts-tile-label">Timesheets</span>
          <span className="ts-tile-value">{sheets.length}</span>
        </div>
        <div className="ts-tile stat-est">
          <span className="ts-tile-label">Edit requests</span>
          <span className="ts-tile-value">{reqs.length}</span>
        </div>
        <div className="ts-tile stat-logged">
          <span className="ts-tile-label">Task claims</span>
          <span className="ts-tile-value">{claims.length}</span>
        </div>
        <div className="ts-tile">
          <span className="ts-tile-label">Regularise</span>
          <span className="ts-tile-value">{regs.length}</span>
        </div>
        <div className="ts-tile">
          <span className="ts-tile-label">Leave</span>
          <span className="ts-tile-value">{leaves.length}</span>
        </div>
      </div>

      {error && <p className="ts-error">{error}</p>}

      <h2 className="section-title">Submitted timesheets</h2>
      <div className="ts-card" style={{ marginBottom: 22 }}>
        <table className="ts-table">
          <thead><tr><th className="ts-task">Employee</th><th className="col-left">Week</th><th>Total hours</th><th className="col-left">Submitted</th><th className="col-left">Actions</th></tr></thead>
          <tbody>
            {sheets.length === 0 && <tr><td colSpan={5} className="ts-empty">No submitted timesheets.</td></tr>}
            {sheets.map((s) => (
              <tr key={s._id}>
                <td className="ts-task">{personName(s.user)}</td>
                <td className="col-left">{s.weekStart}</td>
                <td>{(s.totalMinutes / 60).toFixed(1)}h</td>
                <td className="col-left">{s.submittedAt ? s.submittedAt.slice(0, 10) : '—'}</td>
                <td className="col-left">
                  <div className="row-actions">
                    <button className="table-action approve" onClick={() => decideSheet(s._id, 'approve')}>Approve</button>
                    <button className="table-action danger" onClick={() => decideSheet(s._id, 'return')}>Return</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="section-title">Timesheet edit requests</h2>
      <div className="ts-card" style={{ marginBottom: 22 }}>
        <table className="ts-table">
          <thead><tr><th className="ts-task">Employee</th><th className="col-left">Week</th><th className="col-left">Day</th><th className="col-left">Project</th><th className="col-left">Reason</th><th className="col-left">Actions</th></tr></thead>
          <tbody>
            {reqs.length === 0 && <tr><td colSpan={6} className="ts-empty">No pending edit requests.</td></tr>}
            {reqs.map((r) => (
              <tr key={r._id}>
                <td className="ts-task">{personName(r.userId)}</td>
                <td className="col-left">{r.weekStart}</td>
                <td className="col-left">{DAY_LABEL[r.day] || r.day}</td>
                <td className="col-left">{r.projectId?.name || '—'}</td>
                <td className="col-left">{r.reason || '—'}</td>
                <td className="col-left">
                  <div className="row-actions">
                    <button className="table-action approve" onClick={() => decideEdit(r._id, 'approved')}>Approve</button>
                    <button className="table-action danger" onClick={() => decideEdit(r._id, 'denied')}>Deny</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="section-title">Task claims</h2>
      <div className="ts-card">
        <table className="ts-table">
          <thead><tr><th className="ts-task">Employee</th><th className="col-left">Task</th><th className="col-left">Project</th><th className="col-left">Actions</th></tr></thead>
          <tbody>
            {claims.length === 0 && <tr><td colSpan={4} className="ts-empty">No pending claims.</td></tr>}
            {claims.map((c) => (
              <tr key={c._id}>
                <td className="ts-task">{personName(c.user)}</td>
                <td className="col-left">{c.task?.title}</td>
                <td className="col-left">{c.project?.name}</td>
                <td className="col-left">
                  <div className="row-actions">
                    <button className="table-action approve" onClick={() => decideClaim(c._id, 'approved')}>Approve</button>
                    <button className="table-action danger" onClick={() => decideClaim(c._id, 'denied')}>Deny</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="section-title">Attendance regularise</h2>
      <div className="ts-card">
        <table className="ts-table">
          <thead><tr><th className="ts-task">Employee</th><th className="col-left">Date</th><th className="col-left">Reason</th><th className="col-left">Corrected</th><th className="col-left">Actions</th></tr></thead>
          <tbody>
            {regs.length === 0 && <tr><td colSpan={5} className="ts-empty">No pending regularise requests.</td></tr>}
            {regs.map((r) => (
              <tr key={r._id}>
                <td className="ts-task">{personName(r.userId)}</td>
                <td className="col-left">{r.date}</td>
                <td className="col-left">{r.regularise.reason || '—'}</td>
                <td className="col-left">
                  {r.regularise.correctedCheckIn || r.regularise.correctedCheckOut
                    ? `${r.regularise.correctedCheckIn || '—'} → ${r.regularise.correctedCheckOut || '—'}`
                    : '—'}
                </td>
                <td className="col-left">
                  <div className="row-actions">
                    <button className="table-action approve" onClick={() => decideReg(r._id, 'approved')}>Approve</button>
                    <button className="table-action danger" onClick={() => decideReg(r._id, 'rejected')}>Reject</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="section-title">Leave requests</h2>
      <div className="ts-card">
        <table className="ts-table">
          <thead><tr><th className="ts-task">Employee</th><th className="col-left">Type</th><th className="col-left">Dates</th><th>Days</th><th className="col-left">Reason</th><th className="col-left">Actions</th></tr></thead>
          <tbody>
            {leaves.length === 0 && <tr><td colSpan={6} className="ts-empty">No pending leave requests.</td></tr>}
            {leaves.map((lv) => (
              <tr key={lv._id}>
                <td className="ts-task">{personName(lv.userId)}</td>
                <td className="col-left">{LEAVE_TYPE_LABELS[lv.type]}</td>
                <td className="col-left">{lv.startDate === lv.endDate ? lv.startDate : `${lv.startDate} → ${lv.endDate}`}</td>
                <td>{lv.days}</td>
                <td className="col-left">{lv.reason || '—'}</td>
                <td className="col-left">
                  <div className="row-actions">
                    <button className="table-action approve" onClick={() => decideLeaveReq(lv._id, 'approved')}>Approve</button>
                    <button className="table-action danger" onClick={() => decideLeaveReq(lv._id, 'rejected')}>Reject</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
