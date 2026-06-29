import { useState, useEffect } from 'react';
import {
  IconPlus,
  IconClipboardList,
  IconDotsVertical,
  IconPencil,
  IconCopy,
  IconTrash,
  IconArrowLeft,
  IconCode,
  IconPresentation,
  IconUsers,
  IconX,
} from '@tabler/icons-react';
import { authed } from '../fetchHelper';
import './TemplateBuilder.css';

interface TemplateTask {
  key: string;
  title: string;
  description: string;
  ownerRole: string;
  taskType: string;
  phase: string;
  offsetDays: number;
  runsOn: string;
  category: string;
  mandatory: boolean;
  dependsOn: string[];
}

interface Template {
  _id: string;
  name: string;
  description: string;
  icon: string;
  tasks: TemplateTask[];
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

const ROLES = ['hr', 'it', 'manager', 'finance', 'candidate', 'admin'];
const TASK_TYPES = ['manual', 'upload', 'acknowledge', 'meeting', 'form'];
const PHASES = ['pre_boarding', 'first_day', 'first_week', 'first_month'];
const CATEGORIES = ['document', 'asset', 'access', 'training', 'admin'];

const PHASE_LABELS: Record<string, string> = {
  pre_boarding: 'Pre-Boarding', first_day: 'First Day',
  first_week: 'First Week', first_month: 'First Month',
};

const TYPE_LABELS: Record<string, string> = {
  manual: 'Manual', upload: 'Upload', acknowledge: 'Acknowledge',
  meeting: 'Meeting', form: 'Form',
};

const RUNS_ON = ['candidate', 'employee'] as const;
const RUNS_ON_LABELS: Record<string, string> = { candidate: 'Candidate (portal)', employee: 'Employee (post-join)' };

const emptyTask = (): TemplateTask => ({
  key: '', title: '', description: '', ownerRole: 'hr', taskType: 'manual',
  phase: 'first_day', runsOn: 'employee', offsetDays: 0, category: 'admin', mandatory: true, dependsOn: [],
});

interface Preset {
  name: string;
  description: string;
  icon: typeof IconCode;
  tasks: TemplateTask[];
}

const PRESETS: Preset[] = [
  {
    name: 'Engineering Onboarding',
    description: 'Dev environment, access provisioning, team introductions',
    icon: IconCode,
    tasks: [
      { key: 'id_proof', title: 'Upload identity documents', description: '', ownerRole: 'candidate', taskType: 'upload', phase: 'pre_boarding', offsetDays: -3, category: 'document', mandatory: true, dependsOn: [], runsOn: 'candidate' },
      { key: 'nda', title: 'Sign NDA & IP agreement', description: '', ownerRole: 'candidate', taskType: 'acknowledge', phase: 'pre_boarding', offsetDays: -3, category: 'document', mandatory: true, dependsOn: [], runsOn: 'candidate' },
      { key: 'laptop', title: 'Set up laptop & dev environment', description: '', ownerRole: 'it', taskType: 'manual', phase: 'pre_boarding', offsetDays: -2, category: 'asset', mandatory: true, dependsOn: [], runsOn: 'employee' },
      { key: 'github', title: 'Grant GitHub / repo access', description: '', ownerRole: 'it', taskType: 'manual', phase: 'first_day', offsetDays: 0, category: 'access', mandatory: true, dependsOn: [], runsOn: 'employee' },
      { key: 'buddy', title: 'Assign engineering buddy', description: '', ownerRole: 'manager', taskType: 'manual', phase: 'first_day', offsetDays: 0, category: 'admin', mandatory: true, dependsOn: [], runsOn: 'employee' },
      { key: 'standup', title: 'Join first standup', description: '', ownerRole: 'candidate', taskType: 'meeting', phase: 'first_day', offsetDays: 1, category: 'training', mandatory: true, dependsOn: [], runsOn: 'employee' },
      { key: 'arch_review', title: 'Architecture walkthrough session', description: '', ownerRole: 'manager', taskType: 'meeting', phase: 'first_week', offsetDays: 3, category: 'training', mandatory: true, dependsOn: [], runsOn: 'employee' },
      { key: 'first_pr', title: 'Submit first pull request', description: '', ownerRole: 'candidate', taskType: 'manual', phase: 'first_week', offsetDays: 5, category: 'training', mandatory: false, dependsOn: [], runsOn: 'employee' },
      { key: 'review_30', title: '30-day check-in with manager', description: '', ownerRole: 'manager', taskType: 'meeting', phase: 'first_month', offsetDays: 30, category: 'admin', mandatory: true, dependsOn: [], runsOn: 'employee' },
    ],
  },
  {
    name: 'Sales Onboarding',
    description: 'CRM setup, product training, territory assignment',
    icon: IconPresentation,
    tasks: [
      { key: 'id_proof', title: 'Upload identity documents', description: '', ownerRole: 'candidate', taskType: 'upload', phase: 'pre_boarding', offsetDays: -3, category: 'document', mandatory: true, dependsOn: [], runsOn: 'candidate' },
      { key: 'product_deck', title: 'Review product deck', description: '', ownerRole: 'candidate', taskType: 'acknowledge', phase: 'pre_boarding', offsetDays: -2, category: 'training', mandatory: true, dependsOn: [], runsOn: 'candidate' },
      { key: 'crm', title: 'Set up CRM account', description: '', ownerRole: 'it', taskType: 'manual', phase: 'pre_boarding', offsetDays: -1, category: 'access', mandatory: true, dependsOn: [], runsOn: 'employee' },
      { key: 'territory', title: 'Assign territory & accounts', description: '', ownerRole: 'manager', taskType: 'manual', phase: 'first_week', offsetDays: 2, category: 'admin', mandatory: true, dependsOn: [], runsOn: 'employee' },
      { key: 'shadow', title: 'Shadow senior rep on calls', description: '', ownerRole: 'candidate', taskType: 'meeting', phase: 'first_week', offsetDays: 3, category: 'training', mandatory: true, dependsOn: [], runsOn: 'employee' },
      { key: 'pitch', title: 'Deliver practice pitch', description: '', ownerRole: 'candidate', taskType: 'meeting', phase: 'first_week', offsetDays: 5, category: 'training', mandatory: false, dependsOn: [], runsOn: 'employee' },
      { key: 'review_30', title: '30-day pipeline review', description: '', ownerRole: 'manager', taskType: 'meeting', phase: 'first_month', offsetDays: 30, category: 'admin', mandatory: true, dependsOn: [], runsOn: 'employee' },
    ],
  },
  {
    name: 'General Onboarding',
    description: 'Standard checklist for any new hire',
    icon: IconUsers,
    tasks: [
      { key: 'id_proof', title: 'Upload identity documents', description: '', ownerRole: 'candidate', taskType: 'upload', phase: 'pre_boarding', offsetDays: -3, category: 'document', mandatory: true, dependsOn: [], runsOn: 'candidate' },
      { key: 'bank', title: 'Submit bank account details', description: '', ownerRole: 'candidate', taskType: 'form', phase: 'pre_boarding', offsetDays: -3, category: 'document', mandatory: true, dependsOn: [], runsOn: 'candidate' },
      { key: 'policy', title: 'Acknowledge company policies', description: '', ownerRole: 'candidate', taskType: 'acknowledge', phase: 'pre_boarding', offsetDays: -2, category: 'document', mandatory: true, dependsOn: [], runsOn: 'candidate' },
      { key: 'badge', title: 'Issue access badge', description: '', ownerRole: 'hr', taskType: 'manual', phase: 'first_day', offsetDays: 0, category: 'asset', mandatory: true, dependsOn: [], runsOn: 'employee' },
      { key: 'intro', title: 'Team introduction meeting', description: '', ownerRole: 'manager', taskType: 'meeting', phase: 'first_week', offsetDays: 1, category: 'training', mandatory: true, dependsOn: [], runsOn: 'employee' },
      { key: 'review_30', title: '30-day manager check-in', description: '', ownerRole: 'manager', taskType: 'meeting', phase: 'first_month', offsetDays: 30, category: 'admin', mandatory: true, dependsOn: [], runsOn: 'employee' },
    ],
  },
];

function phaseCount(tasks: TemplateTask[]): number {
  return new Set(tasks.map(t => t.phase)).size;
}

function usageLabel(n: number): string {
  if (n === 0) return 'Not used yet';
  return `Applied to ${n} hire${n !== 1 ? 's' : ''}`;
}

export function TemplateBuilder() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tasks, setTasks] = useState<TemplateTask[]>([]);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  useEffect(() => {
    authed('/onboarding/templates').then(d => { setTemplates(d); setLoaded(true); });
  }, []);

  function startEdit(t: Template) {
    setEditing(t);
    setName(t.name);
    setDescription(t.description || '');
    setTasks([...t.tasks]);
    setMenuOpen(null);
  }

  function startNew() {
    setEditing({ _id: '', name: '', description: '', icon: 'clipboard', tasks: [], usageCount: 0, createdAt: '', updatedAt: '' });
    setName('');
    setDescription('');
    setTasks([emptyTask()]);
  }

  function startFromPreset(preset: Preset) {
    setEditing({ _id: '', name: '', description: '', icon: 'clipboard', tasks: [], usageCount: 0, createdAt: '', updatedAt: '' });
    setName(preset.name);
    setDescription(preset.description);
    setTasks([...preset.tasks]);
  }

  async function duplicate(t: Template) {
    setMenuOpen(null);
    const body = { name: `${t.name} (Copy)`, description: t.description, icon: t.icon, tasks: t.tasks };
    const created = await authed('/onboarding/templates', 'POST', body);
    setTemplates(prev => [created, ...prev]);
  }

  async function remove(id: string) {
    setMenuOpen(null);
    await authed(`/onboarding/templates/${id}`, 'DELETE');
    setTemplates(prev => prev.filter(t => t._id !== id));
  }

  function updateTask(idx: number, field: string, value: unknown) {
    setTasks(prev => prev.map((t, i) => i === idx ? { ...t, [field]: value } : t));
  }

  function removeTask(idx: number) {
    setTasks(prev => prev.filter((_, i) => i !== idx));
  }

  async function save() {
    const body = { name, description, tasks };
    if (editing?._id) {
      const updated = await authed(`/onboarding/templates/${editing._id}`, 'PUT', body);
      setTemplates(prev => prev.map(t => t._id === updated._id ? updated : t));
    } else {
      const created = await authed('/onboarding/templates', 'POST', body);
      setTemplates(prev => [created, ...prev]);
    }
    setEditing(null);
  }

  if (!loaded) {
    return (
      <div className="tb-page">
        <div className="tb-loader"><div className="tb-spinner" />Loading templates...</div>
      </div>
    );
  }

  // --- Editor view ---
  if (editing) {
    const grouped = PHASES.map(p => ({
      phase: p,
      label: PHASE_LABELS[p],
      items: tasks.map((t, i) => ({ ...t, _idx: i })).filter(t => t.phase === p),
    })).filter(g => g.items.length > 0);

    const ungrouped = tasks.map((t, i) => ({ ...t, _idx: i })).filter(t => !PHASES.includes(t.phase));

    return (
      <div className="tb-page">
        <button className="tb-back" onClick={() => setEditing(null)}>
          <IconArrowLeft size={16} /> Back to Templates
        </button>

        <div className="tb-editor-header">
          <h1 className="tb-editor-title">{editing._id ? 'Edit Template' : 'New Template'}</h1>
        </div>

        <div className="tb-card">
          <div className="tb-form-row">
            <div className="tb-form-group" style={{ flex: 2 }}>
              <label className="tb-label">Template Name</label>
              <input className="tb-input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Engineering FTE Onboarding" />
            </div>
            <div className="tb-form-group" style={{ flex: 3 }}>
              <label className="tb-label">Description</label>
              <input className="tb-input" value={description} onChange={e => setDescription(e.target.value)} placeholder="What this template covers" />
            </div>
          </div>
        </div>

        <div className="tb-card">
          <div className="tb-section-head">
            <h2 className="tb-section-title">Tasks ({tasks.length})</h2>
            <button className="tb-add-btn" onClick={() => setTasks(prev => [...prev, emptyTask()])}>
              <IconPlus size={14} /> Add Task
            </button>
          </div>

          {[...grouped, ...(ungrouped.length ? [{ phase: '_other', label: 'Other', items: ungrouped }] : [])].map(g => (
            <div key={g.phase} className="tb-phase-group">
              <div className="tb-phase-label">{g.label} <span className="tb-phase-count">{g.items.length}</span></div>
              {g.items.map(t => (
                <div key={t._idx} className="tb-task-row">
                  <div className="tb-task-fields">
                    <input className="tb-input tb-task-key" placeholder="key" value={t.key} onChange={e => updateTask(t._idx, 'key', e.target.value)} />
                    <input className="tb-input tb-task-title" placeholder="Task title" value={t.title} onChange={e => updateTask(t._idx, 'title', e.target.value)} />
                    <select className="tb-select" value={t.phase} onChange={e => updateTask(t._idx, 'phase', e.target.value)}>
                      {PHASES.map(p => <option key={p} value={p}>{PHASE_LABELS[p]}</option>)}
                    </select>
                    <select className="tb-select" value={t.taskType} onChange={e => updateTask(t._idx, 'taskType', e.target.value)}>
                      {TASK_TYPES.map(tt => <option key={tt} value={tt}>{TYPE_LABELS[tt]}</option>)}
                    </select>
                    <select className="tb-select" value={t.ownerRole} onChange={e => updateTask(t._idx, 'ownerRole', e.target.value)}>
                      {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <select className="tb-select" value={t.runsOn} onChange={e => updateTask(t._idx, 'runsOn', e.target.value)}>
                      {RUNS_ON.map(r => <option key={r} value={r}>{RUNS_ON_LABELS[r]}</option>)}
                    </select>
                    <select className="tb-select" value={t.category} onChange={e => updateTask(t._idx, 'category', e.target.value)}>
                      {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <div className="tb-offset-wrap">
                      <input className="tb-input tb-offset" type="number" value={t.offsetDays} onChange={e => updateTask(t._idx, 'offsetDays', Number(e.target.value))} />
                      <span className="tb-offset-label">days</span>
                    </div>
                    <label className="tb-mandatory-check">
                      <input type="checkbox" checked={t.mandatory} onChange={e => updateTask(t._idx, 'mandatory', e.target.checked)} />
                      Req
                    </label>
                  </div>
                  <button className="tb-remove-btn" onClick={() => removeTask(t._idx)} title="Remove task">
                    <IconX size={14} />
                  </button>
                </div>
              ))}
            </div>
          ))}

          {tasks.length === 0 && (
            <div className="tb-no-tasks">
              No tasks yet. Add one above to get started.
            </div>
          )}
        </div>

        <div className="tb-editor-actions">
          <button className="tb-btn secondary" onClick={() => setEditing(null)}>Cancel</button>
          <button className="tb-btn primary" onClick={save} disabled={!name || tasks.length === 0}>
            {editing._id ? 'Save Changes' : 'Create Template'}
          </button>
        </div>
      </div>
    );
  }

  // --- Empty state ---
  if (templates.length === 0) {
    return (
      <div className="tb-page">
        <div className="tb-empty-state">
          <div className="tb-empty-icon"><IconClipboardList size={32} /></div>
          <h1 className="tb-empty-title">Create your first onboarding template</h1>
          <p className="tb-empty-sub">
            Templates are reusable checklists — define tasks once, apply them to every new hire.
            Start from a preset or build your own from scratch.
          </p>
          <button className="tb-btn primary" onClick={startNew}><IconPlus size={16} /> Build from Scratch</button>
        </div>

        <div className="tb-presets">
          <h2 className="tb-presets-title">Or start from a preset</h2>
          <div className="tb-preset-grid">
            {PRESETS.map(p => {
              const Icon = p.icon;
              return (
                <button key={p.name} className="tb-preset-card" onClick={() => startFromPreset(p)}>
                  <div className="tb-preset-icon"><Icon size={20} /></div>
                  <div className="tb-preset-name">{p.name}</div>
                  <div className="tb-preset-desc">{p.description}</div>
                  <div className="tb-preset-meta">{p.tasks.length} tasks · {phaseCount(p.tasks)} phases</div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // --- Card grid ---
  return (
    <div className="tb-page">
      <div className="tb-header">
        <div>
          <h1 className="tb-page-title">Onboarding Templates</h1>
          <p className="tb-page-sub">{templates.length} template{templates.length !== 1 ? 's' : ''}</p>
        </div>
        <button className="tb-btn primary" onClick={startNew}><IconPlus size={16} /> New Template</button>
      </div>

      <div className="tb-grid">
        {templates.map(t => (
          <div key={t._id} className="tb-template-card">
            <div className="tb-tcard-top">
              <div className="tb-tcard-icon"><IconClipboardList size={18} /></div>
              <div className="tb-tcard-info">
                <div className="tb-tcard-name">{t.name}</div>
                {t.description && <div className="tb-tcard-desc">{t.description}</div>}
              </div>
              <div className="tb-tcard-menu-wrap">
                <button className="tb-tcard-menu-btn" onClick={e => { e.stopPropagation(); setMenuOpen(menuOpen === t._id ? null : t._id); }}>
                  <IconDotsVertical size={16} />
                </button>
                {menuOpen === t._id && (
                  <div className="tb-tcard-menu">
                    <button onClick={() => startEdit(t)}><IconPencil size={14} /> Edit</button>
                    <button onClick={() => duplicate(t)}><IconCopy size={14} /> Duplicate</button>
                    <button className="danger" onClick={() => remove(t._id)}><IconTrash size={14} /> Delete</button>
                  </div>
                )}
              </div>
            </div>
            <div className="tb-tcard-stats">
              <span>{t.tasks.length} tasks</span>
              <span className="tb-tcard-dot" />
              <span>{phaseCount(t.tasks)} phases</span>
            </div>
            <div className="tb-tcard-usage">{usageLabel(t.usageCount || 0)}</div>
          </div>
        ))}
      </div>

      {/* Preset suggestions below existing templates */}
      <div className="tb-presets tb-presets-inline">
        <h2 className="tb-presets-title">Quick-start presets</h2>
        <div className="tb-preset-grid">
          {PRESETS.map(p => {
            const Icon = p.icon;
            return (
              <button key={p.name} className="tb-preset-card compact" onClick={() => startFromPreset(p)}>
                <div className="tb-preset-icon"><Icon size={16} /></div>
                <div className="tb-preset-name">{p.name}</div>
                <div className="tb-preset-meta">{p.tasks.length} tasks</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
