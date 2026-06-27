import { useEffect, useState } from 'react';
import {
  IconUsers,
  IconSearch,
  IconArrowUp,
  IconChevronDown,
  IconChevronRight,
} from '@tabler/icons-react';
import { getOrgTree, TreeUser } from './orgApi';
import { initials } from '../pm/personName';
import './OrgTree.css';

type TreeNode = TreeUser & { children: TreeNode[] };

const AVATAR_COLORS = ['#4f6ef7', '#22c55e', '#f59e0b', '#8b5cf6', '#0ea5e9', '#ec4899', '#14b8a6', '#f97316', '#ef4444', '#6b7280', '#a855f7'];
function colorFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

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

function countAll(node: TreeNode): number {
  let c = 0;
  for (const ch of node.children) c += 1 + countAll(ch);
  return c;
}

function matchesSearch(node: TreeNode, q: string): boolean {
  const lower = q.toLowerCase();
  if (node.displayName?.toLowerCase().includes(lower) || node.email?.toLowerCase().includes(lower)) return true;
  return node.children.some((ch) => matchesSearch(ch, lower));
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function OrgCard({ node, isRoot, onClick }: { node: TreeNode; isRoot?: boolean; onClick?: () => void }) {
  const deptName = (node.departmentId as any)?.name;
  const desigTitle = (node.designationId as any)?.title;
  const locName = (node.locationId as any)?.name;
  const directCount = node.children.length;

  return (
    <div className={`ot-card ${isRoot ? 'ot-card--root' : ''}`} onClick={onClick} role="button" tabIndex={0}>
      <div className="ot-card-top">
        <div className="ot-avatar" style={{ background: colorFor(node._id) }}>
          {initials(node)}
        </div>
        <div className="ot-card-info">
          <div className="ot-card-name">{node.displayName || node.email}</div>
          {desigTitle && <div className="ot-card-title">{desigTitle}</div>}
          {locName && <div className="ot-card-location">{locName}</div>}
          {deptName && <div className="ot-card-dept">{deptName}</div>}
        </div>
      </div>
      {directCount > 0 && (
        <div className="ot-card-footer">
          <IconUsers size={12} />
          {directCount} direct report{directCount !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}

// ─── Branch (recursive) ──────────────────────────────────────────────────────

function OrgBranch({ node, depth }: { node: TreeNode; depth: number }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasKids = node.children.length > 0;

  return (
    <div className="ot-branch">
      <div className="ot-connector-up" />
      <div className="ot-branch-card-row">
        <OrgCard node={node} onClick={hasKids ? () => setExpanded(!expanded) : undefined} />
        {hasKids && (
          <button className="ot-expand-btn" onClick={() => setExpanded(!expanded)} aria-label={expanded ? 'Collapse' : 'Expand'}>
            {expanded ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
          </button>
        )}
      </div>
      {expanded && hasKids && (
        <>
          <div className="ot-connector-down" />
          <div className="ot-children">
            {node.children.map((ch) => (
              <OrgBranch key={ch._id} node={ch} depth={depth + 1} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function OrgTree() {
  const [users, setUsers] = useState<TreeUser[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [groupByDept, setGroupByDept] = useState(false);

  useEffect(() => { getOrgTree().then(setUsers).catch((e) => setError(e.message)); }, []);

  const tree = buildTree(users);
  const totalCount = users.length;

  const filtered = search
    ? tree.filter((n) => matchesSearch(n, search))
    : tree;

  return (
    <div className="ot-root">
      {/* Toolbar */}
      <div className="ot-toolbar">
        <div className="ot-search-wrap">
          <IconSearch size={14} color="var(--muted)" />
          <input
            className="ot-search"
            placeholder="Search employee…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="ot-toolbar-right">
          <span className="ot-count-badge">
            <IconUsers size={14} />
            {totalCount}
          </span>
          <label className="ot-toggle">
            <input type="checkbox" checked={groupByDept} onChange={() => setGroupByDept(!groupByDept)} />
            <span>Group by department</span>
          </label>
        </div>
      </div>

      {error && <p className="ts-error">{error}</p>}

      {/* Tree */}
      <div className="ot-tree-area">
        {filtered.length === 0 && <p className="ot-empty">No employees found.</p>}

        {!groupByDept && filtered.map((root) => (
          <div key={root._id} className="ot-tree-root">
            <OrgCard node={root} isRoot />
            {root.children.length > 0 && (
              <>
                <div className="ot-connector-down ot-connector-down--root" />
                <div className="ot-children">
                  {root.children.map((ch) => (
                    <OrgBranch key={ch._id} node={ch} depth={1} />
                  ))}
                </div>
              </>
            )}
          </div>
        ))}

        {groupByDept && (() => {
          const deptMap = new Map<string, TreeNode[]>();
          function collect(nodes: TreeNode[]) {
            for (const n of nodes) {
              const dept = (n.departmentId as any)?.name || 'Unassigned';
              if (!deptMap.has(dept)) deptMap.set(dept, []);
              deptMap.get(dept)!.push(n);
              collect(n.children);
            }
          }
          collect(filtered);
          return [...deptMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([dept, members]) => (
            <div key={dept} className="ot-dept-group">
              <h3 className="ot-dept-title">{dept} <span className="ot-dept-count">({members.length})</span></h3>
              <div className="ot-dept-cards">
                {members.map((m) => <OrgCard key={m._id} node={m} />)}
              </div>
            </div>
          ));
        })()}
      </div>
    </div>
  );
}
