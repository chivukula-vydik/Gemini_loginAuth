import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getToday, checkIn as apiCheckIn, checkOut as apiCheckOut,
  startBreak as apiStartBreak, endBreak as apiEndBreak,
  getMonth, getStats, requestRegularise,
  AttendanceDoc, AttendanceStatus, MonthStats, PunchType,
} from './attendanceApi';

const SHIFT_MINUTES = 540; // 9 hours

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

// --- helpers ---

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtHM(mins: number): string {
  const m = Math.max(0, Math.round(mins));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

function fmtClock(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function fmtTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

type PunchState = 'idle' | 'in' | 'on-break' | 'done';

function derivePunchState(doc: AttendanceDoc | null): PunchState {
  if (!doc || !doc.checkIn) return 'idle';
  if (doc.checkOut) return 'done';
  const hasOpenBreak = (doc.breaks || []).some((b) => !b.end);
  return hasOpenBreak ? 'on-break' : 'in';
}

function circleColor(status: AttendanceStatus): string {
  switch (status) {
    case 'present': case 'wfh': return 'var(--success)';
    case 'partial': case 'wfh-partial': return 'var(--warning)';
    case 'absent': return 'var(--danger)';
    case 'weekend': case 'holiday': return 'var(--faint)';
    default: return 'var(--faint)';
  }
}

const STATUS_PILL: Partial<Record<AttendanceStatus, string>> = {
  wfh: 'WFH', 'wfh-partial': 'WFH', leave: 'LEAVE', holiday: 'HOLIDAY',
};

// Returns the Monday-anchored 7 dates (YYYY-MM-DD) for the week containing today.
function currentWeekDates(): string[] {
  const now = new Date();
  const day = now.getDay();             // 0=Sun..6=Sat
  const offsetToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + offsetToMonday);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
}

function isLate(iso: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  return d.getHours() > 9 || (d.getHours() === 9 && d.getMinutes() > 30);
}

// --- main component ---

export function AttendancePage() {
  const [today, setToday] = useState<AttendanceDoc | null>(null);
  const [stats, setStats] = useState<MonthStats | null>(null);
  const [month, setMonth] = useState<AttendanceDoc[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);       // showing punch-type pills
  const [now, setNow] = useState(() => new Date());
  const [regulariseDate, setRegulariseDate] = useState<string | null>(null);

  const ref = new Date();
  const year = ref.getFullYear();
  const monthNum = ref.getMonth() + 1;

  const loadToday = useCallback(async () => {
    try {
      const doc = await getToday();
      setToday(doc);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const loadMonth = useCallback(async () => {
    try {
      const [docs, s] = await Promise.all([getMonth(year, monthNum), getStats(year, monthNum)]);
      setMonth(docs);
      setStats(s);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [year, monthNum]);

  useEffect(() => { loadToday(); loadMonth(); }, [loadToday, loadMonth]);

  // Poll today every 60s to keep status/shift bar in sync.
  useEffect(() => {
    const poll = setInterval(() => { loadToday(); }, 60_000);
    return () => clearInterval(poll);
  }, [loadToday]);

  // Tick the live clock + running timers every second.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const punchState = derivePunchState(today);

  async function run(fn: () => Promise<AttendanceDoc>) {
    setBusy(true);
    setError('');
    try {
      const doc = await fn();
      setToday(doc);
      loadMonth();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function onPickPunch(pt: PunchType) {
    setPicking(false);
    run(() => apiCheckIn(pt));
  }

  // Open break start time, for the running break timer.
  const openBreakStart = useMemo(() => {
    const ob = (today?.breaks || []).find((b) => !b.end);
    return ob ? new Date(ob.start).getTime() : null;
  }, [today]);

  const effectiveMinutes = today?.effectiveMinutes || 0;
  const breakMinutes = today?.breakMinutes || 0;

  // While clocked in (not done), show live worked time since check-in minus breaks.
  const liveEffective = useMemo(() => {
    if (!today?.checkIn) return effectiveMinutes;
    if (today.checkOut) return effectiveMinutes;
    const gross = (now.getTime() - new Date(today.checkIn).getTime()) / 60000;
    let brk = breakMinutes;
    if (openBreakStart) brk += (now.getTime() - openBreakStart) / 60000;
    return Math.max(0, gross - brk);
  }, [today, now, effectiveMinutes, breakMinutes, openBreakStart]);

  const fillPct = Math.min(100, (liveEffective / SHIFT_MINUTES) * 100);
  const breakPct = Math.min(100, (breakMinutes / SHIFT_MINUTES) * 100);

  const weekDates = useMemo(currentWeekDates, []);
  const byDate = useMemo(() => {
    const map = new Map<string, AttendanceDoc>();
    for (const d of month) map.set(d.date, d);
    return map;
  }, [month]);

  const logs = useMemo(() => [...month].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 30), [month]);

  return (
    <div className="ts-page att-page">
      <header className="ts-header">
        <h1 className="ts-h1">Attendance</h1>
        <p className="ts-sub">Clock in, track breaks, and review your monthly attendance.</p>
      </header>

      {error && <p className="ts-error">{error}</p>}

      {/* Stats */}
      <div className="ts-tiles">
        <div className="ts-tile ts-tile-accent">
          <span className="ts-tile-label">Avg hrs / day</span>
          <span className="ts-tile-value">{stats ? fmtHM(stats.avgMinutesPerDay) : '—'}</span>
        </div>
        <div className="ts-tile stat-logged">
          <span className="ts-tile-label">On time</span>
          <span className="ts-tile-value">{stats ? `${stats.onTimePct}%` : '—'}</span>
        </div>
        <div className="ts-tile stat-est">
          <span className="ts-tile-label">Present</span>
          <span className="ts-tile-value">{stats ? stats.present + stats.wfh : '—'}</span>
        </div>
        <div className="ts-tile">
          <span className="ts-tile-label">Absent</span>
          <span className="ts-tile-value">{stats ? stats.absent : '—'}</span>
        </div>
      </div>

      <div className="att-grid">
        {/* Clock card */}
        <div className="ts-card att-clock">
          <div className="att-clock-time">{fmtClock(now)}</div>
          <div className="att-clock-date">{now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}</div>

          {/* Shift bar */}
          <div className="att-shiftbar" title={`${fmtHM(liveEffective)} of 9:00`}>
            <div className="att-shiftbar-fill" style={{ width: `${fillPct}%` }} />
            {breakPct > 0 && <div className="att-shiftbar-break" style={{ width: `${breakPct}%` }} />}
          </div>
          <div className="att-shiftbar-legend">
            <span>{fmtHM(liveEffective)} worked</span>
            <span>{fmtHM(breakMinutes)} break</span>
          </div>

          {/* Punch controls */}
          <div className="att-controls">
            {punchState === 'idle' && !picking && (
              <button className="att-btn att-btn-primary" disabled={busy} onClick={() => setPicking(true)}>
                Web clock-in
              </button>
            )}
            {punchState === 'idle' && picking && (
              <div className="att-punch-pills">
                <button className="att-pill" disabled={busy} onClick={() => onPickPunch('office')}>Office</button>
                <button className="att-pill" disabled={busy} onClick={() => onPickPunch('remote')}>Remote</button>
                <button className="att-pill" disabled={busy} onClick={() => onPickPunch('wfh')}>WFH</button>
                <button className="att-pill att-pill-ghost" disabled={busy} onClick={() => setPicking(false)}>Cancel</button>
              </div>
            )}
            {punchState === 'in' && (
              <>
                <button className="att-btn att-btn-danger" disabled={busy} onClick={() => run(apiCheckOut)}>Clock out</button>
                <button className="att-btn att-btn-ghost" disabled={busy} onClick={() => run(apiStartBreak)}>Start break</button>
              </>
            )}
            {punchState === 'on-break' && (
              <button className="att-btn att-btn-warning" disabled={busy} onClick={() => run(apiEndBreak)}>
                End break{openBreakStart ? ` · ${fmtHM((now.getTime() - openBreakStart) / 60000)}` : ''}
              </button>
            )}
            {punchState === 'done' && (
              <div className="att-done">Done for today · {fmtTime(today?.checkIn ?? null)}–{fmtTime(today?.checkOut ?? null)}</div>
            )}
          </div>

          {today?.checkIn && (
            <div className="att-clock-meta">
              In {fmtTime(today.checkIn)}
              {today.punchType && <span className="att-badge">{today.punchType.toUpperCase()}</span>}
              {today.checkOut && <> · Out {fmtTime(today.checkOut)}</>}
            </div>
          )}
        </div>

        {/* Week circles */}
        <div className="ts-card att-week">
          <h2 className="section-title att-week-title">This week</h2>
          <div className="att-circles">
            {weekDates.map((date, i) => {
              const doc = byDate.get(date);
              const status = doc?.status ?? 'absent';
              const isToday = date === todayStr();
              return (
                <div key={date} className="att-circle-wrap">
                  <div
                    className={`att-circle${isToday ? ' att-circle-today' : ''}`}
                    style={{ borderColor: circleColor(status), color: circleColor(status) }}
                    title={`${date} · ${status}`}
                  >
                    {DAY_LETTERS[i]}
                  </div>
                  <span className="att-circle-day">{date.slice(8)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Logs table */}
      <h2 className="section-title">Recent logs</h2>
      <div className="ts-card">
        <table className="ts-table att-logs">
          <thead>
            <tr>
              <th className="ts-task">Date</th>
              <th className="col-left">Activity</th>
              <th>Effective</th>
              <th>Gross</th>
              <th className="col-left">Arrival</th>
              <th className="col-left"></th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 && <tr><td colSpan={6} className="ts-empty">No attendance logged this month.</td></tr>}
            {logs.map((d) => {
              const eff = Math.min(100, ((d.effectiveMinutes || 0) / SHIFT_MINUTES) * 100);
              const brk = Math.min(100, ((d.breakMinutes || 0) / SHIFT_MINUTES) * 100);
              const pill = STATUS_PILL[d.status];
              const late = isLate(d.checkIn);
              const pending = d.regularise?.status === 'pending';
              return (
                <tr key={d.date}>
                  <td className="ts-task">
                    {new Date(d.date + 'T00:00:00').toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}
                    {pill && <span className="att-tag">{pill}</span>}
                  </td>
                  <td className="col-left">
                    <div className="att-logbar">
                      <div className="att-logbar-eff" style={{ width: `${eff}%` }} />
                      {brk > 0 && <div className="att-logbar-brk" style={{ width: `${brk}%` }} />}
                    </div>
                  </td>
                  <td>{fmtHM(d.effectiveMinutes || 0)}</td>
                  <td>{fmtHM(d.totalMinutes || 0)}</td>
                  <td className="col-left">
                    {d.checkIn
                      ? <span className={late ? 'att-late' : 'att-ontime'}>{late ? `${fmtTime(d.checkIn)} late` : 'On time'}</span>
                      : '—'}
                  </td>
                  <td className="col-left">
                    {pending
                      ? <span className="att-tag att-tag-pending">PENDING</span>
                      : <button className="link-btn" onClick={() => setRegulariseDate(d.date)}>Regularise</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {regulariseDate && (
        <RegulariseModal
          date={regulariseDate}
          onClose={() => setRegulariseDate(null)}
          onSubmitted={() => { setRegulariseDate(null); loadMonth(); }}
        />
      )}
    </div>
  );
}

// --- Regularise modal ---

function RegulariseModal({ date, onClose, onSubmitted }: {
  date: string; onClose: () => void; onSubmitted: () => void;
}) {
  const [reason, setReason] = useState('');
  const [ci, setCi] = useState('');
  const [co, setCo] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const firstField = useRef<HTMLInputElement>(null);

  useEffect(() => { firstField.current?.focus(); }, []);

  async function submit() {
    if (!reason.trim()) { setErr('A reason is required.'); return; }
    setBusy(true);
    setErr('');
    try {
      await requestRegularise(date, reason.trim(), ci || undefined, co || undefined);
      onSubmitted();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="att-modal-backdrop" onClick={onClose}>
      <div className="att-modal ts-card" onClick={(e) => e.stopPropagation()}>
        <h2 className="section-title">Regularise {date}</h2>
        <label className="att-field">
          <span>Reason</span>
          <input ref={firstField} value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Forgot to check in" />
        </label>
        <div className="att-field-row">
          <label className="att-field">
            <span>Corrected check-in</span>
            <input type="time" value={ci} onChange={(e) => setCi(e.target.value)} />
          </label>
          <label className="att-field">
            <span>Corrected check-out</span>
            <input type="time" value={co} onChange={(e) => setCo(e.target.value)} />
          </label>
        </div>
        {err && <p className="ts-error">{err}</p>}
        <div className="att-modal-actions">
          <button className="att-btn att-btn-ghost" disabled={busy} onClick={onClose}>Cancel</button>
          <button className="att-btn att-btn-primary" disabled={busy} onClick={submit}>Submit request</button>
        </div>
      </div>
    </div>
  );
}
