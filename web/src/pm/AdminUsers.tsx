import { useEffect, useState } from 'react';
import { listUsers, setUserRole, setUserActive, deleteUser, setReportingManager, UserRow } from './pmApi';
import { useAuth } from '../authContext';
import { personName, initials } from './personName';
import type { Role } from './nav';

const ROLES: Role[] = ['admin', 'pm', 'employee', 'reporting_manager'];

export function AdminUsers() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState('');

  useEffect(() => { listUsers().then(setUsers).catch((e) => setError(e.message)); }, []);

  async function change(id: string, role: Role) {
    setError('');
    try {
      const updated = await setUserRole(id, role);
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

  const total = users.length;
  const activeCount = users.filter((u) => u.active !== false).length;
  const admins = users.filter((u) => u.role === 'admin').length;
  const pms = users.filter((u) => u.role === 'pm').length;
  const employees = users.filter((u) => u.role === 'employee').length;
  const rms = users.filter((u) => u.role === 'reporting_manager').length;

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
              <th className="col-left">Role</th>
              <th className="col-left">Reporting Manager</th>
              <th className="col-left">Status</th>
              <th className="col-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && <tr><td colSpan={5} className="ts-empty">No users found.</td></tr>}
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
                    <select className="input pm-select" value={u.role} onChange={(e) => change(u._id, e.target.value as Role)}>
                      {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </td>
                  <td className="col-left">
                    {(u.role === 'employee') ? (
                      <select className="input pm-select" value={u.reportingManagerId || ''}
                        onChange={(e) => assignRM(u._id, e.target.value || null)}>
                        <option value="">None</option>
                        {users.filter((x) => x.role === 'reporting_manager' && x.active !== false).map((rm) => (
                          <option key={rm._id} value={rm._id}>{personName(rm)}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="ts-sub">—</span>
                    )}
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
