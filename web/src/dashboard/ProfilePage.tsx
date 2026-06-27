import { useEffect, useState } from 'react';
import {
  IconUser,
  IconBriefcase,
  IconBuilding,
  IconClock,
  IconMail,
  IconPhone,
  IconCalendar,
  IconMapPin,
  IconEdit,
  IconCheck,
  IconX,
  IconShield,
  IconLink,
  IconStarFilled,
  IconId,
  IconGenderBigender,
  IconDroplet,
  IconHeart,
  IconFlag,
  IconHome,
  IconAlertTriangle,
  IconCreditCard,
  IconBuildingBank,
} from '@tabler/icons-react';
import { useAuth } from '../authContext';
import { authed } from '../fetchHelper';
import { personName } from '../pm/personName';
import './ProfilePage.css';

type ProfileData = {
  _id: string;
  email: string;
  displayName: string;
  phone: string;
  roles: string[];
  skills: { _id: string; name: string }[];
  employeeCode: string;
  employmentType: string;
  dateOfBirth: string | null;
  dateOfJoining: string | null;
  probationEndDate: string | null;
  gender: string;
  bloodGroup: string;
  maritalStatus: string;
  nationality: string;
  address: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  emergencyContactRelation: string;
  pan: string;
  aadhaar: string;
  bankName: string;
  bankAccount: string;
  ifsc: string;
  departmentId: { _id: string; name: string } | null;
  designationId: { _id: string; name: string } | null;
  locationId: { _id: string; name: string } | null;
  legalEntityId: { _id: string; name: string } | null;
  businessUnitId: { _id: string; name: string } | null;
  shiftId: { _id: string; name: string; startTime?: string; endTime?: string } | null;
  reportingManagerId: { _id: string; displayName: string; email: string } | null;
  providers: { provider: string }[];
  createdAt: string;
};

type OptionItem = { _id: string; name: string };
type Tab = 'personal' | 'job' | 'team' | 'documents';

function fmtDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function toDateInput(d: string | null): string {
  if (!d) return '';
  return new Date(d).toISOString().slice(0, 10);
}

function tenure(d: string | null): string {
  if (!d) return '';
  const start = new Date(d);
  const now = new Date();
  const months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y === 0) return `${m} month${m !== 1 ? 's' : ''}`;
  return `${y} yr${y !== 1 ? 's' : ''} ${m} mo`;
}

function empTypeLabel(t: string): string {
  const map: Record<string, string> = {
    'full-time': 'Full Time', 'part-time': 'Part Time',
    contract: 'Contract', intern: 'Intern', freelance: 'Freelance',
  };
  return map[t] || t;
}

function InfoField({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="kp-field">
      <div className="kp-field-icon">{icon}</div>
      <div className="kp-field-body">
        <span className="kp-field-label">{label}</span>
        <span className="kp-field-value">{value || '—'}</span>
      </div>
    </div>
  );
}

function FormSelect({ label, value, options, onChange }: {
  label: string; value: string; options: OptionItem[]; onChange: (v: string) => void;
}) {
  return (
    <label className="kp-form-group">
      <span className="kp-form-lbl">{label}</span>
      <select className="kp-input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">— Select —</option>
        {options.map((o) => <option key={o._id} value={o._id}>{o.name}</option>)}
      </select>
    </label>
  );
}

export function ProfilePage() {
  const { user, reload } = useAuth();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('personal');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Edit state
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editDob, setEditDob] = useState('');
  const [editCode, setEditCode] = useState('');
  const [editEmpType, setEditEmpType] = useState('');
  const [editJoining, setEditJoining] = useState('');
  const [editProbation, setEditProbation] = useState('');
  const [editDept, setEditDept] = useState('');
  const [editDesig, setEditDesig] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editEntity, setEditEntity] = useState('');
  const [editBU, setEditBU] = useState('');
  const [editShift, setEditShift] = useState('');

  // Dropdown options
  const [departments, setDepartments] = useState<OptionItem[]>([]);
  const [designations, setDesignations] = useState<OptionItem[]>([]);
  const [locations, setLocations] = useState<OptionItem[]>([]);
  const [entities, setEntities] = useState<OptionItem[]>([]);
  const [businessUnits, setBusinessUnits] = useState<OptionItem[]>([]);
  const [shifts, setShifts] = useState<OptionItem[]>([]);

  useEffect(() => {
    authed('/me')
      .then((d: ProfileData) => { setProfile(d); populateEdit(d); })
      .catch((e: Error) => setError(e.message));
  }, []);

  function populateEdit(d: ProfileData) {
    setEditName(d.displayName);
    setEditPhone(d.phone || '');
    setEditDob(toDateInput(d.dateOfBirth));
    setEditCode(d.employeeCode || '');
    setEditEmpType(d.employmentType || 'full-time');
    setEditJoining(toDateInput(d.dateOfJoining));
    setEditProbation(toDateInput(d.probationEndDate));
    setEditDept(d.departmentId?._id || '');
    setEditDesig(d.designationId?._id || '');
    setEditLocation(d.locationId?._id || '');
    setEditEntity(d.legalEntityId?._id || '');
    setEditBU(d.businessUnitId?._id || '');
    setEditShift(d.shiftId?._id || '');
  }

  function startEditing() {
    if (profile) populateEdit(profile);
    setEditing(true);
    // Load dropdown options
    authed('/org/departments').then(setDepartments).catch(() => {});
    authed('/org/designations').then(setDesignations).catch(() => {});
    authed('/org/locations').then(setLocations).catch(() => {});
    authed('/org/legal-entities').then(setEntities).catch(() => {});
    authed('/org/business-units').then(setBusinessUnits).catch(() => {});
    authed('/org/shifts').then((s: any[]) => setShifts(s.map((x) => ({ _id: x._id, name: x.name })))).catch(() => {});
  }

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await authed('/me', 'PATCH', {
        displayName: editName,
        phone: editPhone,
        dateOfBirth: editDob || null,
        employeeCode: editCode,
        employmentType: editEmpType,
        dateOfJoining: editJoining || null,
        probationEndDate: editProbation || null,
        departmentId: editDept || null,
        designationId: editDesig || null,
        locationId: editLocation || null,
        legalEntityId: editEntity || null,
        businessUnitId: editBU || null,
        shiftId: editShift || null,
      }) as ProfileData;
      setProfile(updated);
      setEditing(false);
      await reload();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const name = profile ? (profile.displayName || profile.email) : personName(user);
  const initial = (name[0] ?? '?').toUpperCase();

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'personal', label: 'Personal', icon: <IconUser size={15} /> },
    { key: 'job', label: 'Job', icon: <IconBriefcase size={15} /> },
    { key: 'team', label: 'Team & Org', icon: <IconBuilding size={15} /> },
    { key: 'documents', label: 'Bank & Docs', icon: <IconCreditCard size={15} /> },
  ];

  return (
    <div className="kp-page">
      {/* ── Banner ────────────────────────────────────────────────────── */}
      <div className="kp-banner">
        <div className="kp-banner-bg" />
        <div className="kp-banner-body">
          <div className="kp-banner-avatar">{initial}</div>
          <div className="kp-banner-info">
            <h1 className="kp-banner-name">{name}</h1>
            <div className="kp-banner-meta">
              {profile?.designationId?.name && (
                <span className="kp-banner-tag"><IconBriefcase size={12} />{profile.designationId.name}</span>
              )}
              {profile?.departmentId?.name && (
                <span className="kp-banner-tag"><IconBuilding size={12} />{profile.departmentId.name}</span>
              )}
              {profile?.locationId?.name && (
                <span className="kp-banner-tag"><IconMapPin size={12} />{profile.locationId.name}</span>
              )}
              {profile?.employeeCode && (
                <span className="kp-banner-tag"><IconId size={12} />{profile.employeeCode}</span>
              )}
            </div>
          </div>
          <button className="kp-edit-trigger" onClick={() => editing ? setEditing(false) : startEditing()}>
            {editing ? <><IconX size={14} /> Cancel</> : <><IconEdit size={14} /> Edit Profile</>}
          </button>
        </div>

        <div className="kp-quick-strip">
          <div className="kp-quick-item">
            <span className="kp-quick-val">{profile?.email ?? '—'}</span>
            <span className="kp-quick-lbl">Email</span>
          </div>
          <div className="kp-quick-sep" />
          <div className="kp-quick-item">
            <span className="kp-quick-val">{profile?.phone || '—'}</span>
            <span className="kp-quick-lbl">Phone</span>
          </div>
          <div className="kp-quick-sep" />
          <div className="kp-quick-item">
            <span className="kp-quick-val">{empTypeLabel(profile?.employmentType ?? '')}</span>
            <span className="kp-quick-lbl">Employment</span>
          </div>
          <div className="kp-quick-sep" />
          <div className="kp-quick-item">
            <span className="kp-quick-val">{fmtDate(profile?.dateOfJoining ?? null)}</span>
            <span className="kp-quick-lbl">Joined</span>
          </div>
          {profile?.dateOfJoining && (
            <>
              <div className="kp-quick-sep" />
              <div className="kp-quick-item">
                <span className="kp-quick-val">{tenure(profile.dateOfJoining)}</span>
                <span className="kp-quick-lbl">Tenure</span>
              </div>
            </>
          )}
        </div>
      </div>

      {error && <p className="kp-error">{error}</p>}

      {/* ── Tabs ──────────────────────────────────────────────────────── */}
      <div className="kp-tabs">
        {tabs.map((t) => (
          <button key={t.key} className={`kp-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {!profile && !error && <p className="kp-loading">Loading profile...</p>}

      {/* ── Personal tab ──────────────────────────────────────────────── */}
      {profile && tab === 'personal' && (
        <div className="kp-content">
          {editing ? (
            <div className="kp-card">
              <h2 className="kp-card-title">Edit Personal Details</h2>
              <div className="kp-edit-form">
                <div className="kp-form-row">
                  <label className="kp-form-group">
                    <span className="kp-form-lbl">Display Name</span>
                    <input className="kp-input" value={editName} onChange={(e) => setEditName(e.target.value)} />
                  </label>
                  <label className="kp-form-group">
                    <span className="kp-form-lbl">Phone Number</span>
                    <input className="kp-input" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="+91 98765 43210" />
                  </label>
                </div>
                <div className="kp-form-row">
                  <label className="kp-form-group">
                    <span className="kp-form-lbl">Date of Birth</span>
                    <input className="kp-input" type="date" value={editDob} onChange={(e) => setEditDob(e.target.value)} />
                  </label>
                  <label className="kp-form-group">
                    <span className="kp-form-lbl">Employee Code</span>
                    <input className="kp-input" value={editCode} onChange={(e) => setEditCode(e.target.value)} placeholder="EMP001" />
                  </label>
                </div>
                <div className="kp-form-row">
                  <label className="kp-form-group">
                    <span className="kp-form-lbl">Employment Type</span>
                    <select className="kp-input" value={editEmpType} onChange={(e) => setEditEmpType(e.target.value)}>
                      <option value="full-time">Full Time</option>
                      <option value="part-time">Part Time</option>
                      <option value="contract">Contract</option>
                      <option value="intern">Intern</option>
                      <option value="freelance">Freelance</option>
                    </select>
                  </label>
                </div>
                <div className="kp-form-row">
                  <label className="kp-form-group">
                    <span className="kp-form-lbl">Date of Joining</span>
                    <input className="kp-input" type="date" value={editJoining} onChange={(e) => setEditJoining(e.target.value)} />
                  </label>
                  <label className="kp-form-group">
                    <span className="kp-form-lbl">Probation End Date</span>
                    <input className="kp-input" type="date" value={editProbation} onChange={(e) => setEditProbation(e.target.value)} />
                  </label>
                </div>
                <div className="kp-form-actions">
                  <button className="kp-btn-primary" onClick={handleSave} disabled={saving}>
                    <IconCheck size={14} />{saving ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button className="kp-btn-secondary" onClick={() => setEditing(false)}>Cancel</button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="kp-card">
                <h2 className="kp-card-title">Basic Information</h2>
                <div className="kp-fields">
                  <InfoField icon={<IconUser size={16} />} label="Full Name" value={profile.displayName} />
                  <InfoField icon={<IconMail size={16} />} label="Email Address" value={profile.email} />
                  <InfoField icon={<IconPhone size={16} />} label="Phone Number" value={profile.phone} />
                  <InfoField icon={<IconCalendar size={16} />} label="Date of Birth" value={fmtDate(profile.dateOfBirth)} />
                  <InfoField icon={<IconGenderBigender size={16} />} label="Gender" value={profile.gender ? profile.gender.charAt(0).toUpperCase() + profile.gender.slice(1) : ''} />
                  <InfoField icon={<IconDroplet size={16} />} label="Blood Group" value={profile.bloodGroup} />
                  <InfoField icon={<IconHeart size={16} />} label="Marital Status" value={profile.maritalStatus ? profile.maritalStatus.charAt(0).toUpperCase() + profile.maritalStatus.slice(1) : ''} />
                  <InfoField icon={<IconFlag size={16} />} label="Nationality" value={profile.nationality} />
                  <InfoField icon={<IconId size={16} />} label="Employee Code" value={profile.employeeCode} />
                  <InfoField icon={<IconHome size={16} />} label="Address" value={profile.address} />
                </div>
              </div>

              <div className="kp-card">
                <h2 className="kp-card-title">Emergency Contact</h2>
                <div className="kp-fields">
                  <InfoField icon={<IconAlertTriangle size={16} />} label="Contact Name" value={profile.emergencyContactName} />
                  <InfoField icon={<IconPhone size={16} />} label="Contact Phone" value={profile.emergencyContactPhone} />
                  <InfoField icon={<IconUser size={16} />} label="Relation" value={profile.emergencyContactRelation} />
                </div>
              </div>

              <div className="kp-card">
                <h2 className="kp-card-title">Skills</h2>
                {profile.skills.length === 0 ? (
                  <p className="kp-empty">No skills added. Go to My Skills to add them.</p>
                ) : (
                  <div className="kp-chips">
                    {profile.skills.map((s) => (
                      <span key={s._id} className="kp-skill-chip"><IconStarFilled size={11} />{s.name}</span>
                    ))}
                  </div>
                )}
              </div>

              <div className="kp-card">
                <h2 className="kp-card-title">Connected Accounts</h2>
                {profile.providers.length === 0 ? (
                  <p className="kp-empty">No linked providers.</p>
                ) : (
                  <div className="kp-providers-list">
                    {profile.providers.map((p, i) => (
                      <div key={i} className="kp-provider-row">
                        <IconLink size={16} />
                        <span className="kp-provider-name">{p.provider}</span>
                        <span className="kp-provider-status">Connected</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Job tab ───────────────────────────────────────────────────── */}
      {profile && tab === 'job' && (
        <div className="kp-content">
          {editing ? (
            <div className="kp-card">
              <h2 className="kp-card-title">Edit Job Details</h2>
              <div className="kp-edit-form">
                <div className="kp-form-row">
                  <label className="kp-form-group">
                    <span className="kp-form-lbl">Employment Type</span>
                    <select className="kp-input" value={editEmpType} onChange={(e) => setEditEmpType(e.target.value)}>
                      <option value="full-time">Full Time</option>
                      <option value="part-time">Part Time</option>
                      <option value="contract">Contract</option>
                      <option value="intern">Intern</option>
                      <option value="freelance">Freelance</option>
                    </select>
                  </label>
                  <FormSelect label="Shift" value={editShift} options={shifts} onChange={setEditShift} />
                </div>
                <div className="kp-form-row">
                  <label className="kp-form-group">
                    <span className="kp-form-lbl">Date of Joining</span>
                    <input className="kp-input" type="date" value={editJoining} onChange={(e) => setEditJoining(e.target.value)} />
                  </label>
                  <label className="kp-form-group">
                    <span className="kp-form-lbl">Probation End Date</span>
                    <input className="kp-input" type="date" value={editProbation} onChange={(e) => setEditProbation(e.target.value)} />
                  </label>
                </div>
                <div className="kp-form-actions">
                  <button className="kp-btn-primary" onClick={handleSave} disabled={saving}>
                    <IconCheck size={14} />{saving ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button className="kp-btn-secondary" onClick={() => setEditing(false)}>Cancel</button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="kp-card">
                <h2 className="kp-card-title">Employment Details</h2>
                <div className="kp-fields">
                  <InfoField icon={<IconBriefcase size={16} />} label="Employment Type" value={empTypeLabel(profile.employmentType)} />
                  <InfoField icon={<IconCalendar size={16} />} label="Date of Joining" value={fmtDate(profile.dateOfJoining)} />
                  <InfoField icon={<IconCalendar size={16} />} label="Probation End Date" value={fmtDate(profile.probationEndDate)} />
                  <InfoField icon={<IconShield size={16} />} label="Roles" value={profile.roles.map((r) => r.replace(/_/g, ' ')).join(', ')} />
                  <InfoField icon={<IconCalendar size={16} />} label="Account Created" value={fmtDate(profile.createdAt)} />
                </div>
              </div>
              <div className="kp-card">
                <h2 className="kp-card-title">Shift Details</h2>
                <div className="kp-fields">
                  <InfoField icon={<IconClock size={16} />} label="Shift Name" value={profile.shiftId?.name || ''} />
                  <InfoField icon={<IconClock size={16} />} label="Shift Timing" value={
                    profile.shiftId?.startTime ? `${profile.shiftId.startTime} – ${profile.shiftId.endTime}` : ''
                  } />
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Team & Org tab ────────────────────────────────────────────── */}
      {profile && tab === 'team' && (
        <div className="kp-content">
          {editing ? (
            <div className="kp-card">
              <h2 className="kp-card-title">Edit Organisation Details</h2>
              <div className="kp-edit-form">
                <div className="kp-form-row">
                  <FormSelect label="Department" value={editDept} options={departments} onChange={setEditDept} />
                  <FormSelect label="Designation" value={editDesig} options={designations} onChange={setEditDesig} />
                </div>
                <div className="kp-form-row">
                  <FormSelect label="Location" value={editLocation} options={locations} onChange={setEditLocation} />
                  <FormSelect label="Legal Entity" value={editEntity} options={entities} onChange={setEditEntity} />
                </div>
                <div className="kp-form-row">
                  <FormSelect label="Business Unit" value={editBU} options={businessUnits} onChange={setEditBU} />
                  <FormSelect label="Shift" value={editShift} options={shifts} onChange={setEditShift} />
                </div>
                <div className="kp-form-actions">
                  <button className="kp-btn-primary" onClick={handleSave} disabled={saving}>
                    <IconCheck size={14} />{saving ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button className="kp-btn-secondary" onClick={() => setEditing(false)}>Cancel</button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="kp-card">
                <h2 className="kp-card-title">Organisation</h2>
                <div className="kp-fields">
                  <InfoField icon={<IconBuilding size={16} />} label="Legal Entity" value={profile.legalEntityId?.name || ''} />
                  <InfoField icon={<IconBuilding size={16} />} label="Business Unit" value={profile.businessUnitId?.name || ''} />
                  <InfoField icon={<IconBuilding size={16} />} label="Department" value={profile.departmentId?.name || ''} />
                  <InfoField icon={<IconBriefcase size={16} />} label="Designation" value={profile.designationId?.name || ''} />
                  <InfoField icon={<IconMapPin size={16} />} label="Location" value={profile.locationId?.name || ''} />
                </div>
              </div>
              <div className="kp-card">
                <h2 className="kp-card-title">Reporting</h2>
                {profile.reportingManagerId ? (
                  <div className="kp-manager-card">
                    <div className="kp-manager-avatar">
                      {(profile.reportingManagerId.displayName[0] ?? '?').toUpperCase()}
                    </div>
                    <div className="kp-manager-info">
                      <span className="kp-manager-name">{profile.reportingManagerId.displayName}</span>
                      <span className="kp-manager-email">{profile.reportingManagerId.email}</span>
                    </div>
                    <span className="kp-manager-label">Reporting Manager</span>
                  </div>
                ) : (
                  <p className="kp-empty">No reporting manager assigned.</p>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Bank & Docs tab ──────────────────────────────────────────── */}
      {profile && tab === 'documents' && (
        <div className="kp-content">
          <div className="kp-card">
            <h2 className="kp-card-title">Identity Documents</h2>
            <div className="kp-fields">
              <InfoField icon={<IconCreditCard size={16} />} label="PAN Number" value={profile.pan} />
              <InfoField icon={<IconId size={16} />} label="Aadhaar Number" value={profile.aadhaar} />
            </div>
          </div>
          <div className="kp-card">
            <h2 className="kp-card-title">Bank Details</h2>
            <div className="kp-fields">
              <InfoField icon={<IconBuildingBank size={16} />} label="Bank Name" value={profile.bankName} />
              <InfoField icon={<IconCreditCard size={16} />} label="Account Number" value={profile.bankAccount} />
              <InfoField icon={<IconId size={16} />} label="IFSC Code" value={profile.ifsc} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
