import { useEffect, useState } from 'react';
import { getDirectory, listOrgDepartments, listBusinessUnits, listLocations, listDesignations, updateJobInfo, DirectoryUser, OrgDepartment, BusinessUnit, OrgLocation, Designation, DirectoryPage } from './orgApi';
import { initials } from '../pm/personName';
import { useAuth } from '../authContext';

export function OrgDirectory() {
  const { user: me } = useAuth();
  const isAdmin = me?.roles?.some((r: string) => ['admin', 'hr'].includes(r)) ?? false;

  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [deps, setDeps] = useState<OrgDepartment[]>([]);
  const [bus, setBus] = useState<BusinessUnit[]>([]);
  const [locs, setLocs] = useState<OrgLocation[]>([]);
  const [desigs, setDesigs] = useState<Designation[]>([]);
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [editError, setEditError] = useState('');
  const [saving, setSaving] = useState(false);

  function load(p = page) {
    const params: Record<string, string> = { page: String(p) };
    if (q.trim()) params.q = q.trim();
    if (filters.departmentId) params.departmentId = filters.departmentId;
    if (filters.businessUnitId) params.businessUnitId = filters.businessUnitId;
    if (filters.locationId) params.locationId = filters.locationId;
    if (filters.designationId) params.designationId = filters.designationId;
    if (filters.employmentType) params.employmentType = filters.employmentType;
    getDirectory(params).then((res) => {
      setUsers(res.users);
      setTotal(res.total);
      setTotalPages(res.pages);
    }).catch((e) => setError(e.message));
  }

  useEffect(() => { setPage(1); load(1); }, [q, filters]);
  useEffect(() => { load(); }, [page]);
  useEffect(() => {
    listOrgDepartments().then(setDeps).catch(() => {});
    listBusinessUnits().then(setBus).catch(() => {});
    listLocations().then(setLocs).catch(() => {});
    listDesignations().then(setDesigs).catch(() => {});
  }, []);

  function setFilter(key: string, val: string) {
    setFilters((prev) => ({ ...prev, [key]: val }));
  }

  function openEdit(u: DirectoryUser) {
    setEditingId(u._id);
    setEditForm({
      employeeCode: u.employeeCode || '',
      departmentId: typeof u.departmentId === 'object' && u.departmentId ? u.departmentId._id : '',
      designationId: typeof u.designationId === 'object' && u.designationId ? u.designationId._id : '',
      locationId: typeof u.locationId === 'object' && u.locationId ? u.locationId._id : '',
      reportingManagerId: typeof u.reportingManagerId === 'object' && u.reportingManagerId ? u.reportingManagerId._id : '',
      employmentType: u.employmentType || '',
      phone: u.phone || '',
      dateOfJoining: u.dateOfJoining || '',
    });
    setEditError('');
  }

  async function saveEdit(id: string) {
    setSaving(true);
    setEditError('');
    try {
      const body: Record<string, unknown> = { ...editForm };
      for (const k of ['departmentId', 'designationId', 'locationId', 'reportingManagerId']) {
        if (!body[k]) body[k] = null;
      }
      await updateJobInfo(id, body);
      setEditingId(null);
      load();
    } catch (e) {
      setEditError((e as Error).message);
    } finally {
      setSaving(false);
    }
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
              {isAdmin && (
                <button className="link-btn" style={{ marginLeft: 'auto', fontSize: 12 }}
                  onClick={() => editingId === u._id ? setEditingId(null) : openEdit(u)}>
                  {editingId === u._id ? 'Cancel' : 'Edit'}
                </button>
              )}
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

            {editingId === u._id && (
              <div className="dir-edit-form" style={{ padding: '12px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {editError && <p className="ts-error">{editError}</p>}
                <label className="field-label">Employee ID
                  <input className="input" value={editForm.employeeCode}
                    onChange={(e) => setEditForm((f) => ({ ...f, employeeCode: e.target.value }))} />
                </label>
                <label className="field-label">Department
                  <select className="input" value={editForm.departmentId}
                    onChange={(e) => setEditForm((f) => ({ ...f, departmentId: e.target.value }))}>
                    <option value="">—</option>
                    {deps.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
                  </select>
                </label>
                <label className="field-label">Designation
                  <select className="input" value={editForm.designationId}
                    onChange={(e) => setEditForm((f) => ({ ...f, designationId: e.target.value }))}>
                    <option value="">—</option>
                    {desigs.map((d) => <option key={d._id} value={d._id}>{d.title}</option>)}
                  </select>
                </label>
                <label className="field-label">Location
                  <select className="input" value={editForm.locationId}
                    onChange={(e) => setEditForm((f) => ({ ...f, locationId: e.target.value }))}>
                    <option value="">—</option>
                    {locs.map((l) => <option key={l._id} value={l._id}>{l.name}</option>)}
                  </select>
                </label>
                <label className="field-label">Reporting Manager
                  <select className="input" value={editForm.reportingManagerId}
                    onChange={(e) => setEditForm((f) => ({ ...f, reportingManagerId: e.target.value }))}>
                    <option value="">—</option>
                    {users.filter((x) => x._id !== u._id).map((x) => (
                      <option key={x._id} value={x._id}>{x.displayName || x.email}</option>
                    ))}
                  </select>
                </label>
                <label className="field-label">Employment Type
                  <select className="input" value={editForm.employmentType}
                    onChange={(e) => setEditForm((f) => ({ ...f, employmentType: e.target.value }))}>
                    <option value="">—</option>
                    {['full-time', 'part-time', 'contract', 'intern', 'freelance'].map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <label className="field-label">Phone
                  <input className="input" value={editForm.phone}
                    onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))} />
                </label>
                <label className="field-label">Date of Joining
                  <input className="input" type="date" value={editForm.dateOfJoining}
                    onChange={(e) => setEditForm((f) => ({ ...f, dateOfJoining: e.target.value }))} />
                </label>
                <button className="btn btn-primary btn-auto" disabled={saving}
                  onClick={() => saveEdit(u._id)}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            )}
          </div>
        ))}
        {users.length === 0 && <p className="ts-empty">No employees match filters.</p>}
      </div>
    </>
  );
}
