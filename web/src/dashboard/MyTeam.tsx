import { useEffect, useState } from 'react';
import { getMyTeam, TeamMember } from './managerApi';
import { initials } from '../pm/personName';

const STATUS_LABELS: Record<string, string> = {
  present: 'Present',
  wfh: 'WFH',
  absent: 'Absent',
  'leave-casual': 'Casual Leave',
  'leave-sick': 'Sick Leave',
  'leave-earned': 'Earned Leave',
  'leave-unpaid': 'Unpaid Leave',
};

const STATUS_COLORS: Record<string, string> = {
  present: 'status-done',
  wfh: 'status-planning',
  absent: 'status-archived',
  'leave-casual': 'status-blocked',
  'leave-sick': 'status-blocked',
  'leave-earned': 'status-progress',
  'leave-unpaid': 'status-archived',
};

export function MyTeam() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    getMyTeam().then(setMembers).catch((e) => setError(e.message));
  }, []);

  const filtered = search.trim()
    ? members.filter(
        (m) =>
          m.displayName?.toLowerCase().includes(search.toLowerCase()) ||
          m.email?.toLowerCase().includes(search.toLowerCase()) ||
          m.employeeCode?.toLowerCase().includes(search.toLowerCase()),
      )
    : members;

  const presentCount = members.filter((m) => m.todayStatus === 'present' || m.todayStatus === 'wfh').length;
  const onLeaveCount = members.filter((m) => m.todayStatus.startsWith('leave')).length;
  const absentCount = members.filter((m) => m.todayStatus === 'absent').length;

  return (
    <div className="ts-page">
      <header className="ts-header">
        <div>
          <h1 className="ts-h1">My Team</h1>
          <p className="ts-sub">{members.length} direct report{members.length === 1 ? '' : 's'}</p>
        </div>
      </header>

      <div className="ts-tiles" style={{ marginBottom: 18 }}>
        <div className="ts-tile ts-tile-accent">
          <span className="ts-tile-label">Team Size</span>
          <span className="ts-tile-value">{members.length}</span>
        </div>
        <div className="ts-tile stat-done">
          <span className="ts-tile-label">Present Today</span>
          <span className="ts-tile-value">{presentCount}</span>
        </div>
        <div className="ts-tile stat-est">
          <span className="ts-tile-label">On Leave</span>
          <span className="ts-tile-value">{onLeaveCount}</span>
        </div>
        <div className="ts-tile">
          <span className="ts-tile-label">Absent</span>
          <span className="ts-tile-value">{absentCount}</span>
        </div>
      </div>

      <input
        className="input"
        placeholder="Search by name, email, or ID…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ maxWidth: 300, marginBottom: 16 }}
      />

      {error && <p className="ts-error">{error}</p>}

      <div className="dir-grid">
        {filtered.map((m) => (
          <div key={m._id} className="dir-card">
            <div className="dir-card-top">
              <span className="org-avatar">{initials(m)}</span>
              <div className="dir-card-info">
                <span className="dir-card-name">{m.displayName || m.email}</span>
                <span className="dir-card-desig">{m.designation || '—'}</span>
              </div>
              <span className={`status-badge ${STATUS_COLORS[m.todayStatus] || 'status-archived'}`} style={{ marginLeft: 'auto' }}>
                <span className="status-dot" aria-hidden="true" />
                {STATUS_LABELS[m.todayStatus] || m.todayStatus}
              </span>
            </div>
            <div className="dir-card-rows">
              {m.department && <div className="dir-row"><span className="dir-label">Dept</span><span>{m.department}</span></div>}
              {m.location && <div className="dir-row"><span className="dir-label">Location</span><span>{m.location}{m.locationCity ? `, ${m.locationCity}` : ''}</span></div>}
              <div className="dir-row"><span className="dir-label">Email</span><span>{m.email}</span></div>
              {m.phone && <div className="dir-row"><span className="dir-label">Phone</span><span>{m.phone}</span></div>}
              {m.employeeCode && <div className="dir-row"><span className="dir-label">ID</span><span>{m.employeeCode}</span></div>}
              {m.employmentType && <div className="dir-row"><span className="dir-label">Type</span><span>{m.employmentType}</span></div>}
              {m.dateOfJoining && <div className="dir-row"><span className="dir-label">Joined</span><span>{new Date(m.dateOfJoining).toLocaleDateString()}</span></div>}
            </div>
          </div>
        ))}
        {filtered.length === 0 && <p className="ts-empty">No team members found.</p>}
      </div>
    </div>
  );
}
