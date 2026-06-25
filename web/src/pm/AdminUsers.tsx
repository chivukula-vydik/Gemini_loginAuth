import { useEffect, useRef, useState } from 'react';
import { listUsers, setUserRoles, setUserActive, deleteUser, setReportingManager, setUserDepartment, setUserShift, listDepartments, listShifts, UserRow, Department, ShiftDef } from './pmApi';
import { useAuth } from '../authContext';
import { personName, initials } from './personName';
import type { Role } from './nav';

const ROLES: Role[] = ['admin', 'vp', 'director', 'pm', 'hr', 'finance', 'reporting_manager', 'team_lead', 'employee'];
const ROLE_LABELS: Record<Role, string> = {
  admin: 'Admin', vp: 'VP', director: 'Director', pm: 'PM',
  hr: 'HR', finance: 'Finance', reporting_manager: 'Reporting Manager',
  team_lead: 'Team Lead', employee: 'Employee',
};

type SelectOption = { value: string; label: string };

function SearchSelect({ value, options, placeholder, onChange }: {
  value: string | null; options: SelectOption[]; placeholder: string;
  onChange: (val: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setSearch(''); }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(search.toLowerCase()),
  );
  const selected = options.find((o) => o.value === value);

  return (
    <div className="ss-wrap" ref={ref}>
      <button className="ss-trigger" onClick={() => { setOpen(!open); setSearch(''); }} type="button">
        <span className={selected ? 'ss-value' : 'ss-placeholder'}>{selected ? selected.label : placeholder}</span>
        <span className="ss-arrow">▾</span>
      </button>
      {open && (
        <div className="ss-dropdown">
          <input className="ss-search" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
          <div className="ss-list">
            <div className={`ss-option${!value ? ' ss-option-active' : ''}`} onClick={() => { onChange(null); setOpen(false); setSearch(''); }}>
              <span className="ss-option-none">{placeholder}</span>
            </div>
            {filtered.map((o) => (
              <div key={o.value} className={`ss-option${o.value === value ? ' ss-option-active' : ''}`} onClick={() => { onChange(o.value); setOpen(false); setSearch(''); }}>
                {o.label}
              </div>
            ))}
            {filtered.length === 0 && <span className="ss-empty">No results</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function RoleMultiSelect({ selected, onChange }: { selected: Role[]; onChange: (roles: Role[]) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setSearch(''); }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const filtered = ROLES.filter((r) =>
    ROLE_LABELS[r].toLowerCase().includes(search.toLowerCase()),
  );

  function toggle(role: Role) {
    const has = selected.includes(role);
    const next = has ? selected.filter((r) => r !== role) : [...selected, role];
    if (next.length === 0) return;
    onChange(next);
  }

  return (
    <div className="ss-wrap" ref={ref}>
      <button className="ss-trigger" onClick={() => { setOpen(!open); setSearch(''); }} type="button">
        {selected.length === 0
          ? <span className="ss-placeholder">Select roles…</span>
          : <span className="role-ms-tags">{selected.map((r) => (
              <span key={r} className="role-ms-tag">{ROLE_LABELS[r]}<span className="role-ms-tag-x" onClick={(e) => { e.stopPropagation(); toggle(r); }}>×</span></span>
            ))}</span>
        }
        <span className="ss-arrow">▾</span>
      </button>
      {open && (
        <div className="ss-dropdown">
          <input className="ss-search" placeholder="Search roles…" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
          <div className="ss-list">
            {filtered.length === 0 && <span className="ss-empty">No roles found</span>}
            {filtered.map((r) => (
              <label key={r} className="ss-option ss-option-check">
                <input type="checkbox" checked={selected.includes(r)} onChange={() => toggle(r)} />
                <span>{ROLE_LABELS[r]}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function AdminUsers() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [shifts, setShifts] = useState<ShiftDef[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    listUsers().then(setUsers).catch((e) => setError(e.message));
    listDepartments().then(setDepartments).catch(() => {});
    listShifts().then(setShifts).catch(() => {});
  }, []);

  async function toggleRole(id: string, next: Role[]) {
    setError('');
    if (next.length === 0) return;
    try {
      const updated = await setUserRoles(id, next);
      setUsers((us) => us.map((u) => (u._id === id ? { ...u, ...updated } : u)));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function toggleActive(u: UserRow) {
    setError('');
    try {
      const updated = await setUserActive(u._id, u.active === false);
      setUsers((us) => us.map((x) => (x._id === u._id ? { ...x, ...updated } : x)));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function remove(u: UserRow) {
    if (!window.confirm(`Permanently delete ${u.email}? This cannot be undone.`)) return;
    setError('');
    try {
      await deleteUser(u._id);
      setUsers((us) => us.filter((x) => x._id !== u._id));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function assignRM(userId: string, rmId: string | null) {
    setError('');
    try {
      await setReportingManager(userId, rmId);
      setUsers((us) => us.map((u) => (u._id === userId ? { ...u, reportingManagerId: rmId } : u)));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function assignDept(userId: string, departmentId: string | null) {
    setError('');
    try {
      await setUserDepartment(userId, departmentId);
      setUsers((us) => us.map((u) => (u._id === userId ? { ...u, departmentId } : u)));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function assignShift(userId: string, shiftId: string | null) {
    setError('');
    try {
      await setUserShift(userId, shiftId);
      setUsers((us) => us.map((u) => (u._id === userId ? { ...u, shiftId } : u)));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const total = users.length;
  const activeCount = users.filter((u) => u.active !== false).length;
  const admins = users.filter((u) => u.roles.includes('admin')).length;
  const pms = users.filter((u) => u.roles.includes('pm')).length;
  const employees = users.filter((u) => u.roles.includes('employee')).length;
  const rms = users.filter((u) => u.roles.includes('reporting_manager')).length;

  const activeDepts = departments.filter((d) => d.active);
  const activeShifts = shifts.filter((s) => s.active);

  return (
    <div className="ts-page">
      <header className="ts-header">
        <div>
          <h1 className="ts-h1">Users</h1>
          <p className="ts-sub">{users.length} {users.length === 1 ? 'member' : 'members'}</p>
        </div>
      </header>

      <div className="ts-tiles">
        <div className="ts-tile ts-tile-accent">
          <span className="ts-tile-label">Total members</span>
          <span className="ts-tile-value">{total}</span>
          <span className="ts-tile-foot">{activeCount} active · {total - activeCount} inactive</span>
        </div>
        <div className="ts-tile stat-tasks">
          <span className="ts-tile-label">Admins</span>
          <span className="ts-tile-value">{admins}</span>
        </div>
        <div className="ts-tile stat-done">
          <span className="ts-tile-label">Project managers</span>
          <span className="ts-tile-value">{pms}</span>
        </div>
        <div className="ts-tile stat-logged">
          <span className="ts-tile-label">Employees</span>
          <span className="ts-tile-value">{employees}</span>
        </div>
        <div className="ts-tile stat-est">
          <span className="ts-tile-label">Reporting Managers</span>
          <span className="ts-tile-value">{rms}</span>
        </div>
      </div>

      {error && <p className="ts-error">{error}</p>}
      <div className="ts-card">
        <table className="ts-table">
          <thead>
            <tr>
              <th className="ts-task">User</th>
              <th className="col-left">Roles</th>
              <th className="col-left">Department</th>
              <th className="col-left">Shift</th>
              <th className="col-left">Reporting Manager</th>
              <th className="col-left">Status</th>
              <th className="col-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && <tr><td colSpan={7} className="ts-empty">No users found.</td></tr>}
            {users.map((u) => {
              const inactive = u.active === false;
              const isSelf = u.email === me?.email;
              return (
                <tr key={u._id} className={inactive ? 'row-inactive' : undefined}>
                  <td className="ts-task">
                    <span className="person-pill">
                      <span className="person-avatar">{initials(u)}</span>
                      <span className="user-id">
                        <span className="user-id-name">
                          {personName(u)}
                          {isSelf && <span className="self-tag">You</span>}
                        </span>
                        <span className="user-id-email">{u.email}</span>
                      </span>
                    </span>
                  </td>
                  <td className="col-left">
                    <RoleMultiSelect
                      selected={u.roles}
                      onChange={(next) => toggleRole(u._id, next)}
                    />
                  </td>
                  <td className="col-left">
                    <SearchSelect
                      value={u.departmentId || null}
                      placeholder="No department"
                      options={activeDepts.map((d) => ({ value: d._id, label: d.name }))}
                      onChange={(val) => assignDept(u._id, val)}
                    />
                  </td>
                  <td className="col-left">
                    <SearchSelect
                      value={u.shiftId || null}
                      placeholder="No shift"
                      options={activeShifts.map((s) => ({ value: s._id, label: s.name }))}
                      onChange={(val) => assignShift(u._id, val)}
                    />
                  </td>
                  <td className="col-left">
                    <SearchSelect
                      value={u.reportingManagerId || null}
                      placeholder="No manager"
                      options={users.filter((x) => x.active !== false && x._id !== u._id).map((rm) => ({ value: rm._id, label: personName(rm) }))}
                      onChange={(val) => assignRM(u._id, val)}
                    />
                  </td>
                  <td className="col-left">
                    <span className={`status-badge ${inactive ? 'status-archived' : 'status-done'}`}>
                      <span className="status-dot" aria-hidden="true" />
                      {inactive ? 'Inactive' : 'Active'}
                    </span>
                  </td>
                  <td className="col-left">
                    {!isSelf && (
                      <div className="row-actions">
                        <button className="table-action" onClick={() => toggleActive(u)}>
                          {inactive ? 'Activate' : 'Deactivate'}
                        </button>
                        <button className="table-action danger" onClick={() => remove(u)}>
                          Delete
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
