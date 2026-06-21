import { Fragment, useEffect, useState } from 'react';
import {
  listUsers, setUserRole, setUserActive, deleteUser, UserRow,
  getUserReestimations, getReestimationSummary, type ReestimationHistory,
} from './pmApi';
import { pastRecordLabel } from './pastRecord';
import { useAuth } from '../authContext';
import { personName, initials } from './personName';
import type { Role } from './nav';

const ROLES: Role[] = ['admin', 'pm', 'employee'];

export function AdminUsers() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState('');
  const [requesters, setRequesters] = useState<number | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [history, setHistory] = useState<Record<string, ReestimationHistory>>({});

  useEffect(() => { listUsers().then(setUsers).catch((e) => setError(e.message)); }, []);
  useEffect(() => { getReestimationSummary().then((s) => setRequesters(s.requesters)).catch(() => {}); }, []);

  async function toggleHistory(id: string) {
    if (openId === id) { setOpenId(null); return; }
    setOpenId(id);
    if (!history[id]) {
      try {
        const h = await getUserReestimations(id);
        setHistory((prev) => ({ ...prev, [id]: h }));
      } catch (e) {
        setError((e as Error).message);
      }
    }
  }

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

  const total = users.length;
  const activeCount = users.filter((u) => u.active !== false).length;
  const admins = users.filter((u) => u.role === 'admin').length;
  const pms = users.filter((u) => u.role === 'pm').length;
  const employees = users.filter((u) => u.role === 'employee').length;

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
        <div className="ts-tile">
          <span className="ts-tile-label">Re-estimation requesters</span>
          <span className="ts-tile-value">{requesters ?? '—'}</span>
          <span className="ts-tile-foot">people who have asked at least once</span>
        </div>
      </div>

      {error && <p className="ts-error">{error}</p>}
      <div className="ts-card">
        <table className="ts-table">
          <thead>
            <tr>
              <th className="ts-task">User</th>
              <th className="col-left">Role</th>
              <th className="col-left">Status</th>
              <th className="col-left">Re-estimations</th>
              <th className="col-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && <tr><td colSpan={5} className="ts-empty">No users found.</td></tr>}
            {users.map((u) => {
              const inactive = u.active === false;
              const isSelf = u.email === me?.email;
              const count = u.reestimationCount ?? 0;
              const isOpen = openId === u._id;
              const h = history[u._id];
              return (
                <Fragment key={u._id}>
                <tr className={inactive ? 'row-inactive' : undefined}>
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
                    <span className={`status-badge ${inactive ? 'status-archived' : 'status-done'}`}>
                      <span className="status-dot" aria-hidden="true" />
                      {inactive ? 'Inactive' : 'Active'}
                    </span>
                  </td>
                  <td className="col-left">
                    {count > 0 ? (
                      <button className="table-action" onClick={() => toggleHistory(u._id)} aria-expanded={isOpen}>
                        {count} {count === 1 ? 'request' : 'requests'} {isOpen ? '▴' : '▾'}
                      </button>
                    ) : (
                      <span className="ts-sub">None</span>
                    )}
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
                {isOpen && (
                  <tr className="reest-detail-row">
                    <td colSpan={5}>
                      {!h ? (
                        <span className="ts-sub">Loading history…</span>
                      ) : (
                        <div className="reest-detail">
                          <div className="reest-summary">{pastRecordLabel(h.summary)}</div>
                          <ul className="reest-list">
                            {h.entries.map((e, i) => (
                              <li key={i} className="reest-item">
                                <span className={`reest-status reest-${e.status}`}>{e.status}</span>
                                <span className="reest-task">{e.taskTitle}{e.projectName ? ` · ${e.projectName}` : ''}</span>
                                <span className="reest-change">{e.fromHours}h → {e.toHours}h</span>
                                {e.reason && <span className="reest-reason">“{e.reason}”</span>}
                                <span className="reest-when">{e.requestedAt.slice(0, 10)}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
