import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  IconChevronLeft,
  IconChevronRight,
  IconGridDots,
  IconList,
  IconPlus,
  IconGift,
  IconConfetti,
  IconUserPlus,
  IconCalendarEvent,
  IconMapPin,
} from '@tabler/icons-react';
import { useAuth } from '../authContext';
import { authed } from '../fetchHelper';
import { personName } from '../pm/personName';
import { pathForKey } from '../pm/nav';
import { getDashboard, DashboardData } from './dashboardApi';
import './HomePage.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface QuickLink {
  label: string;
  route: string;
}

interface Holiday {
  name: string;
  date: string;
}

interface PeopleEntry {
  _id: string;
  name: string;
  initials: string;
  email?: string;
  when?: string;
  type?: string;
  years?: number;
  joined?: string;
}

type FeedTab = 'Organization' | 'Product Design';
type PostTab = 'Post' | 'Poll' | 'Praise';

const AVATAR_COLORS = ['#4f6ef7', '#22c55e', '#f59e0b', '#8b5cf6', '#ef4444', '#6b7280', '#ec4899', '#14b8a6'];
function colorFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

const quickLinks: QuickLink[] = [
  { label: 'Timesheet', route: '/timesheet' },
  { label: 'Attendance', route: '/attendance' },
  { label: 'My Tasks', route: '/my-tasks' },
  { label: 'My Skills', route: '/my-skills' },
  { label: 'Marketplace', route: '/marketplace' },
  { label: 'Organisation', route: '/organisation' },
];

const holidays: Holiday[] = [
  { name: 'Independence Day', date: 'Fri, 15 Aug 2025' },
  { name: 'Gandhi Jayanti', date: 'Thu, 2 Oct 2025' },
  { name: 'Dussehra', date: 'Thu, 2 Oct 2025' },
  { name: 'Diwali', date: 'Mon, 20 Oct 2025' },
  { name: 'Christmas', date: 'Thu, 25 Dec 2025' },
  { name: 'Republic Day', date: 'Mon, 26 Jan 2026' },
  { name: 'Holi', date: 'Tue, 17 Mar 2026' },
  { name: 'Eid ul-Fitr', date: 'Tue, 31 Mar 2026' },
  { name: 'Ram Navami', date: 'Thu, 2 Apr 2026' },
  { name: 'Eid ul-Adha', date: 'Sat, 6 Jun 2026' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMin(m: number): string {
  const h = Math.floor(m / 60);
  const min = Math.round(m % 60);
  return h > 0 ? `${h}h ${String(min).padStart(2, '0')}m` : `${min}m`;
}

const STATUS_LABEL: Record<string, string> = {
  in: 'Clocked in',
  idle: 'Not clocked in',
  'on-break': 'On break',
  done: 'Clocked out',
};

const STATUS_DOT: Record<string, string> = {
  in: '#22c55e',
  idle: '#888',
  'on-break': '#f59e0b',
  done: '#3b82f6',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function AvatarCard({ emp, showWhen, onWish }: { emp: PeopleEntry; showWhen?: boolean; onWish?: (emp: PeopleEntry) => void }) {
  return (
    <div className="hp-avatar-card">
      <div className="hp-avatar" style={{ background: colorFor(emp._id) }}>
        {emp.initials}
      </div>
      <span className="hp-avatar-name">{emp.name}</span>
      {showWhen ? (
        <span className="hp-avatar-sub">{emp.when}</span>
      ) : (
        <span className="hp-avatar-action" role="button" onClick={() => onWish?.(emp)}>Wish</span>
      )}
    </div>
  );
}

function HolidayCarousel() {
  const [idx, setIdx] = useState(0);
  const h = holidays[idx];

  return (
    <div className="hp-holiday-card">
      <div className="hp-subcard-header">
        <span>Holidays</span>
        <span className="hp-text-link" style={{ color: '#fff' }}>View All</span>
      </div>
      <div className="hp-holiday-body">
        <button
          className="hp-carousel-btn"
          onClick={() => setIdx((i) => (i - 1 + holidays.length) % holidays.length)}
          aria-label="Previous"
        >
          <IconChevronLeft size={16} />
        </button>
        <div className="hp-holiday-content">
          <div className="hp-holiday-flag-icon">
            <IconCalendarEvent size={28} color="#fff" />
          </div>
          <div className="hp-holiday-name">{h.name}</div>
          <div className="hp-holiday-date">{h.date}</div>
        </div>
        <button
          className="hp-carousel-btn"
          onClick={() => setIdx((i) => (i + 1) % holidays.length)}
          aria-label="Next"
        >
          <IconChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

function DashboardCards({ data, navigate }: { data: DashboardData; navigate: (p: string) => void }) {
  return (
    <div className="hp-dash-cards">
      {data.attendance && (
        <div className="hp-dash-card" onClick={() => navigate(pathForKey('attendance'))} role="button" tabIndex={0}>
          <div className="hp-dash-card-head">
            <span className="hp-status-dot" style={{ background: STATUS_DOT[data.attendance.status] }} />
            <span>Attendance</span>
          </div>
          <div className="hp-dash-card-value">{STATUS_LABEL[data.attendance.status]}</div>
          {data.attendance.checkIn && (
            <div className="hp-dash-card-sub">
              In at {new Date(data.attendance.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          )}
          <div className="hp-progress">
            <div className="hp-progress-fill" style={{
              width: `${data.attendance.shiftDuration > 0 ? Math.min(100, Math.round((data.attendance.effectiveMinutes / data.attendance.shiftDuration) * 100)) : 0}%`,
            }} />
          </div>
          <div className="hp-dash-card-sub">{fmtMin(data.attendance.effectiveMinutes)} / {fmtMin(data.attendance.shiftDuration)}</div>
        </div>
      )}

      {data.leave && (
        <div className="hp-dash-card" onClick={() => navigate(pathForKey('attendance'))} role="button" tabIndex={0}>
          <div className="hp-dash-card-head">
            <span>Leave Balance</span>
            {data.leave.pendingCount > 0 && <span className="hp-badge">{data.leave.pendingCount} pending</span>}
          </div>
          <div className="hp-leave-grid">
            <div className="hp-leave-item">
              <span className="hp-leave-count">{data.leave.casual.remaining}</span>
              <span className="hp-leave-label">Casual / {data.leave.casual.total}</span>
            </div>
            <div className="hp-leave-item">
              <span className="hp-leave-count">{data.leave.sick.remaining}</span>
              <span className="hp-leave-label">Sick / {data.leave.sick.total}</span>
            </div>
            <div className="hp-leave-item">
              <span className="hp-leave-count">{data.leave.earned.remaining}</span>
              <span className="hp-leave-label">Earned / {data.leave.earned.total}</span>
            </div>
          </div>
        </div>
      )}

      {data.timesheet && (
        <div className="hp-dash-card" onClick={() => navigate(pathForKey('timesheet'))} role="button" tabIndex={0}>
          <div className="hp-dash-card-head">
            <span>Timesheet</span>
            <span className="hp-dash-card-sub">This week</span>
          </div>
          <div className="hp-dash-card-value">{fmtMin(data.timesheet.totalMinutes)}</div>
          <div className="hp-progress">
            <div className="hp-progress-fill" style={{
              width: `${data.timesheet.targetMinutes > 0 ? Math.min(100, Math.round((data.timesheet.totalMinutes / data.timesheet.targetMinutes) * 100)) : 0}%`,
            }} />
          </div>
          <div className="hp-dash-card-sub">Target: {fmtMin(data.timesheet.targetMinutes)} · {data.timesheet.submittedDays}/5 submitted</div>
        </div>
      )}

      {data.tasks && (
        <div className="hp-dash-card" onClick={() => navigate(pathForKey('my-tasks'))} role="button" tabIndex={0}>
          <div className="hp-dash-card-head"><span>My Tasks</span></div>
          <div className="hp-tasks-row">
            <span className="hp-task-chip hp-chip-todo">{data.tasks.todo} To Do</span>
            <span className="hp-task-chip hp-chip-progress">{data.tasks.inProgress} In Progress</span>
            <span className="hp-task-chip hp-chip-blocked">{data.tasks.blocked} Blocked</span>
            <span className="hp-task-chip hp-chip-done">{data.tasks.done} Done</span>
          </div>
        </div>
      )}

      {data.pendingApprovals && (
        <div className="hp-dash-card" onClick={() => navigate(pathForKey('requests'))} role="button" tabIndex={0}>
          <div className="hp-dash-card-head"><span>Pending Approvals</span></div>
          <div className="hp-dash-card-value">
            {data.pendingApprovals.leave + data.pendingApprovals.timesheets + data.pendingApprovals.regularise + data.pendingApprovals.editRequests + data.pendingApprovals.claimRequests + (data.pendingApprovals.overtime || 0)}
          </div>
          <div className="hp-dash-card-sub">total pending</div>
        </div>
      )}

      {data.teamSummary && (
        <div className="hp-dash-card" onClick={() => navigate(pathForKey('my-team'))} role="button" tabIndex={0}>
          <div className="hp-dash-card-head"><span>Team Overview</span></div>
          <div className="hp-team-grid">
            <div><span className="hp-team-val">{data.teamSummary.presentToday}</span><span className="hp-team-lbl">Present</span></div>
            <div><span className="hp-team-val">{data.teamSummary.onLeaveToday}</span><span className="hp-team-lbl">On Leave</span></div>
            <div><span className="hp-team-val">{data.teamSummary.totalMembers}</span><span className="hp-team-lbl">Total</span></div>
            <div><span className="hp-team-val">{data.teamSummary.avgUtilization}%</span><span className="hp-team-lbl">Util</span></div>
          </div>
        </div>
      )}
    </div>
  );
}

function PeopleSection({ onLeave, workingToday }: { onLeave: PeopleEntry[]; workingToday: PeopleEntry[] }) {
  return (
    <div className="hp-lower-left">
      <HolidayCarousel />

      <div className="hp-subcard">
        <div className="hp-subcard-header">
          <span>Working Today ({workingToday.length})</span>
          <IconMapPin size={14} color="var(--hp-text-muted)" />
        </div>
        {workingToday.length === 0 ? (
          <div className="hp-empty"><p>No check-ins yet today.</p></div>
        ) : (
          <div className="hp-avatar-row">
            {workingToday.map((e) => <AvatarCard key={e._id} emp={e} showWhen />)}
          </div>
        )}
      </div>

      <div className="hp-subcard hp-lower-left-full">
        <div className="hp-subcard-header">
          <span>On Leave Today</span>
          <div className="hp-header-actions">
            <button className="hp-icon-btn" aria-label="Grid view"><IconGridDots size={14} /></button>
            <button className="hp-icon-btn" aria-label="List view"><IconList size={14} /></button>
          </div>
        </div>
        {onLeave.length === 0 ? (
          <div className="hp-empty">
            <p>Everyone is working today!</p>
            <p className="hp-empty-sub">No one is on leave today.</p>
          </div>
        ) : (
          <div className="hp-avatar-row">
            {onLeave.map((e) => <AvatarCard key={e._id} emp={{ ...e, when: e.type }} showWhen />)}
          </div>
        )}
      </div>
    </div>
  );
}

function RightFeed({ birthdaysToday, upcomingBirthdays, anniversaries, newJoinees, onWish }: {
  birthdaysToday: PeopleEntry[];
  upcomingBirthdays: PeopleEntry[];
  anniversaries: PeopleEntry[];
  newJoinees: PeopleEntry[];
  onWish: (emp: PeopleEntry) => void;
}) {
  const [feedTab, setFeedTab] = useState<FeedTab>('Organization');
  const [postTab, setPostTab] = useState<PostTab>('Post');
  type CelTab = 'birthdays' | 'anniversaries' | 'joinees';
  const [celTab, setCelTab] = useState<CelTab>('birthdays');

  return (
    <div className="hp-right-col">
      <div className="hp-feed-tabs">
        {(['Organization', 'Product Design'] as FeedTab[]).map((t) => (
          <button
            key={t}
            className={`hp-feed-tab ${feedTab === t ? 'active' : ''}`}
            onClick={() => setFeedTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="hp-subcard">
        <div className="hp-composer-tabs">
          {(['Post', 'Poll', 'Praise'] as PostTab[]).map((t) => (
            <button
              key={t}
              className={`hp-composer-tab ${postTab === t ? 'active' : ''}`}
              onClick={() => setPostTab(t)}
            >
              {t}
            </button>
          ))}
        </div>
        <textarea className="hp-composer-input" placeholder="Write your post here and mention your peer" />
      </div>

      <div className="hp-announcements">
        <span className="hp-announcements-empty">No announcements</span>
        <button className="hp-add-btn" aria-label="Add"><IconPlus size={16} /></button>
      </div>

      <div className="hp-subcard">
        <div className="hp-cel-tabs-row">
          <button className={`hp-cel-tab ${celTab === 'birthdays' ? 'active' : ''}`} onClick={() => setCelTab('birthdays')}>
            <IconGift size={13} />{birthdaysToday.length} Birthday{birthdaysToday.length !== 1 ? 's' : ''}
          </button>
          <button className={`hp-cel-tab ${celTab === 'anniversaries' ? 'active' : ''}`} onClick={() => setCelTab('anniversaries')}>
            <IconConfetti size={13} />{anniversaries.length} Work Anniversar{anniversaries.length !== 1 ? 'ies' : 'y'}
          </button>
          <button className={`hp-cel-tab ${celTab === 'joinees' ? 'active' : ''}`} onClick={() => setCelTab('joinees')}>
            <IconUserPlus size={13} />{newJoinees.length} New Joinee{newJoinees.length !== 1 ? 's' : ''}
          </button>
          <button className="hp-cel-collapse" aria-label="Collapse">
            <IconChevronLeft size={14} style={{ transform: 'rotate(90deg)' }} />
          </button>
        </div>

        {celTab === 'birthdays' && (
          <>
            {birthdaysToday.length > 0 && (
              <>
                <div className="hp-cel-section-label">Birthdays today</div>
                <div className="hp-avatar-row">
                  {birthdaysToday.map((e) => <AvatarCard key={e._id} emp={e} showWhen={false} onWish={onWish} />)}
                </div>
              </>
            )}
            {upcomingBirthdays.length > 0 && (
              <>
                <div className="hp-cel-section-label" style={{ marginTop: 14 }}>Upcoming Birthdays</div>
                <div className="hp-avatar-row hp-avatar-row--wrap">
                  {upcomingBirthdays.map((e) => <AvatarCard key={e._id} emp={e} showWhen />)}
                </div>
              </>
            )}
            {birthdaysToday.length === 0 && upcomingBirthdays.length === 0 && (
              <div className="hp-empty"><p>No upcoming birthdays.</p></div>
            )}
          </>
        )}

        {celTab === 'anniversaries' && (
          <>
            {anniversaries.length > 0 ? (
              <div className="hp-avatar-row hp-avatar-row--wrap">
                {anniversaries.map((e) => (
                  <AvatarCard key={e._id} emp={{ ...e, when: `${e.years} yr${(e.years ?? 0) !== 1 ? 's' : ''}` }} showWhen />
                ))}
              </div>
            ) : (
              <div className="hp-empty"><p>No work anniversaries today.</p></div>
            )}
          </>
        )}

        {celTab === 'joinees' && (
          <>
            {newJoinees.length > 0 ? (
              <div className="hp-avatar-row hp-avatar-row--wrap">
                {newJoinees.map((e) => (
                  <AvatarCard key={e._id} emp={{ ...e, when: e.joined ? new Date(e.joined).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '' }} showWhen />
                ))}
              </div>
            ) : (
              <div className="hp-empty"><p>No new joinees this month.</p></div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function HomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const userName = personName(user);
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');

  const [birthdaysToday, setBirthdaysToday] = useState<PeopleEntry[]>([]);
  const [upcomingBirthdays, setUpcomingBirthdays] = useState<PeopleEntry[]>([]);
  const [onLeave, setOnLeave] = useState<PeopleEntry[]>([]);
  const [workingToday, setWorkingToday] = useState<PeopleEntry[]>([]);
  const [anniversaries, setAnniversaries] = useState<PeopleEntry[]>([]);
  const [newJoinees, setNewJoinees] = useState<PeopleEntry[]>([]);
  const [wishSent, setWishSent] = useState<Set<string>>(new Set());

  useEffect(() => {
    getDashboard().then(setData).catch((e) => setError(e.message));
    authed('/people/birthdays/today').then(setBirthdaysToday).catch(() => {});
    authed('/people/birthdays/upcoming').then(setUpcomingBirthdays).catch(() => {});
    authed('/people/on-leave/today').then(setOnLeave).catch(() => {});
    authed('/people/working-today').then(setWorkingToday).catch(() => {});
    authed('/people/anniversaries/today').then(setAnniversaries).catch(() => {});
    authed('/people/new-joinees').then(setNewJoinees).catch(() => {});
  }, []);

  function handleWish(emp: PeopleEntry) {
    if (wishSent.has(emp._id)) return;
    setWishSent((prev) => new Set(prev).add(emp._id));
    alert(`🎂 Birthday wish sent to ${emp.name}!`);
  }

  const dateStr = new Date().toLocaleDateString(undefined, {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <div className="hp-content">
      <div className="hp-welcome-banner">
        <div className="hp-welcome-inner">
          <div>
            <h1 className="hp-welcome-text">Welcome {userName}!</h1>
            <p className="hp-welcome-date">{dateStr}</p>
          </div>
          {data?.teamSummary && (
            <div className="hp-welcome-stats">
              <div className="hp-welcome-stat">
                <span className="hp-welcome-stat-value">{data.teamSummary.presentToday}</span>
                <span className="hp-welcome-stat-label">Present</span>
              </div>
              <div className="hp-welcome-stat">
                <span className="hp-welcome-stat-value">{data.teamSummary.onLeaveToday}</span>
                <span className="hp-welcome-stat-label">On Leave</span>
              </div>
              <div className="hp-welcome-stat">
                <span className="hp-welcome-stat-value">{data.teamSummary.totalMembers}</span>
                <span className="hp-welcome-stat-label">Team</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="hp-quick-bar">
        <span className="hp-quick-bar-label">Quick Links</span>
        {quickLinks.map((l) => (
          <button key={l.label} className="hp-quick-chip" onClick={() => navigate(l.route)}>
            {l.label}
          </button>
        ))}
      </div>

      {error && <p className="hp-error">{error}</p>}

      <div className="hp-body">
        {data && <DashboardCards data={data} navigate={navigate} />}

        <div className="hp-lower">
          <PeopleSection onLeave={onLeave} workingToday={workingToday} />
          <RightFeed
            birthdaysToday={birthdaysToday}
            upcomingBirthdays={upcomingBirthdays}
            anniversaries={anniversaries}
            newJoinees={newJoinees}
            onWish={handleWish}
          />
        </div>
      </div>
    </div>
  );
}
