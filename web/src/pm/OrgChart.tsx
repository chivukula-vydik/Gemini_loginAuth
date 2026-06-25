import { useEffect, useState } from 'react';
import { listDirectory, listPublicDepartments, Person } from './pmApi';
import { personName, initials } from './personName';
import { authed } from '../fetchHelper';

type OrgUser = Person & { reportingManagerId?: string | null; departmentId?: string | null; roles?: string[] };
type Dept = { _id: string; name: string; description: string };

async function listOrgUsers(): Promise<OrgUser[]> {
  return authed('/users?fields=reportingManagerId,departmentId,roles') as Promise<OrgUser[]>;
}

type TreeNode = OrgUser & { children: TreeNode[] };

function buildTree(users: OrgUser[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  for (const u of users) map.set(u._id, { ...u, children: [] });

  const roots: TreeNode[] = [];
  for (const u of users) {
    const node = map.get(u._id)!;
    if (u.reportingManagerId && map.has(u.reportingManagerId)) {
      map.get(u.reportingManagerId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

function OrgNode({ node, depth = 0 }: { node: TreeNode; depth?: number }) {
  const [open, setOpen] = useState(depth < 2);
  const hasKids = node.children.length > 0;
  const roleLabel = node.roles?.filter((r) => r !== 'employee').join(', ') || 'employee';

  return (
    <div className="org-node">
      <div className="org-person" onClick={() => hasKids && setOpen(!open)} style={{ cursor: hasKids ? 'pointer' : 'default' }}>
        {hasKids && <span className={`ts-expand-arrow${open ? ' open' : ''}`}>&#9654;</span>}
        <span className="org-avatar">{initials(node)}</span>
        <div className="org-info">
          <span className="org-name">{personName(node)}</span>
          <span className="org-role">{roleLabel}</span>
        </div>
        {hasKids && <span className="org-count">{node.children.length}</span>}
      </div>
      {open && hasKids && (
        <div className="org-children">
          {node.children.map((c) => <OrgNode key={c._id} node={c} depth={depth + 1} />)}
        </div>
      )}
    </div>
  );
}

export function OrgChart() {
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [departments, setDepartments] = useState<Dept[]>([]);
  const [view, setView] = useState<'tree' | 'dept'>('tree');
  const [error, setError] = useState('');

  useEffect(() => {
    listOrgUsers().then(setUsers).catch((e) => setError(e.message));
    listPublicDepartments().then(setDepartments).catch(() => {});
  }, []);

  const tree = buildTree(users);

  const byDept = new Map<string, OrgUser[]>();
  const unassigned: OrgUser[] = [];
  for (const u of users) {
    if (u.departmentId) {
      if (!byDept.has(u.departmentId)) byDept.set(u.departmentId, []);
      byDept.get(u.departmentId)!.push(u);
    } else {
      unassigned.push(u);
    }
  }

  return (
    <div className="ts-page">
      <header className="ts-header">
        <div>
          <h1 className="ts-h1">Organisation</h1>
          <p className="ts-sub">{users.length} people</p>
        </div>
      </header>

      <div className="page-tabs" style={{ marginBottom: 16 }}>
        <button className={`page-tab${view === 'tree' ? ' page-tab-active' : ''}`} onClick={() => setView('tree')}>Reporting tree</button>
        <button className={`page-tab${view === 'dept' ? ' page-tab-active' : ''}`} onClick={() => setView('dept')}>By department</button>
      </div>

      {error && <p className="ts-error">{error}</p>}

      {view === 'tree' && (
        <div className="ts-card card-section">
          {tree.length === 0 && <p className="ts-empty">No users found.</p>}
          {tree.map((n) => <OrgNode key={n._id} node={n} />)}
        </div>
      )}

      {view === 'dept' && (
        <>
          {departments.map((d) => {
            const members = byDept.get(d._id) || [];
            return (
              <div key={d._id} className="ts-card card-section">
                <div className="card-title">{d.name} <span className="org-count">{members.length}</span></div>
                {d.description && <p className="ts-sub" style={{ marginBottom: 8 }}>{d.description}</p>}
                {members.length === 0 && <p className="ts-sub">No members</p>}
                <div className="org-dept-grid">
                  {members.map((m) => (
                    <div key={m._id} className="org-dept-card">
                      <span className="org-avatar">{initials(m)}</span>
                      <span className="org-name">{personName(m)}</span>
                      <span className="org-role">{m.roles?.filter((r) => r !== 'employee').join(', ') || 'employee'}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {unassigned.length > 0 && (
            <div className="ts-card card-section">
              <div className="card-title">Unassigned <span className="org-count">{unassigned.length}</span></div>
              <div className="org-dept-grid">
                {unassigned.map((m) => (
                  <div key={m._id} className="org-dept-card">
                    <span className="org-avatar">{initials(m)}</span>
                    <span className="org-name">{personName(m)}</span>
                    <span className="org-role">{m.roles?.filter((r) => r !== 'employee').join(', ') || 'employee'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
