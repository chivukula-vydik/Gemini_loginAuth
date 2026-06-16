import { useEffect, useState } from 'react';
import {
  listProjects, createProject, getProject, createTask,
  listSkills, Project, Task, Skill,
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
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [title, setTitle] = useState('');
  const [estimate, setEstimate] = useState('');
  const [assignee, setAssignee] = useState('');
  const [reqSkills, setReqSkills] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');

  function reload() {
    getProject(id).then(({ project, tasks }) => { setProject(project); setTasks(tasks); })
      .catch((e) => setError(e.message));
  }
  useEffect(() => { reload(); listSkills().then(setSkills).catch(() => {}); }, [id]);

  async function add() {
    if (!title.trim()) return;
    setError('');
    try {
      await createTask(id, {
        title: title.trim(),
        estimatedHours: Number(estimate) || 0,
        assignee: assignee || null,
        requiredSkills: [...reqSkills],
      });
      setTitle(''); setEstimate(''); setAssignee(''); setReqSkills(new Set());
      reload();
    } catch (e) { setError((e as Error).message); }
  }

  function toggleSkill(sid: string) {
    setReqSkills((prev) => {
      const next = new Set(prev);
      if (next.has(sid)) next.delete(sid); else next.add(sid);
      return next;
    });
  }

  if (!project) return <div className="ts-page"><p className="center-loading">Loading…</p></div>;

  return (
    <div className="ts-page">
      <header className="ts-header">
        <button className="link-btn" onClick={onBack}>← Projects</button>
        <h1 className="ts-h1">{project.name}</h1>
      </header>
      {error && <p className="ts-error">{error}</p>}

      <div className="ts-card" style={{ padding: 14, marginBottom: 16 }}>
        <div className="ts-nav-left" style={{ flexWrap: 'wrap', gap: 8 }}>
          <input className="input" placeholder="Task title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <input className="input" style={{ width: 110 }} placeholder="Est. hrs" value={estimate} onChange={(e) => setEstimate(e.target.value)} />
          <select className="input" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">Unassigned</option>
            {project.members.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
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
          <thead><tr><th className="ts-task">Task</th><th>Est. hrs</th><th>Assignee</th><th>Status</th></tr></thead>
          <tbody>
            {tasks.length === 0 && <tr><td colSpan={4} className="ts-empty">No tasks yet.</td></tr>}
            {tasks.map((t) => (
              <tr key={t._id}>
                <td className="ts-task">{t.title}</td>
                <td>{t.estimatedHours}</td>
                <td>{t.assignee || 'Unassigned'}</td>
                <td>{t.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
