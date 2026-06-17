import { useEffect, useState } from 'react';
import {
  listProjects, createProject, getProject, createTask,
  listSkills, listDirectory, updateProjectMembers, setProjectOwner, deleteProject,
  decideEstimate,
  Project, TaskDetail, Person, Skill, ProjectDetailShape,
} from './pmApi';

export function Projects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  function reload() { listProjects().then(setProjects).catch((e) => setError(e.message)); }
  useEffect(() => { reload(); }, []);

  async function add() {
    if (!name.trim()) return;
    setError('');
    try { await createProject({ name: name.trim() }); setName(''); reload(); }
    catch (e) { setError((e as Error).message); }
  }

  if (openId) return <ProjectDetail id={openId} onBack={() => { setOpenId(null); reload(); }} />;

  return (
    <div className="ts-page">
      <header className="ts-header"><h1 className="ts-h1">Projects</h1></header>
      {error && <p className="ts-error">{error}</p>}
      <div className="ts-nav-left" style={{ marginBottom: 16 }}>
        <input className="input" placeholder="New project name" value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add(); }} />
        <button className="btn btn-primary" onClick={add}>Create</button>
      </div>
      <div className="ts-card">
        <table className="ts-table">
          <thead><tr><th className="ts-task">Project</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {projects.length === 0 && <tr><td colSpan={3} className="ts-empty">No projects yet.</td></tr>}
            {projects.map((p) => (
              <tr key={p._id}>
                <td className="ts-task">{p.name}</td>
                <td>{p.status}</td>
                <td><button className="link-btn" onClick={() => setOpenId(p._id)}>Open</button></td>
              </tr>
            ))}
          </tbody>
        </table>
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
  const [assignee, setAssignee] = useState('');
  const [startDate, setStartDate] = useState('');
  const [reqSkills, setReqSkills] = useState<Set<string>>(new Set());
  const [newMember, setNewMember] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  function reload() {
    getProject(id).then(({ project, tasks }) => { setProject(project); setTasks(tasks); })
      .catch((e) => setError(e.message));
  }
  useEffect(() => {
    reload();
    listSkills().then(setSkills).catch(() => {});
    listDirectory().then(setDirectory).catch(() => {});
  }, [id]);

  async function addMember() {
    if (!newMember || !project) return;
    setError('');
    try {
      await updateProjectMembers(id, [...project.members.map((m) => m._id), newMember]);
      setNewMember('');
      reload();
    } catch (e) { setError((e as Error).message); }
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
      const created = await createTask(id, {
        title: title.trim(),
        assignee: assignee || null,
        startDate: startDate || null,
        requiredSkills: [...reqSkills],
      });
      setNotice(created.offered
        ? 'That employee already has an active task — sent them an offer to accept.'
        : '');
      setTitle(''); setAssignee(''); setStartDate(''); setReqSkills(new Set());
      reload();
    } catch (e) { setError((e as Error).message); }
  }

  async function decide(taskId: string, decision: 'approve' | 'reject') {
    setError('');
    try { await decideEstimate(taskId, decision); reload(); }
    catch (e) { setError((e as Error).message); }
  }

  function toggleSkill(sid: string) {
    setReqSkills((prev) => {
      const next = new Set(prev);
      if (next.has(sid)) next.delete(sid); else next.add(sid);
      return next;
    });
  }

  async function reassignOwner(ownerId: string) {
    if (!ownerId) return;
    setError('');
    try { await setProjectOwner(id, ownerId); reload(); }
    catch (e) { setError((e as Error).message); }
  }

  async function removeProject() {
    if (!project) return;
    if (!window.confirm(`Delete project "${project.name}" and all its tasks? This cannot be undone.`)) return;
    setError('');
    try { await deleteProject(id); onBack(); }
    catch (e) { setError((e as Error).message); }
  }

  if (!project) return <div className="ts-page"><p className="center-loading">Loading…</p></div>;

  const nonMembers = directory.filter((d) => !project.members.some((m) => m._id === d._id));
  const ownerCandidates = directory.filter((d) => (d.role === 'pm' || d.role === 'admin') && d._id !== project.ownerPm._id);

  return (
    <div className="ts-page">
      <header className="ts-header">
        <button className="link-btn" onClick={onBack}>← Projects</button>
        <h1 className="ts-h1">{project.name}</h1>
      </header>
      {error && <p className="ts-error">{error}</p>}
      {notice && <p className="ts-sub">{notice}</p>}

      <div className="ts-card" style={{ padding: 14, marginBottom: 16 }}>
        <strong>Owner</strong>
        <div className="ts-nav-left" style={{ marginTop: 8 }}>
          <span className="ts-sub">{project.ownerPm.displayName || project.ownerPm.email}</span>
          <select className="input" value="" onChange={(e) => reassignOwner(e.target.value)}>
            <option value="">Reassign owner…</option>
            {ownerCandidates.map((d) => <option key={d._id} value={d._id}>{d.displayName || d.email}</option>)}
          </select>
          <button className="btn btn-ghost" style={{ width: 'auto', color: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={removeProject}>
            Delete project
          </button>
        </div>
      </div>

      <div className="ts-card" style={{ padding: 14, marginBottom: 16 }}>
        <strong>Members</strong>
        <div className="chips" style={{ justifyContent: 'flex-start', margin: '8px 0' }}>
          {project.members.length === 0 && <span className="ts-sub">No members yet.</span>}
          {project.members.map((m) => (
            <span key={m._id} className="chip">
              {m.displayName || m.email}
              <button className="link-btn" style={{ marginLeft: 6 }} onClick={() => removeMember(m._id)}>×</button>
            </span>
          ))}
        </div>
        <div className="ts-nav-left">
          <select className="input" value={newMember} onChange={(e) => setNewMember(e.target.value)}>
            <option value="">Add member…</option>
            {nonMembers.map((d) => <option key={d._id} value={d._id}>{d.displayName || d.email}</option>)}
          </select>
          <button className="btn btn-primary" onClick={addMember}>Add</button>
        </div>
      </div>

      <div className="ts-card" style={{ padding: 14, marginBottom: 16 }}>
        <div className="ts-nav-left" style={{ flexWrap: 'wrap', gap: 8 }}>
          <input className="input" placeholder="Task title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <select className="input" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">Unassigned</option>
            {project.members.map((m) => <option key={m._id} value={m._id}>{m.displayName || m.email}</option>)}
          </select>
          <input className="input" type="date" value={startDate}
            onChange={(e) => setStartDate(e.target.value)} title="Start date" />
          <button className="btn btn-primary" onClick={add}>Add task</button>
        </div>
        <div className="chips" style={{ justifyContent: 'flex-start', marginTop: 10 }}>
          {skills.map((s) => (
            <button key={s._id} type="button" className="chip"
              style={{ cursor: 'pointer', opacity: reqSkills.has(s._id) ? 1 : 0.4 }}
              onClick={() => toggleSkill(s._id)}>{s.name}</button>
          ))}
        </div>
      </div>

      <div className="ts-card">
        <table className="ts-table">
          <thead><tr><th className="ts-task">Task</th><th>Assignee</th><th>Planned</th><th>Actual</th><th>%</th><th>Status</th></tr></thead>
          <tbody>
            {tasks.length === 0 && <tr><td colSpan={6} className="ts-empty">No tasks yet.</td></tr>}
            {tasks.map((t) => (
              <tr key={t._id}>
                <td className="ts-task">{t.title}</td>
                <td>{t.assignee ? (t.assignee.displayName || t.assignee.email) : 'Unassigned'}</td>
                <td>
                  {t.estimateStatus === 'proposed' ? (
                    <span className="ts-nav-left">
                      {t.proposedValue ?? 0} {t.proposedUnit ?? 'hours'}?
                      <button className="link-btn" onClick={() => decide(t._id, 'approve')}>approve</button>
                      <button className="link-btn" style={{ color: 'var(--danger)' }} onClick={() => decide(t._id, 'reject')}>reject</button>
                    </span>
                  ) : t.estimateStatus === 'approved' ? `${t.estimateValue || t.estimatedHours} ${t.estimateUnit ?? 'hours'}`
                    : <span className="ts-sub">{t.estimateStatus === 'rejected' ? 'rejected' : 'no estimate'}</span>}
                </td>
                <td>{((t.actualMinutes ?? 0) / 60).toFixed(1)}h</td>
                <td>{t.percentComplete ?? 0}%</td>
                <td>{t.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
