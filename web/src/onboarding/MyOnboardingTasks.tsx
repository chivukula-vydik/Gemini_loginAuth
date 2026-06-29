import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  IconUpload,
  IconHandClick,
  IconCalendarEvent,
  IconForms,
  IconCircleCheck,
  IconChecklist,
  IconConfetti,
  IconClipboardList,
} from '@tabler/icons-react';
import { authed } from '../fetchHelper';
import './MyOnboardingTasks.css';

interface OTask {
  _id: string;
  title: string;
  ownerRole: string;
  status: string;
  dueDate: string | null;
  taskType: string;
  phase: string;
  mandatory: boolean;
  onboardingCase: {
    _id: string;
    candidate: { firstName: string; lastName: string };
    designation: string;
    status: string;
    joiningDate: string;
  };
}

const PHASE_ORDER = ['pre_boarding', 'first_day', 'first_week', 'first_month', 'general'] as const;
const PHASE_LABELS: Record<string, string> = {
  pre_boarding: 'Pre-Boarding',
  first_day: 'First Day',
  first_week: 'First Week',
  first_month: 'First Month',
  general: 'General',
};

const ACTION_MAP: Record<string, { label: string; icon: typeof IconUpload }> = {
  upload:      { label: 'Upload',      icon: IconUpload },
  acknowledge: { label: 'Acknowledge', icon: IconHandClick },
  meeting:     { label: 'Schedule',    icon: IconCalendarEvent },
  form:        { label: 'Fill Form',   icon: IconForms },
  manual:      { label: 'Mark Done',   icon: IconCircleCheck },
};

function fmtDue(d: string | null): string {
  if (!d) return '';
  const date = new Date(d);
  const now = new Date();
  const diff = Math.ceil((date.getTime() - now.getTime()) / 86400000);
  const label = date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  if (diff < 0) return `Overdue · ${label}`;
  if (diff === 0) return `Today`;
  if (diff === 1) return `Tomorrow`;
  return label;
}

function dueClass(d: string | null): string {
  if (!d) return '';
  const diff = Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
  if (diff < 0) return 'overdue';
  if (diff <= 1) return 'soon';
  return '';
}

export function MyOnboardingTasks() {
  const [tasks, setTasks] = useState<OTask[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [completing, setCompleting] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    authed('/onboarding/tasks/mine').then(d => { setTasks(d); setLoaded(true); });
  }, []);

  async function complete(taskId: string) {
    setCompleting(taskId);
    try {
      await authed(`/onboarding/tasks/${taskId}/complete`, 'POST');
      setTasks(prev => prev.map(t => t._id === taskId ? { ...t, status: 'done' } : t));
    } finally {
      setCompleting(null);
    }
  }

  if (!loaded) {
    return (
      <div className="mot-page">
        <div className="mot-loader">
          <div className="mot-spinner" />
          Loading your tasks...
        </div>
      </div>
    );
  }

  const total = tasks.length;
  const done = tasks.filter(t => t.status === 'done').length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  const grouped = PHASE_ORDER
    .map(phase => ({
      phase,
      label: PHASE_LABELS[phase],
      items: tasks.filter(t => (t.phase || 'general') === phase),
    }))
    .filter(g => g.items.length > 0);

  const allDone = total > 0 && done === total;
  const noTasks = total === 0;

  return (
    <div className="mot-page">
      {/* Header */}
      <div className="mot-header">
        <div className="mot-header-left">
          <IconChecklist size={22} />
          <div>
            <h1 className="mot-title">My Onboarding Tasks</h1>
            <p className="mot-subtitle">
              {noTasks ? 'Nothing assigned yet' : allDone ? 'All tasks completed' : `${done} of ${total} tasks completed`}
            </p>
          </div>
        </div>
        {total > 0 && (
          <div className="mot-progress">
            <div className="mot-progress-bar">
              <div className="mot-progress-fill" style={{ width: `${pct}%` }} />
            </div>
            <span className="mot-progress-pct">{pct}%</span>
          </div>
        )}
      </div>

      {/* All-done state */}
      {allDone && (
        <div className="mot-card mot-done-card">
          <div className="mot-done-icon"><IconConfetti size={28} /></div>
          <h2 className="mot-done-title">You're all set!</h2>
          <p className="mot-done-sub">Every onboarding task has been completed. Welcome aboard — you're ready to go.</p>
        </div>
      )}

      {/* No tasks state */}
      {noTasks && (
        <div className="mot-card mot-empty-card">
          <div className="mot-empty-icon"><IconClipboardList size={28} /></div>
          <h2 className="mot-empty-title">No tasks assigned yet</h2>
          <p className="mot-empty-sub">Your onboarding tasks will appear here once your HR team sets them up. Check back soon.</p>
        </div>
      )}

      {/* Task groups */}
      {!allDone && grouped.map(g => {
        const gDone = g.items.filter(t => t.status === 'done').length;
        return (
          <div key={g.phase} className="mot-card">
            <div className="mot-group-header">
              <h2 className="mot-group-title">{g.label}</h2>
              <span className="mot-group-count">{gDone}/{g.items.length}</span>
            </div>
            <div className="mot-task-list">
              {g.items.map(t => {
                const isDone = t.status === 'done';
                const action = ACTION_MAP[t.taskType] || ACTION_MAP.manual;
                const ActionIcon = action.icon;
                return (
                  <div key={t._id} className={`mot-task-row ${isDone ? 'done' : ''}`}>
                    <button
                      className={`mot-check ${isDone ? 'checked' : ''}`}
                      onClick={() => !isDone && complete(t._id)}
                      disabled={isDone || completing === t._id}
                    >
                      {isDone && <IconCircleCheck size={16} />}
                    </button>
                    <div className="mot-task-body">
                      <span className={`mot-task-title ${isDone ? 'done' : ''}`}>{t.title}</span>
                      <span
                        className="mot-task-case"
                        onClick={() => navigate(`/onboarding/${t.onboardingCase._id}`)}
                      >
                        {t.onboardingCase.candidate.firstName} {t.onboardingCase.candidate.lastName} · {t.onboardingCase.designation}
                      </span>
                    </div>
                    {t.dueDate && (
                      <span className={`mot-task-due ${dueClass(t.dueDate)}`}>
                        {fmtDue(t.dueDate)}
                      </span>
                    )}
                    {!isDone && (
                      <button
                        className="mot-action-btn"
                        onClick={() => complete(t._id)}
                        disabled={completing === t._id}
                      >
                        <ActionIcon size={14} />
                        {action.label}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
