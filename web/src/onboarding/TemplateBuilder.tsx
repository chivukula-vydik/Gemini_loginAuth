import { useState, useEffect } from 'react';
import { authed } from '../fetchHelper';
import './TemplateBuilder.css';

interface TemplateTask { key: string; title: string; ownerRole: string; offsetDays: number; category: string; mandatory: boolean; dependsOn: string[]; }
interface Template { _id: string; name: string; tasks: TemplateTask[]; }

const ROLES = ['hr', 'it', 'manager', 'finance', 'candidate', 'admin'];
const CATEGORIES = ['document', 'asset', 'access', 'training', 'admin'];

const emptyTask = (): TemplateTask => ({ key: '', title: '', ownerRole: 'hr', offsetDays: 0, category: 'admin', mandatory: true, dependsOn: [] });

export function TemplateBuilder() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const [name, setName] = useState('');
  const [tasks, setTasks] = useState<TemplateTask[]>([]);

  useEffect(() => {
    authed('/onboarding/templates').then(d => { setTemplates(d); setLoaded(true); });
  }, []);

  function startEdit(t: Template) {
    setEditing(t);
    setName(t.name);
    setTasks([...t.tasks]);
  }

  function startNew() {
    setEditing({ _id: '', name: '', tasks: [] } as Template);
    setName('');
    setTasks([emptyTask()]);
  }

  function updateTask(idx: number, field: string, value: unknown) {
    setTasks(prev => prev.map((t, i) => i === idx ? { ...t, [field]: value } : t));
  }

  function removeTask(idx: number) {
    setTasks(prev => prev.filter((_, i) => i !== idx));
  }

  async function save() {
    const body = { name, tasks };
    if (editing?._id) {
      const updated = await authed(`/onboarding/templates/${editing._id}`, 'PUT', body);
      setTemplates(prev => prev.map(t => t._id === updated._id ? updated : t));
    } else {
      const created = await authed('/onboarding/templates', 'POST', body);
      setTemplates(prev => [created, ...prev]);
    }
    setEditing(null);
  }

  if (!loaded) return <div className="tb-page"><div className="tb-empty">Loading...</div></div>;

  if (editing) {
    return (
      <div className="tb-page">
        <div className="tb-title">
          <span>{editing._id ? 'Edit Template' : 'New Template'}</span>
        </div>
        <div className="tb-editor">
          <div style={{ marginBottom: 14 }}>
            <label className="ob-form-label">Template Name</label>
            <input className="se-input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Engineering FTE Onboarding" />
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8 }}>Tasks</div>
          <div className="tb-task-row" style={{ fontWeight: 700, fontSize: 11, color: 'var(--muted)' }}>
            <span>Key / Title</span><span>Owner / Category</span><span>Offset</span><span>Required</span><span></span><span></span>
          </div>
          {tasks.map((t, i) => (
            <div key={i} className="tb-task-row">
              <div>
                <input className="se-input" placeholder="key" value={t.key} onChange={e => updateTask(i, 'key', e.target.value)} style={{ marginBottom: 4 }} />
                <input className="se-input" placeholder="title" value={t.title} onChange={e => updateTask(i, 'title', e.target.value)} />
              </div>
              <div>
                <select className="se-select" value={t.ownerRole} onChange={e => updateTask(i, 'ownerRole', e.target.value)} style={{ marginBottom: 4 }}>
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                <select className="se-select" value={t.category} onChange={e => updateTask(i, 'category', e.target.value)}>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <input className="se-input" type="number" value={t.offsetDays} onChange={e => updateTask(i, 'offsetDays', Number(e.target.value))} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                <input type="checkbox" checked={t.mandatory} onChange={e => updateTask(i, 'mandatory', e.target.checked)} /> Yes
              </label>
              <div />
              <button className="cd-btn-sm danger" style={{ padding: '4px 8px' }} onClick={() => removeTask(i)}>x</button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button className="cd-btn-sm" onClick={() => setTasks(prev => [...prev, emptyTask()])}>+ Add Task</button>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
            <button className="cd-btn-sm" onClick={() => setEditing(null)}>Cancel</button>
            <button className="cd-btn-sm primary" onClick={save} disabled={!name || tasks.length === 0}>Save</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="tb-page">
      <div className="tb-title">
        <span>Onboarding Templates</span>
        <button className="pr-btn" onClick={startNew}>New Template</button>
      </div>
      {templates.length === 0 ? (
        <div className="tb-empty">No templates yet.</div>
      ) : (
        <div className="tb-list">
          {templates.map(t => (
            <div key={t._id} className="tb-card" onClick={() => startEdit(t)}>
              <div className="tb-card-name">{t.name}</div>
              <div className="tb-card-count">{t.tasks.length} tasks</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
