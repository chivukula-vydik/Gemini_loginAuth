import { useEffect, useState } from 'react';
import { getDirectory, listOrgDepartments, listBusinessUnits, listLocations, listDesignations, DirectoryUser, OrgDepartment, BusinessUnit, OrgLocation, Designation } from './orgApi';
import { initials } from '../pm/personName';

export function OrgDirectory() {
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [deps, setDeps] = useState<OrgDepartment[]>([]);
  const [bus, setBus] = useState<BusinessUnit[]>([]);
  const [locs, setLocs] = useState<OrgLocation[]>([]);
  const [desigs, setDesigs] = useState<Designation[]>([]);
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [error, setError] = useState('');

  function load() {
    const params: Record<string, string> = {};
    if (q.trim()) params.q = q.trim();
    if (filters.departmentId) params.departmentId = filters.departmentId;
    if (filters.businessUnitId) params.businessUnitId = filters.businessUnitId;
    if (filters.locationId) params.locationId = filters.locationId;
    if (filters.designationId) params.designationId = filters.designationId;
    if (filters.employmentType) params.employmentType = filters.employmentType;
    getDirectory(Object.keys(params).length ? params : undefined).then(setUsers).catch((e) => setError(e.message));
  }

  useEffect(() => { load(); }, [q, filters]);
  useEffect(() => {
    listOrgDepartments().then(setDeps).catch(() => {});
    listBusinessUnits().then(setBus).catch(() => {});
    listLocations().then(setLocs).catch(() => {});
    listDesignations().then(setDesigs).catch(() => {});
  }, []);

  function setFilter(key: string, val: string) {
    setFilters((prev) => ({ ...prev, [key]: val }));
  }

  return (
    <>
      <div className="dir-filters">
        <input className="input" placeholder="Search name, email, ID…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 220 }} />
        <select className="input" value={filters.departmentId || ''} onChange={(e) => setFilter('departmentId', e.target.value)}>
          <option value="">All departments</option>
          {deps.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
        </select>
        <select className="input" value={filters.businessUnitId || ''} onChange={(e) => setFilter('businessUnitId', e.target.value)}>
          <option value="">All units</option>
          {bus.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
        </select>
        <select className="input" value={filters.locationId || ''} onChange={(e) => setFilter('locationId', e.target.value)}>
          <option value="">All locations</option>
          {locs.map((l) => <option key={l._id} value={l._id}>{l.name}</option>)}
        </select>
        <select className="input" value={filters.designationId || ''} onChange={(e) => setFilter('designationId', e.target.value)}>
          <option value="">All designations</option>
          {desigs.map((d) => <option key={d._id} value={d._id}>{d.title}</option>)}
        </select>
        <select className="input" value={filters.employmentType || ''} onChange={(e) => setFilter('employmentType', e.target.value)}>
          <option value="">All types</option>
          <option value="full-time">Full-time</option>
          <option value="part-time">Part-time</option>
          <option value="contract">Contract</option>
          <option value="intern">Intern</option>
          <option value="freelance">Freelance</option>
        </select>
      </div>

      {error && <p className="ts-error">{error}</p>}
      <p className="ts-sub" style={{ marginBottom: 8 }}>{users.length} employee{users.length === 1 ? '' : 's'}</p>
      <div className="dir-grid">
        {users.map((u) => (
          <div key={u._id} className="dir-card">
            <div className="dir-card-top">
              <span className="org-avatar">{initials(u)}</span>
              <div className="dir-card-info">
                <span className="dir-card-name">{u.displayName || u.email}</span>
                <span className="dir-card-desig">{u.designationId?.title || '—'}</span>
              </div>
            </div>
            <div className="dir-card-rows">
              {u.departmentId && <div className="dir-row"><span className="dir-label">Dept</span><span>{u.departmentId.name}</span></div>}
              {u.locationId && <div className="dir-row"><span className="dir-label">Location</span><span>{u.locationId.name}</span></div>}
              {u.reportingManagerId && <div className="dir-row"><span className="dir-label">Manager</span><span>{u.reportingManagerId.displayName}</span></div>}
              <div className="dir-row"><span className="dir-label">Email</span><span>{u.email}</span></div>
              {u.phone && <div className="dir-row"><span className="dir-label">Phone</span><span>{u.phone}</span></div>}
              {u.employeeCode && <div className="dir-row"><span className="dir-label">ID</span><span>{u.employeeCode}</span></div>}
              <div className="dir-row"><span className="dir-label">Type</span><span>{u.employmentType}</span></div>
            </div>
          </div>
        ))}
        {users.length === 0 && <p className="ts-empty">No employees match filters.</p>}
      </div>
    </>
  );
}
