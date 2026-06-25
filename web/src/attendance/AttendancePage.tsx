import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../authContext';
import { personName } from '../pm/personName';
import {
  getState, getToday, checkIn as apiCheckIn, checkOut as apiCheckOut,
  startBreak as apiStartBreak, endBreak as apiEndBreak,
  getMonth, requestRegularise, getTeamStats, getShiftConfig, submitOvertime,
  AttendanceDoc, AttendanceStatus, AttendanceState, PunchType, TeamMemberStats, ShiftConfig,
} from './attendanceApi';
import { getMyLeave, getBalance, cancelLeave, LeaveBalance, LeaveRequest, LEAVE_TYPE_LABELS } from './leaveApi';
import { LeaveModal } from './LeaveModal';
import { TeamAttendance } from './TeamAttendance';
import { HolidayAdmin } from './HolidayAdmin';

const DEFAULT_SHIFT: ShiftConfig = { startHour: 9, startMinute: 30, endHour: 18, endMinute: 30, durationMinutes: 540 };
const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

// --- date helpers ---

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function todayStr(): string { return ymd(new Date()); }

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(d.getDate() + n);
  return x;
}

// Monday-anchored 7 dates for the week containing today.
function currentWeekDates(): string[] {
  const now = new Date();
  const day = now.getDay();                 // 0=Sun..6=Sat
  const monday = addDays(now, day === 0 ? -6 : 1 - day);
  return Array.from({ length: 7 }, (_, i) => ymd(addDays(monday, i)));
}

function isWeekend(date: string): boolean {
  const d = new Date(date + 'T00:00:00').getDay();
  return d === 0 || d === 6;
}

// Whole days between two YYYY-MM-DD strings (b - a).
function daysBetween(a: string, b: string): number {
  const ms = new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime();
  return Math.floor(ms / 86_400_000);
}

// --- formatting ---

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
// Tooltip text for the log bar: worked/break totals plus each break's
// start–end so people can see *when* they stepped away, not just how long.
function breakTooltip(effMins: number, brkMins: number, breaks: { start: string; end: string | null }[]): string {
  const base = `${fmtHM(effMins)} worked · ${fmtHM(brkMins)} break`;
  if (!breaks || breaks.length === 0) return base;
  const ranges = breaks.map((b) => `${fmtTime(b.start)}–${b.end ? fmtTime(b.end) : 'ongoing'}`);
  return `${base}\n${ranges.join('\n')}`;
}
const DEFAULT_SHIFT_START_MIN = 9 * 60 + 30;   // fallback until /attendance/config loads

function isLate(iso: string | null, shiftStartMin = DEFAULT_SHIFT_START_MIN): boolean {
  return lateMinutes(iso, shiftStartMin) > 0;
}
// Minutes the arrival is past shift start (0 if on time / absent).
function lateMinutes(iso: string | null, shiftStartMin = DEFAULT_SHIFT_START_MIN): number {
  if (!iso) return 0;
  const d = new Date(iso);
  return Math.max(0, d.getHours() * 60 + d.getMinutes() - shiftStartMin);
}
// "8h 33m" / "45m" — for showing the *degree* of lateness or a duration.
function fmtDur(mins: number): string {
  const m = Math.max(0, Math.round(mins));
  const h = Math.floor(m / 60);
  return h ? `${h}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`;
}

type Severity = 'complete' | 'partial' | 'short';
// How complete a finished session was, by effective minutes worked.
function severityOf(effectiveMinutes: number): Severity {
  if (effectiveMinutes >= 480) return 'complete';   // 8h+ full day
  if (effectiveMinutes >= 240) return 'partial';     // 4h+ half day
  return 'short';                                    // anything less is an anomaly
}

type PunchState = 'idle' | 'in' | 'on-break' | 'done';
function derivePunchState(doc: AttendanceDoc | null): PunchState {
  if (!doc || !doc.checkIn) return 'idle';
  if (doc.checkOut) return 'done';
  return (doc.breaks || []).some((b) => !b.end) ? 'on-break' : 'in';
}

const STATUS_BADGE: Partial<Record<AttendanceStatus, string>> = {
  wfh: 'WFH', 'wfh-partial': 'WFH', leave: 'LEAVE', holiday: 'HOLIDAY',
};

function badgeClass(status: AttendanceStatus): string {
  if (status === 'wfh' || status === 'wfh-partial') return 'att-tag att-tag-wfh';
  if (status === 'leave') return 'att-tag att-tag-leave';
  if (status === 'holiday') return 'att-tag att-tag-holiday';
  return 'att-tag';
}

type Period = '30days' | 'current' | 'prev';

// Aggregate a set of docs into the same summary numbers the cards show.
function summarize(docs: AttendanceDoc[], shiftStartMin = DEFAULT_SHIFT_START_MIN) {
  const worked = docs.filter((d) => d.checkIn);
  const totalEff = worked.reduce((s, d) => s + (d.effectiveMinutes || 0), 0);
  const late = worked.filter((d) => isLate(d.checkIn, shiftStartMin)).length;
  return {
    avgMinutes: worked.length ? Math.round(totalEff / worked.length) : 0,
    onTimePct: worked.length ? Math.round(((worked.length - late) / worked.length) * 100) : 0,
    presentDays: worked.length,
  };
}

// --- main component ---

export function AttendancePage() {
  const { user } = useAuth();
  const name = personName(user);
  const initial = (name[0] ?? '?').toUpperCase();

  const [today, setToday] = useState<AttendanceDoc | null>(null);
  // Current month is always needed (week circles, stats, today's row); the
  // previous month is only fetched lazily once something on screen actually
  // needs it, so switching to the "this month" tab doesn't pull a second
  // month's worth of docs for nothing.
  const [curDocs, setCurDocs] = useState<AttendanceDoc[]>([]);
  const [prevDocs, setPrevDocs] = useState<AttendanceDoc[] | null>(null);
  const [state, setState] = useState<AttendanceState | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [period, setPeriod] = useState<Period>('30days');
  const [regulariseDate, setRegulariseDate] = useState<string | null>(null);
  const [myLeave, setMyLeave] = useState<LeaveRequest[]>([]);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [overtimeOpen, setOvertimeOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);   // "More options" disclosure on the clock card
  const [balance, setBalance] = useState<LeaveBalance | null>(null);
  const [teamStats, setTeamStats] = useState<TeamMemberStats[] | null>(null);
  const [shift, setShift] = useState<ShiftConfig>(DEFAULT_SHIFT);
  const [decisionNotice, setDecisionNotice] = useState<string[]>([]);
  const isTeamLead = user?.roles?.some((r) => ['pm', 'admin', 'reporting_manager'].includes(r)) ?? false;
  const isAdminUser = user?.roles?.some((r: string) => ['admin', 'hr'].includes(r)) ?? false;
  const [attTab, setAttTab] = useState<'my' | 'team' | 'holidays'>('my');
  const shiftStartMin = shift.startHour * 60 + shift.startMinute;

  const ref = new Date();
  const curY = ref.getFullYear();
  const curM = ref.getMonth() + 1;
  const prev = addDays(new Date(curY, curM - 1, 1), -1); // last day of previous month
  const prevY = prev.getFullYear();
  const prevM = prev.getMonth() + 1;

  const curMonthLabel = ref.toLocaleString([], { month: 'short' });
  const prevMonthLabel = prev.toLocaleString([], { month: 'short' });

  const loadState = useCallback(async () => {
    try { setState(await getState()); }
    catch (e) { setError((e as Error).message); }
  }, []);

  const loadToday = useCallback(async () => {
    try { setToday(await getToday()); }
    catch (e) { setError((e as Error).message); }
  }, []);

  const loadLeave = useCallback(async () => {
    try { setMyLeave(await getMyLeave()); }
    catch (e) { setError((e as Error).message); }
  }, []);

  const loadBalance = useCallback(async () => {
    try { setBalance(await getBalance()); }
    catch (e) { setError((e as Error).message); }
  }, []);

  const loadShift = useCallback(async () => {
    try { setShift(await getShiftConfig()); }
    catch (e) { setError((e as Error).message); }
  }, []);

  const loadTeamStats = useCallback(async () => {
    if (!isTeamLead) return;
    try { setTeamStats(await getTeamStats(curY, curM)); }
    catch (e) { setError((e as Error).message); }
  }, [isTeamLead, curY, curM]);

  const loadCurDocs = useCallback(async () => {
    try { setCurDocs(await getMonth(curY, curM)); }
    catch (e) { setError((e as Error).message); }
  }, [curY, curM]);

  const loadPrevDocs = useCallback(async () => {
    try { setPrevDocs(await getMonth(prevY, prevM)); }
    catch (e) { setError((e as Error).message); }
  }, [prevY, prevM]);

  // Reloads whatever's currently in view — used after an action (checkin,
  // regularise/leave decision) that can change either month's docs.
  const loadDocs = useCallback(async () => {
    await loadCurDocs();
    if (prevDocs !== null) await loadPrevDocs();
  }, [loadCurDocs, loadPrevDocs, prevDocs]);

  useEffect(() => {
    loadState(); loadToday(); loadCurDocs(); loadLeave(); loadBalance(); loadTeamStats(); loadShift();
  }, [loadState, loadToday, loadCurDocs, loadLeave, loadBalance, loadTeamStats, loadShift]);

  useEffect(() => {
    const poll = setInterval(loadToday, 60_000);
    return () => clearInterval(poll);
  }, [loadToday]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Week circles — computed early since the lazy previous-month load below
  // needs to know whether the current week dips into the previous month.
  const weekDates = useMemo(currentWeekDates, []);
  const curMonthStart = `${curY}-${String(curM).padStart(2, '0')}-01`;
  const weekSpansPrevMonth = weekDates.some((d) => d < curMonthStart);
  const needsPrevMonth = period === 'prev' || period === '30days' || weekSpansPrevMonth;

  useEffect(() => {
    if (needsPrevMonth && prevDocs === null) loadPrevDocs();
  }, [needsPrevMonth, prevDocs, loadPrevDocs]);

  const docs = useMemo(
    () => (prevDocs ? [...prevDocs, ...curDocs] : curDocs),
    [prevDocs, curDocs],
  );

  const byDate = useMemo(() => {
    const map = new Map<string, AttendanceDoc>();
    for (const d of docs) map.set(d.date, d);
    return map;
  }, [docs]);

  // Minimal in-app notification for decisions made elsewhere (a PM approving
  // or rejecting leave/regularise): diff against a localStorage "seen" set so
  // a banner appears exactly once per decision, without any backend support.
  useEffect(() => {
    if (myLeave.length === 0 && docs.length === 0) return;
    const seenRaw = localStorage.getItem('att-seen-decisions');
    const seen = new Set<string>(seenRaw ? JSON.parse(seenRaw) : []);
    const decided: { key: string; label: string }[] = [];
    for (const lv of myLeave) {
      if (lv.status === 'pending') continue;
      const key = `leave:${lv._id}:${lv.status}`;
      if (!seen.has(key)) {
        decided.push({ key, label: `${LEAVE_TYPE_LABELS[lv.type]} leave (${lv.startDate}) ${lv.status}` });
      }
    }
    for (const d of docs) {
      const st = d.regularise?.status;
      if (st !== 'approved' && st !== 'rejected') continue;
      const key = `reg:${d._id}:${st}`;
      if (!seen.has(key)) decided.push({ key, label: `Regularise for ${d.date} ${st}` });
    }
    if (decided.length > 0) {
      setDecisionNotice((prev) => [...prev, ...decided.map((x) => x.label)]);
      const next = new Set(seen);
      for (const x of decided) next.add(x.key);
      localStorage.setItem('att-seen-decisions', JSON.stringify(Array.from(next)));
    }
  }, [myLeave, docs]);

  const punchState = derivePunchState(today);

  async function run(fn: () => Promise<AttendanceDoc>) {
    setBusy(true); setError('');
    try { setToday(await fn()); loadDocs(); loadState(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  // Live shift progress while clocked in.
  const breakMinutes = today?.breakMinutes || 0;
  const openBreakStart = useMemo(() => {
    const ob = (today?.breaks || []).find((b) => !b.end);
    return ob ? new Date(ob.start).getTime() : null;
  }, [today]);

  // Gross/break/effective for today, computed live while a session is open so
  // the Timings card, the shift bar and today's log row all agree on one truth.
  const liveGross = useMemo(() => {
    if (!today?.checkIn) return 0;
    if (today.checkOut) return today.totalMinutes || 0;
    return Math.max(0, (now.getTime() - new Date(today.checkIn).getTime()) / 60000);
  }, [today, now]);

  const liveBreak = useMemo(() => {
    if (today?.checkOut) return breakMinutes;
    let brk = breakMinutes;
    if (openBreakStart) brk += (now.getTime() - openBreakStart) / 60000;
    return brk;
  }, [today, breakMinutes, openBreakStart, now]);

  const liveEffective = useMemo(() => {
    if (!today?.checkIn) return 0;
    if (today.checkOut) return today.effectiveMinutes || 0;
    return Math.max(0, liveGross - liveBreak);
  }, [today, liveGross, liveBreak]);

  // Per-row metrics — uses live values for today's still-open session.
  const rowMetrics = useCallback((d: AttendanceDoc) => {
    if (d.date === todayStr() && d.checkIn && !d.checkOut) {
      return { eff: liveEffective, gross: liveGross, brk: liveBreak };
    }
    return { eff: d.effectiveMinutes || 0, gross: d.totalMinutes || 0, brk: d.breakMinutes || 0 };
  }, [liveEffective, liveGross, liveBreak]);

  const ts = todayStr();

  // First-run / onboarding gating.
  const ready = state !== null;
  const activatedDate = state?.activatedDate ?? null;
  const hasClockIn = state?.hasClockIn ?? false;
  // Progressive disclosure: hide the stats card entirely until there are a
  // couple of days of data; show full metrics only after a full week.
  const daysWithData = useMemo(() => docs.filter((d) => d.checkIn).length, [docs]);
  const showStatsCard = hasClockIn && daysWithData >= 2;
  const hasFullWeek = hasClockIn && activatedDate !== null && daysBetween(activatedDate, ts) >= 6;

  // Card stats.
  const weekStats = useMemo(
    () => summarize(weekDates.map((d) => byDate.get(d)).filter(Boolean) as AttendanceDoc[], shiftStartMin),
    [weekDates, byDate, shiftStartMin],
  );

  const teamSummary = useMemo(() => {
    if (!teamStats || teamStats.length === 0) return null;
    const avgMinutes = Math.round(teamStats.reduce((s, m) => s + m.avgMinutesPerDay, 0) / teamStats.length);
    const onTimePct = Math.round(teamStats.reduce((s, m) => s + m.onTimePct, 0) / teamStats.length);
    return { avgMinutes, onTimePct };
  }, [teamStats]);

  // Logs: build a row per calendar day in the selected period, from the
  // activation date forward (never before — those days predate the feature).
  const logDates = useMemo(() => {
    const out: string[] = [];
    if (period === '30days') {
      for (let i = 0; i < 30; i++) out.push(ymd(addDays(new Date(), -i)));
    } else {
      const y = period === 'current' ? curY : prevY;
      const m = period === 'current' ? curM : prevM;
      const last = new Date(y, m, 0).getDate();
      for (let day = last; day >= 1; day--) {
        const s = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        if (s <= ts) out.push(s);
      }
    }
    return activatedDate ? out.filter((d) => d >= activatedDate) : out;
  }, [period, curY, curM, prevY, prevM, ts, activatedDate]);

  const punchLabel = today?.punchType ? today.punchType.toUpperCase() : null;

  function clockInPrimary() { run(() => apiCheckIn('office')); }

  async function cancelLeaveRequest(id: string) {
    setBusy(true); setError('');
    try { await cancelLeave(id); await loadLeave(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div className="ts-page att-page">
      <header className="ts-header">
        <h1 className="ts-h1">Attendance</h1>
        <p className="ts-sub">Clock in, track breaks, and review your attendance log.</p>
      </header>

      {(isTeamLead || isAdminUser) && (
        <div className="att-tabs att-top-tabs">
          <button className={`att-tab${attTab === 'my' ? ' active' : ''}`} onClick={() => setAttTab('my')}>My Attendance</button>
          {isTeamLead && <button className={`att-tab${attTab === 'team' ? ' active' : ''}`} onClick={() => setAttTab('team')}>Team</button>}
          {isAdminUser && <button className={`att-tab${attTab === 'holidays' ? ' active' : ''}`} onClick={() => setAttTab('holidays')}>Holidays</button>}
        </div>
      )}

      {error && <p className="ts-error">{error}</p>}

      {attTab === 'holidays' && isAdminUser ? (
        <HolidayAdmin />
      ) : attTab === 'team' && isTeamLead ? (
        <TeamAttendance />
      ) : (
      <>
      {decisionNotice.length > 0 && (
        <div className="att-notice">
          <ul className="att-notice-list">
            {decisionNotice.map((label, i) => <li key={i}>{label}</li>)}
          </ul>
          <button className="att-notice-close" onClick={() => setDecisionNotice([])} aria-label="Dismiss">×</button>
        </div>
      )}

      {/* ===== Top row: cards (stats hidden until a couple days of data) ===== */}
      <div className={`att-top${showStatsCard ? '' : ' att-top-2'}`}>
        {showStatsCard && (
        <div className="ts-card att-stats">
          <h2 className="att-card-title">Attendance Stats <span className="att-card-sub">· This Week</span></h2>
          {hasFullWeek ? (
            <>
              <div className="att-stat-row">
                <div className="att-avatar">{initial}</div>
                <div className="att-stat-metrics">
                  <div className="att-metric">
                    <span className="att-metric-value">{fmtHM(weekStats.avgMinutes)}</span>
                    <span className="att-metric-label">Avg / day</span>
                  </div>
                  <div className="att-metric">
                    <span className="att-metric-value">{weekStats.onTimePct}%</span>
                    <span className="att-metric-label">On time</span>
                  </div>
                </div>
              </div>
              {isTeamLead && (
              <div className="att-team-row">
                <span className="att-team-label">My Team</span>
                <div className="att-stat-metrics">
                  <div className="att-metric">
                    <span className={teamSummary ? 'att-metric-value' : 'att-metric-value att-muted'}>
                      {teamSummary ? fmtHM(teamSummary.avgMinutes) : '—'}
                    </span>
                    <span className="att-metric-label">Avg / day</span>
                  </div>
                  <div className="att-metric">
                    <span className={teamSummary ? 'att-metric-value' : 'att-metric-value att-muted'}>
                      {teamSummary ? `${teamSummary.onTimePct}%` : '—'}
                    </span>
                    <span className="att-metric-label">On time</span>
                  </div>
                </div>
              </div>
              )}
            </>
          ) : (
            <div className="att-onboard">
              <div className="att-avatar">{initial}</div>
              <p className="att-onboard-text">
                Your stats will appear here once you have a full week of attendance logged.
              </p>
            </div>
          )}
        </div>
        )}

        {/* Center: timings */}
        <div className="ts-card att-timings">
          <h2 className="att-card-title">Timings</h2>
          <div className="att-circles">
            {weekDates.map((date, i) => {
              const doc = byDate.get(date);
              const future = date > ts;
              const preActivation = activatedDate !== null && date < activatedDate;
              let cls = 'att-circle';
              if (future || preActivation) cls += ' att-circle-upcoming';
              else if (doc && doc.checkIn && (doc.status === 'present' || doc.status === 'wfh' || doc.status === 'partial' || doc.status === 'wfh-partial')) cls += ' att-circle-present';
              else if (isWeekend(date)) cls += ' att-circle-upcoming';
              else if (!hasClockIn) cls += ' att-circle-upcoming';
              else cls += ' att-circle-absent';
              if (date === ts) cls += ' att-circle-today';
              return (
                <div key={date} className={cls} title={`${date} · ${doc?.status ?? (future ? 'upcoming' : 'absent')}`}>{DAY_LETTERS[i]}</div>
              );
            })}
          </div>
          <div className="att-shift-label">Today <strong>9 AM – 6 PM</strong></div>
          <div className="att-shift-summary">
            <span>{fmtHM(liveEffective)} / 9:00 worked</span>
            <span className="att-dot">·</span>
            <span>{fmtHM(liveBreak)} break</span>
          </div>
          <p className="att-shift-note">General shift · 9 hours including a 1 hour break.</p>
        </div>

        {/* Right: clock + actions */}
        <div className="ts-card att-clock">
          <div className="att-clock-time">{fmtClock(now)}</div>
          <div className="att-clock-date">{now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}</div>

          <div className="att-actions">
            {punchState === 'idle' && (
              <>
                <button className="att-act att-act-primary att-act-hero" disabled={busy} onClick={clockInPrimary}>Web clock-in</button>
                <div className="att-act-row">
                  <button className="att-act att-act-sm" disabled={busy} onClick={() => run(() => apiCheckIn('remote'))}>Remote</button>
                  <button className="att-act att-act-sm" disabled={busy} onClick={() => run(() => apiCheckIn('wfh'))}>Work from home</button>
                </div>
                <button className="att-link" onClick={() => setMoreOpen((o) => !o)}>{moreOpen ? 'Fewer options' : 'More options'}</button>
                {moreOpen && (
                  <button className="att-link" disabled={busy} onClick={() => setRegulariseDate(ts)}>Forgot to clock in?</button>
                )}
              </>
            )}
            {punchState === 'in' && (
              <>
                <button className="att-act att-act-danger" disabled={busy} onClick={() => run(apiCheckOut)}>Clock out</button>
                <button className="att-act" disabled={busy} onClick={() => run(apiStartBreak)}>Start break</button>
                <button className="att-act" disabled={busy} onClick={() => setRegulariseDate(ts)}>Forgot ID</button>
              </>
            )}
            {punchState === 'on-break' && (
              <button className="att-act att-act-warning" disabled={busy} onClick={() => run(apiEndBreak)}>
                End break{openBreakStart ? ` · ${fmtHM((now.getTime() - openBreakStart) / 60000)}` : ''}
              </button>
            )}
            {punchState === 'done' && (() => {
              const sev = severityOf(today?.effectiveMinutes || 0);
              const label = sev === 'complete' ? 'Done for today' : sev === 'partial' ? 'Incomplete shift' : 'Short duration';
              return (
                <div className={`att-done${sev === 'complete' ? '' : ' att-done-warn'}`}>
                  {label}<br />
                  <span className="att-muted">
                    {fmtTime(today?.checkIn ?? null)} – {fmtTime(today?.checkOut ?? null)} · {fmtHM(today?.effectiveMinutes || 0)} worked
                  </span>
                </div>
              );
            })()}
            {punchLabel && punchState !== 'idle' && (
              <div className="att-clock-meta">In {fmtTime(today?.checkIn ?? null)} <span className="att-badge">{punchLabel}</span></div>
            )}
            <button className="att-link" disabled={busy} onClick={() => setLeaveOpen(true)}>Apply for leave</button>
            <a className="att-policy" href="#" onClick={(e) => e.preventDefault()}>Attendance policy</a>
          </div>
        </div>
      </div>

      {/* ===== Lower half: progressive disclosure ===== */}
      {!ready ? (
        <p className="att-empty-hint">Loading your attendance…</p>
      ) : !hasClockIn ? (
        /* Day one — a single focused first-clock-in moment, nothing else. */
        <div className="att-firstrun">
          <div className="att-empty-icon" aria-hidden="true">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 8v4l3 3M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
            </svg>
          </div>
          <h3 className="att-empty-title">Clock in to get started</h3>
          <p className="att-empty-text">Your attendance log, stats and leave history all build from your first clock-in. There's nothing to show until then.</p>
          <button className="att-act att-act-primary att-act-hero" disabled={busy} onClick={clockInPrimary}>Web clock-in</button>
        </div>
      ) : (
        <>
          {/* Leave — compact strip when empty, full card when there's data */}
          <div className="att-section-break" />
          {balance && (
            <div className="att-leave-balance">
              <span className="att-leave-balance-item">Casual <strong>{balance.casual.remaining}</strong>/{balance.casual.total}</span>
              <span className="att-leave-balance-item">Sick <strong>{balance.sick.remaining}</strong>/{balance.sick.total}</span>
              <span className="att-leave-balance-item">Earned <strong>{balance.earned.remaining}</strong>/{balance.earned.total}</span>
            </div>
          )}
          {myLeave.length === 0 ? (
            <div className="att-leave-strip">
              <span className="att-leave-strip-title">My leave</span>
              <span className="att-muted">No leave requests yet.</span>
              <button className="att-link" disabled={busy} onClick={() => setLeaveOpen(true)}>Apply for leave</button>
            </div>
          ) : (
            <div className="ts-card att-leave-card">
              <div className="att-leave-head">
                <h2 className="att-card-title">My leave</h2>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="att-act att-act-sm" disabled={busy} onClick={() => setOvertimeOpen(true)}>Request overtime</button>
                  <button className="att-act att-act-sm" disabled={busy} onClick={() => setLeaveOpen(true)}>Apply for leave</button>
                </div>
              </div>
              <ul className="att-leave-list">
                {myLeave.map((lv) => (
                  <li key={lv._id} className="att-leave-item">
                    <span className="att-tag att-tag-leave">{LEAVE_TYPE_LABELS[lv.type]}</span>
                    <span className="att-leave-range">
                      {lv.startDate === lv.endDate ? lv.startDate : `${lv.startDate} → ${lv.endDate}`}
                      <span className="att-muted"> · {lv.days} day{lv.days === 1 ? '' : 's'}</span>
                    </span>
                    {lv.reason && <span className="att-leave-reason">{lv.reason}</span>}
                    <span className={`att-leave-status att-leave-${lv.status}`}>{lv.status}</span>
                    {(lv.status === 'pending' || (lv.status === 'approved' && lv.startDate > new Date().toISOString().slice(0, 10))) && (
                      <button className="link-btn att-leave-cancel" disabled={busy} onClick={() => cancelLeaveRequest(lv._id)}>
                        Cancel
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Logs — filter grouped with its table */}
          <div className="att-section-break" />
          <div className="att-logs-section ts-card">
            <div className="att-filterbar">
              <h2 className="att-logs-title">Attendance log</h2>
              <span className={`att-chip ${punchState === 'idle' ? 'att-chip-warn' : punchState === 'done' ? 'att-chip-off' : 'att-chip-on'}`}>
                {punchState === 'idle' ? 'Not clocked in'
                  : punchState === 'done' ? 'Clocked out'
                    : today?.punchType === 'wfh' ? 'Work from home'
                      : today?.punchType === 'remote' ? 'Remote' : 'In office'}
              </span>
              <div className="att-tabs">
                <button className={`att-tab${period === '30days' ? ' active' : ''}`} onClick={() => setPeriod('30days')}>30 days</button>
                <button className={`att-tab${period === 'current' ? ' active' : ''}`} onClick={() => setPeriod('current')}>{curMonthLabel}</button>
                <button className={`att-tab${period === 'prev' ? ' active' : ''}`} onClick={() => setPeriod('prev')}>{prevMonthLabel}</button>
              </div>
            </div>

            <table className="ts-table att-logs">
              <thead>
                <tr>
                  <th className="ts-task">Date</th>
                  <th className="col-left">Attendance</th>
                  <th>Effective</th>
                  <th>Gross</th>
                  <th className="col-left">Arrival</th>
                  <th>Loc</th>
                </tr>
              </thead>
              <tbody>
                {logDates.map((date) => {
                  const d = byDate.get(date);
                  const dayOff = isWeekend(date) && (!d || !d.checkIn);
                  const label = new Date(date + 'T00:00:00').toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
                  const badge = d ? STATUS_BADGE[d.status] : undefined;
                  const pendingReg = d?.regularise?.status === 'pending';
                  const decidedReg = d?.regularise?.status === 'approved' ? 'approved'
                    : d?.regularise?.status === 'rejected' ? 'rejected' : null;

                  if (!d || !d.checkIn) {
                    const isLeave = d?.status === 'leave';
                    const isHoliday = d?.status === 'holiday';
                    return (
                      <tr key={date} className={dayOff ? 'att-row-off' : ''}>
                        <td className="ts-task">
                          {label}
                          {isLeave
                            ? <span className="att-tag att-tag-leave">LEAVE</span>
                            : isHoliday
                              ? <span className="att-tag att-tag-holiday">HOLIDAY</span>
                              : dayOff
                                ? <span className="att-tag att-tag-off">Day off</span>
                                : <button className="link-btn att-reg-link" onClick={() => setRegulariseDate(date)}>{pendingReg ? 'Pending' : 'Regularise'}</button>}
                          {decidedReg === 'approved' && <span className="att-tag att-tag-approved">Approved ✓</span>}
                          {decidedReg === 'rejected' && <span className="att-tag att-tag-rejected">Rejected ✕</span>}
                        </td>
                        <td className="col-left"><span className="att-muted">—</span></td>
                        <td><span className="att-muted">—</span></td>
                        <td><span className="att-muted">—</span></td>
                        <td className="col-left"><span className="att-muted">—</span></td>
                        <td><span className="att-muted">—</span></td>
                      </tr>
                    );
                  }

                  // Live values for today's open session; stored values otherwise.
                  const m = rowMetrics(d);
                  const effPct = Math.min(100, (m.eff / shift.durationMinutes) * 100);
                  const brkPct = Math.min(100 - effPct, (m.brk / shift.durationMinutes) * 100);
                  const lm = lateMinutes(d.checkIn, shiftStartMin);
                  const sev = d.checkOut ? severityOf(m.eff) : null;   // classify finished sessions only
                  return (
                    <tr key={date}>
                      <td className="ts-task">
                        {label}
                        {badge && <span className={badgeClass(d.status)}>{badge}</span>}
                        {sev === 'short' && <span className="att-tag att-tag-short">SHORT</span>}
                        {pendingReg && <span className="att-tag att-tag-pending">PENDING</span>}
                        {decidedReg === 'approved' && <span className="att-tag att-tag-approved">Approved ✓</span>}
                        {decidedReg === 'rejected' && <span className="att-tag att-tag-rejected">Rejected ✕</span>}
                      </td>
                      <td className="col-left">
                        <div className="att-logbar" title={breakTooltip(m.eff, m.brk, d.breaks)}>
                          <div className="att-logbar-eff" style={{ width: `${effPct}%` }} />
                          {brkPct > 0 && <div className="att-logbar-brk" style={{ width: `${brkPct}%` }} />}
                        </div>
                      </td>
                      <td>{fmtHM(m.eff)}</td>
                      <td>{fmtHM(m.gross)}</td>
                      <td className="col-left">
                        {lm > 0
                          ? <span className={lm >= 120 ? 'att-late att-late-severe' : 'att-late'}>{fmtDur(lm)} late</span>
                          : <span className="att-ontime">On time</span>}
                      </td>
                      <td>
                        <svg className="att-loc" width="16" height="16" viewBox="0 0 24 24" fill="none"
                          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      </>
      )}

      {regulariseDate && (
        <RegulariseModal
          date={regulariseDate}
          onClose={() => setRegulariseDate(null)}
          onSubmitted={() => { setRegulariseDate(null); loadDocs(); }}
        />
      )}

      {leaveOpen && (
        <LeaveModal
          today={ts}
          onClose={() => setLeaveOpen(false)}
          onSubmitted={() => { setLeaveOpen(false); loadLeave(); loadBalance(); loadDocs(); }}
        />
      )}

      {overtimeOpen && (
        <OvertimeModal
          date={ts}
          onClose={() => setOvertimeOpen(false)}
          onSubmitted={() => setOvertimeOpen(false)}
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
    setBusy(true); setErr('');
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
          <button className="att-act" disabled={busy} onClick={onClose}>Cancel</button>
          <button className="att-act att-act-primary" disabled={busy} onClick={submit}>Submit request</button>
        </div>
      </div>
    </div>
  );
}

// --- Overtime modal ---

const OT_REASONS = [
  { value: 'work-overload', label: 'Work Overload' },
  { value: 'deadline', label: 'Deadline' },
  { value: 'client-request', label: 'Client Request' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'other', label: 'Other' },
];

function OvertimeModal({ date, onClose, onSubmitted }: {
  date: string; onClose: () => void; onSubmitted: () => void;
}) {
  const [otDate, setOtDate] = useState(date);
  const [startTime, setStartTime] = useState('18:30');
  const [endTime, setEndTime] = useState('20:30');
  const [reason, setReason] = useState('work-overload');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!startTime || !endTime) { setErr('Start and end time required.'); return; }
    setBusy(true); setErr('');
    try {
      await submitOvertime({ date: otDate, startTime, endTime, reason, note: note.trim() });
      onSubmitted();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="att-modal-backdrop" onClick={onClose}>
      <div className="att-modal ts-card" onClick={(e) => e.stopPropagation()}>
        <h2 className="section-title">Request Overtime</h2>
        <label className="att-field">
          <span>Date</span>
          <input type="date" value={otDate} onChange={(e) => setOtDate(e.target.value)} />
        </label>
        <div className="att-field-row">
          <label className="att-field">
            <span>Start time</span>
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </label>
          <label className="att-field">
            <span>End time</span>
            <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </label>
        </div>
        <label className="att-field">
          <span>Reason</span>
          <select value={reason} onChange={(e) => setReason(e.target.value)}>
            {OT_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </label>
        <label className="att-field">
          <span>Note (optional)</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Additional details…" />
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
