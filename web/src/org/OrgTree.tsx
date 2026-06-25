import { useEffect, useState } from 'react';
import { getOrgTree, TreeUser } from './orgApi';
import { initials } from '../pm/personName';

type TreeNode = TreeUser & { children: TreeNode[] };

function buildTree(users: TreeUser[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  for (const u of users) map.set(u._id, { ...u, children: [] });
  const roots: TreeNode[] = [];
  for (const u of users) {
    const node = map.get(u._id)!;
    const mgr = u.reportingManagerId?._id;
    if (mgr && map.has(mgr)) {
      map.get(mgr)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

function OrgNodeCard({ node, depth = 0 }: { node: TreeNode; depth?: number }) {
  const [open, setOpen] = useState(depth < 2);
  const hasKids = node.children.length > 0;
  const deptName = (node.departmentId as any)?.name;
  const desigTitle = (node.designationId as any)?.title;
  const locName = (node.locationId as any)?.name;

  return (
    <div className="otree-node">
      <div className="otree-card" onClick={() => hasKids && setOpen(!open)} style={{ cursor: hasKids ? 'pointer' : 'default' }}>
        <div className="otree-card-left">
          {hasKids && <span className={`ts-expand-arrow${open ? ' open' : ''}`}>&#9654;</span>}
          <span className="org-avatar">{initials(node)}</span>
        </div>
        <div className="otree-card-info">
          <span className="otree-name">{node.displayName || node.email}</span>
          {desigTitle && <span className="otree-desig">{desigTitle}</span>}
          <div className="otree-meta">
            {deptName && <span>{deptName}</span>}
            {locName && <span>{locName}</span>}
            {node.email && <span>{node.email}</span>}
          </div>
        </div>
        {hasKids && <span className="org-count">{node.children.length} report{node.children.length !== 1 ? 's' : ''}</span>}
      </div>
      {open && hasKids && (
        <div className="otree-children">
          {node.children.map((c) => <OrgNodeCard key={c._id} node={c} depth={depth + 1} />)}
        </div>
      )}
    </div>
  );
}

export function OrgTree() {
  const [users, setUsers] = useState<TreeUser[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { getOrgTree().then(setUsers).catch((e) => setError(e.message)); }, []);

  const tree = buildTree(users);

  function filterTree(nodes: TreeNode[], q: string): TreeNode[] {
    if (!q) return nodes;
    const lower = q.toLowerCase();
    function matches(n: TreeNode): boolean {
      if (n.displayName?.toLowerCase().includes(lower) || n.email?.toLowerCase().includes(lower)) return true;
      return n.children.some(matches);
    }
    return nodes.filter(matches);
  }

  const filtered = filterTree(tree, search);

  return (
    <>
      <input className="input" placeholder="Search by name or email…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 300, marginBottom: 16 }} />
      {error && <p className="ts-error">{error}</p>}
      <div className="ts-card card-section">
        {filtered.length === 0 && <p className="ts-empty">No employees found.</p>}
        {filtered.map((n) => <OrgNodeCard key={n._id} node={n} />)}
      </div>
    </>
  );
}
