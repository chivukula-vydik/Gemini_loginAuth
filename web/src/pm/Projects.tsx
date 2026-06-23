import { useEffect, useState } from 'react';
import {
  listProjects, createProject, getProject, createTask, setTaskAssignees,
  listSkills, listDirectory, updateProjectMembers, setProjectOwner, deleteProject,
  decideEstimate, updateTask, decideExtension, updateProjectRequiredSkills, updateProjectDescription,
  Project, TaskDetail, Person, Skill, ProjectDetailShape,
} from './pmApi';
import { StaffMembers } from './StaffMembers';
import { ProgressRing } from './ProgressRing';
import { StatusBadge } from './StatusBadge';
import { personName, initials } from './personName';
import { dueUrgency, dueLabel } from '../timesheet/due';
import { todayISO } from '../timesheet/time';
import { ProjectTasks } from './ProjectTasks';

export function Projects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [clientName, setClientName] = useState('');
  const [billingType, setBillingType] = useState<'billable' | 'non-billable'>('non-billable');
  const [billingRate, setBillingRate] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [error, setError] = useState('');
  const today = todayISO();

  function reload() { listProjects().then(setProjects).catch((e) => setError(e.message)); }
  useEffect(() => { reload(); }, []);

  async function add() {
    if (!name.trim()) return;
    if (!clientName.trim()) { setError('Client name is required'); return; }
    setError('');
    try {
      await createProject({
        name: name.trim(), description: description.trim(),
        clientName: clientName.trim(), billingType,
        billingRate: billingType === 'billable' && billingRate ? Number(billingRate) : null,
        currency: billingType === 'billable' ? currency : null,
      });
      setName(''); setDescription(''); setClientName(''); setBillingType('non-billable'); setBillingRate(''); setCurrency('USD');
      reload();
    } catch (e) { setError((e as Error).message); }
  }

  if (openId) return <ProjectDetail id={openId} onBack={() => { setOpenId(null); reload(); }} />;

  return (
    <div className="ts-page">
      <header className="ts-header">
        <div>
          <h1 className="ts-h1">Projects</h1>
          <p className="ts-sub">{projects.length} {projects.length === 1 ? 'project' : 'projects'}</p>
        </div>
        <div className="ts-nav-left">
          <input className="input" placeholder="New project name" value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
          <input className="input" placeholder="Description (optional)" value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
          <input className="input" placeholder="Client name *" value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
          <select className="input pm-select" value={billingType}
            onChange={(e) => setBillingType(e.target.value as 'billable' | 'non-billable')}>
            <option value="non-billable">Non-Billable</option>
            <option value="billable">Billable</option>
          </select>
          {billingType === 'billable' && (
            <>
              <input className="input" type="number" placeholder="Billing rate" value={billingRate}
                onChange={(e) => setBillingRate(e.target.value)} style={{ width: 100 }} />
              <select className="input pm-select" value={currency} onChange={(e) => setCurrency(e.target.value)} style={{ width: 80 }}>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
                <option value="INR">INR</option>
              </select>
            </>
          )}
          <button className="btn btn-auto btn-primary" onClick={add}>Create</button>
        </div>
      </header>
      <div className="ts-tiles">
        <div className="ts-tile ts-tile-accent">
          <span className="ts-tile-label">Total projects</span>
          <span className="ts-tile-value">{projects.length}</span>
        </div>
        <div className="ts-tile stat-logged">
          <span className="ts-tile-label">Active</span>
          <span className="ts-tile-value">{projects.filter((p) => p.status !== 'done' && p.status !== 'completed' && p.status !== 'archived').length}</span>
        </div>
        <div className="ts-tile stat-done">
          <span className="ts-tile-label">Completed</span>
          <span className="ts-tile-value">{projects.filter((p) => p.status === 'done' || p.status === 'completed').length}</span>
        </div>
        <div className="ts-tile stat-est">
          <span className="ts-tile-label">At risk</span>
          <span className="ts-tile-value">{projects.filter((p) => dueUrgency(p.targetDate, today, p.status) === 'overdue').length}</span>
        </div>
      </div>

      {error && <p className="ts-error">{error}</p>}
      <div className="ts-card">
        {projects.length === 0 ? (
          <div className="empty-state">
            <span className="empty-state-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
            </span>
            <span className="empty-state-title">No projects yet</span>
            <span className="empty-state-text">Create your first project above to start planning tasks and tracking progress.</span>
          </div>
        ) : (
        <table className="ts-table">
          <thead><tr><th className="ts-task">Project</th><th className="col-left">Client</th><th className="col-left">Progress</th><th className="col-left">Tasks</th><th className="col-left">Status</th></tr></thead>
          <tbody>
            {projects.map((p) => {
              const pct = p.progress ?? 0;
              const barClass = pct >= 100 ? 'done' : pct > 0 ? 'mid' : 'low';
              return (
              <tr
                key={p._id}
                className="project-row"
                role="button"
                tabIndex={0}
                onClick={() => setOpenId(p._id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setOpenId(p._id);
                  }
                }}
              >
                <td className="ts-task">
                  {p.name}
                  {(() => {
                    if (p.status === 'archived') return <span className="due-pill">archived</span>;
                    const urgency = dueUrgency(p.targetDate, today, p.status);
                    if (!urgency) return null;
                    return (
                      <span className={`due-pill ${urgency}`}>
                        {dueLabel(p.targetDate!, today)}
                      </span>
                    );
                  })()}
                </td>
                <td className="col-left ts-sub">{p.clientName || '—'}</td>
                <td className="col-left">
                  <div className="prog">
                    <div className="prog-track"><div className={`prog-fill ${barClass}`} style={{ width: `${pct}%` }} /></div>
                    <span className="prog-pct">{pct}%</span>
                  </div>
                </td>
                <td className="col-left ts-sub">{p.doneCount ?? 0}/{p.taskCount ?? 0}</td>
                <td className="col-left"><StatusBadge status={p.status} /></td>
              </tr>
              );
            })}
          </tbody>
        </table>
        )}
      </div>
    </div>
  );
}

function ProjectDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const [project, setProject] = useState<ProjectDetailShape | null>(null);
  const [tasks, setTasks] = useState<TaskDetail[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [directory, setDirectory] = useState<Person[]>([]);
  const [title, setTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [assignees, setAssignees] = useState<Set<string>>(new Set());
  const [startDate, setStartDate] = useState('');
  const [reqSkills, setReqSkills] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [staffing, setStaffing] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState('');

  function reload() {
    getProject(id).then(({ project, tasks }) => { setProject(project); setTasks(tasks); })
      .catch((e) => setError(e.message));
  }
  useEffect(() => {
    reload();
    listSkills().then(setSkills).catch(() => {});
    listDirectory().then(setDirectory).catch(() => {});
  }, [id]);


  async function addMemberById(uid: string) {
    if (!project) return;
    await updateProjectMembers(id, [...project.members.map((m) => m._id), uid]);
    reload();
  }

  async function toggleRequiredSkill(sid: string) {
    if (!project) return;
    const cur = project.requiredSkills.map((s) => s._id);
    const next = cur.includes(sid) ? cur.filter((x) => x !== sid) : [...cur, sid];
    setError('');
    try { await updateProjectRequiredSkills(id, next); reload(); }
    catch (e) { setError((e as Error).message); }
  }

  async function removeMember(mid: string) {
    if (!project) return;
    try {
      await updateProjectMembers(id, project.members.map((m) => m._id).filter((x) => x !== mid));
      reload();
    } catch (e) { setError((e as Error).message); }
  }

  async function add() {
    if (!title.trim()) return;
    setError('');
    try {
      await createTask(id, {
        title: title.trim(),
        description: taskDescription.trim(),
        assignees: [...assignees],
        startDate: startDate || null,
        requiredSkills: [...reqSkills],
      });
      setNotice('');
      setTitle(''); setTaskDescription(''); setAssignees(new Set()); setStartDate(''); setReqSkills(new Set());
      reload();
    } catch (e) { setError((e as Error).message); }
  }

  async function decide(taskId: string, decision: 'approve' | 'reject') {
    setError('');
    try { await decideEstimate(taskId, decision); reload(); }
    catch (e) { setError((e as Error).message); }
  }

  async function saveTaskDescription(taskId: string, description: string) {
    setError('');
    try { await updateTask(taskId, { description }); reload(); }
    catch (e) { setError((e as Error).message); }
  }

  function toggleSkill(sid: string) {
    setReqSkills((prev) => {
      const next = new Set(prev);
      if (next.has(sid)) next.delete(sid); else next.add(sid);
      return next;
    });
  }

  async function saveDue(taskId: string, dueDate: string | null) {
    setError('');
    try { await updateTask(taskId, { dueDate }); reload(); }
    catch (e) { setError((e as Error).message); }
  }

  async function decideExt(taskId: string, decision: 'approve' | 'reject') {
    setError('');
    try { await decideExtension(taskId, decision); reload(); }
    catch (e) { setError((e as Error).message); }
  }

  async function saveAssignees(taskId: string, next: { user: string; sharePct: number }[]) {
    setError('');
    try { await setTaskAssignees(taskId, next); reload(); }
    catch (e) { setError((e as Error).message); }
  }

  async function reassignOwner(ownerId: string) {
    if (!ownerId) return;
    setError('');
    try { await setProjectOwner(id, ownerId); reload(); }
    catch (e) { setError((e as Error).message); }
  }

  async function saveDescription() {
    if (!project) return;
    setError('');
    try {
      await updateProjectDescription(id, descriptionDraft.trim());
      setEditingDescription(false);
      reload();
    } catch (e) { setError((e as Error).message); }
  }

  async function removeProject() {
    if (!project) return;
    if (!window.confirm(`Delete project "${project.name}" and all its tasks? This cannot be undone.`)) return;
    setError('');
    try { await deleteProject(id); onBack(); }
    catch (e) { setError((e as Error).message); }
  }

  if (!project) return (
    <div className="ts-page">
      <header className="ts-header"><div className="skeleton skeleton-line sk-40" style={{ height: 26 }} /></header>
      <div className="ts-card skeleton-card">
        <div className="skeleton skeleton-line sk-60" />
        <div className="skeleton skeleton-line sk-80" />
        <div className="skeleton skeleton-line sk-40" />
      </div>
      <div className="ts-card">
        {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton skeleton-row" />)}
      </div>
    </div>
  );

  if (staffing) return (
    <StaffMembers
      projectId={id}
      projectName={project.name}
      onAdd={async (uid) => { await addMemberById(uid); setStaffing(false); }}
      onBack={() => setStaffing(false)}
    />
  );

  const ownerCandidates = directory.filter((d) => (d.role === 'pm' || d.role === 'admin') && d._id !== project.ownerPm._id);

  const overall = tasks.length
    ? Math.round(tasks.reduce((s, t) => s + (t.percentComplete ?? 0), 0) / tasks.length)
    : 0;
  const doneCount = tasks.filter((t) => t.status === 'done').length;
  const estHours = tasks.reduce((s, t) => s + (t.estimatedHours ?? 0), 0);
  const actualHours = tasks.reduce((s, t) => s + (t.actualMinutes ?? 0), 0) / 60;

  return (
    <div className="ts-page">
      <header className="ts-header">
        <div>
          <button className="link-btn" onClick={onBack}>← Projects</button>
          <h1 className="ts-h1">{project.name}</h1>
        </div>
      </header>
      {error && <p className="ts-error">{error}</p>}
      {notice && <p className="ts-sub">{notice}</p>}

      <div className="ts-card card-section">
        <div className="card-title">Description</div>
        {editingDescription ? (
          <>
            <textarea className="input" rows={3} value={descriptionDraft}
              placeholder="What is this project about?"
              onChange={(e) => setDescriptionDraft(e.target.value)} />
            <div className="ts-nav-left" style={{ marginTop: 8 }}>
              <button className="btn btn-auto btn-primary" onClick={saveDescription}>Save</button>
              <button className="btn btn-auto" onClick={() => setEditingDescription(false)}>Cancel</button>
            </div>
          </>
        ) : (
          <>
            <p className="ts-sub">{project.description || 'No description yet.'}</p>
            <div className="ts-sub" style={{ marginTop: 8 }}>
              <strong>Client:</strong> {project.clientName || 'Unassigned'}
              {' · '}
              <span className={`status-badge ${project.billingType === 'billable' ? 'status-done' : 'status-archived'}`}>
                <span className="status-dot" aria-hidden="true" />
                {project.billingType === 'billable' ? 'Billable' : 'Non-Billable'}
              </span>
              {project.billingType === 'billable' && project.billingRate != null && (
                <span> · {project.currency ?? 'USD'} {project.billingRate}/hr</span>
              )}
            </div>
            <button className="btn btn-auto" onClick={() => { setDescriptionDraft(project.description || ''); setEditingDescription(true); }}>
              Edit description
            </button>
          </>
        )}
      </div>

      <div className="ts-card overview">
        <div className="overview-ring">
          <ProgressRing value={overall} />
        </div>
        <div className="overview-stats">
          <div className="stat stat-tasks">
            <span className="stat-label">Tasks</span>
            <span className="stat-value">{tasks.length}</span>
          </div>
          <div className="stat stat-done">
            <span className="stat-label">Completed</span>
            <span className="stat-value">{doneCount}<span className="stat-sub">/ {tasks.length}</span></span>
          </div>
          <div className="stat stat-est">
            <span className="stat-label">Estimated</span>
            <span className="stat-value">{estHours}<span className="stat-sub">h</span></span>
          </div>
          <div className="stat stat-logged">
            <span className="stat-label">Logged</span>
            <span className="stat-value">{actualHours.toFixed(1)}<span className="stat-sub">h</span></span>
          </div>
        </div>
      </div>

      <div className="ts-card pm-team">
        <div className="pm-team-col pm-team-owner">
          <div className="card-title">
            <span className="card-icon ic-owner">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
              </svg>
            </span>
            In charge
          </div>
          <div className="pm-row">
            <span className="person-pill">
              <span className="person-avatar">{initials(project.ownerPm)}</span>
              {personName(project.ownerPm)}
            </span>
          </div>
          <div className="pm-row-actions" style={{ marginTop: 10 }}>
            <select className="input pm-select" value="" onChange={(e) => reassignOwner(e.target.value)}>
              <option value="">Reassign in charge…</option>
              {ownerCandidates.map((d) => <option key={d._id} value={d._id}>{personName(d)}</option>)}
            </select>
            <button className="btn btn-auto btn-danger-ghost" onClick={removeProject}>
              Delete
            </button>
          </div>
        </div>

        <div className="pm-team-col pm-team-members">
          <div className="card-title">
            <span className="card-icon ic-members">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </span>
            Members
            <span className="pm-count">{project.members.length}</span>
          </div>
          <div className="member-chips">
            {project.members.length === 0 && <span className="ts-sub">No members yet.</span>}
            {project.members.map((m) => (
              <span key={m._id} className="member-chip">
                <span className="person-avatar">{initials(m)}</span>
                {personName(m)}
                <button className="member-chip-x" aria-label={`Remove ${personName(m)}`} onClick={() => removeMember(m._id)}>×</button>
              </span>
            ))}
          </div>
          <button className="btn btn-auto btn-primary" type="button" onClick={() => setStaffing(true)}>
            Staff members
          </button>
        </div>
      </div>

      <div className="ts-card card-section">
        <div className="card-title">Required skills</div>
        <div className="toggle-group">
          {skills.filter((s) => s.active).length === 0 && <span className="ts-sub">No skills defined</span>}
          {skills.filter((s) => s.active).map((s) => {
            const on = project.requiredSkills.some((r) => r._id === s._id);
            return (
              <button key={s._id} type="button"
                className={`toggle-chip${on ? ' on' : ''}`}
                aria-pressed={on}
                onClick={() => toggleRequiredSkill(s._id)}>{s.name}</button>
            );
          })}
        </div>
        <span className="field-hint">Used to flag skill fit when staffing.</span>
      </div>

      <div className="ts-card card-section">
        <div className="card-title">
          <span className="card-icon ic-task">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </span>
          Add task
        </div>
        <div className="ts-nav-left" style={{ flexWrap: 'wrap', gap: 8 }}>
          <input className="input" placeholder="Task title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <input className="input" placeholder="Description (optional)" value={taskDescription}
            onChange={(e) => setTaskDescription(e.target.value)} />
          <input className="input pm-select" type="date" value={startDate}
            onChange={(e) => setStartDate(e.target.value)} title="Start date" />
          <button className="btn btn-auto btn-primary" onClick={add}>Add task</button>
        </div>

        <span className="field-hint">Assignees</span>
        <div className="toggle-group">
          {project.members.length === 0 && <span className="ts-sub">Add members to assign</span>}
          {project.members.map((m) => (
            <button key={m._id} type="button"
              className={`toggle-chip${assignees.has(m._id) ? ' on' : ''}`}
              aria-pressed={assignees.has(m._id)}
              onClick={() => setAssignees((prev) => {
                const next = new Set(prev);
                if (next.has(m._id)) next.delete(m._id); else next.add(m._id);
                return next;
              })}>{personName(m)}</button>
          ))}
        </div>

        <span className="field-hint">Required skills</span>
        <div className="toggle-group">
          {skills.length === 0 && <span className="ts-sub">No skills defined</span>}
          {skills.map((s) => (
            <button key={s._id} type="button"
              className={`toggle-chip${reqSkills.has(s._id) ? ' on' : ''}`}
              aria-pressed={reqSkills.has(s._id)}
              onClick={() => toggleSkill(s._id)}>{s.name}</button>
          ))}
        </div>
      </div>

      <ProjectTasks
        projectId={id}
        members={project.members}
        tasks={tasks}
        onReload={reload}
        onError={setError}
        onDecideEstimate={decide}
        onSaveDue={saveDue}
        onDecideExt={decideExt}
        onSaveAssignees={saveAssignees}
        onSaveDescription={saveTaskDescription}
      />
    </div>
  );
}
