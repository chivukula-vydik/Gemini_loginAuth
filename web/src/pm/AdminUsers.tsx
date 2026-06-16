import { useEffect, useState } from 'react';
import { listUsers, setUserRole, UserRow } from './pmApi';
import type { Role } from './nav';

const ROLES: Role[] = ['admin', 'pm', 'employee'];

export function AdminUsers() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState('');

  useEffect(() => { listUsers().then(setUsers).catch((e) => setError(e.message)); }, []);

  async function change(id: string, role: Role) {
    setError('');
    try {
      const updated = await setUserRole(id, role);
      setUsers((us) => us.map((u) => (u._id === id ? updated : u)));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="ts-page">
      <header className="ts-header"><h1 className="ts-h1">Users</h1></header>
      {error && <p className="ts-error">{error}</p>}
      <div className="ts-card">
        <table className="ts-table">
          <thead><tr><th className="ts-task">User</th><th>Email</th><th>Role</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u._id}>
                <td className="ts-task">{u.displayName || '—'}</td>
                <td>{u.email}</td>
                <td>
                  <select className="input" value={u.role} onChange={(e) => change(u._id, e.target.value as Role)}>
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
