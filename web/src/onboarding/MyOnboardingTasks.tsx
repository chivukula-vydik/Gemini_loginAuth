import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authed } from '../fetchHelper';
import './MyOnboardingTasks.css';

interface OTask {
  _id: string; title: string; ownerRole: string; status: string; dueDate: string;
  onboardingCase: { _id: string; candidate: { firstName: string; lastName: string }; designation: string; status: string; joiningDate: string };
}

export function MyOnboardingTasks() {
  const [tasks, setTasks] = useState<OTask[]>([]);
  const [loaded, setLoaded] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    authed('/onboarding/tasks/mine').then(d => { setTasks(d); setLoaded(true); });
  }, []);

  async function complete(taskId: string) {
    await authed(`/onboarding/tasks/${taskId}/complete`, 'POST');
    setTasks(prev => prev.filter(t => t._id !== taskId));
  }

  if (!loaded) return <div className="mot-page"><div className="mot-empty">Loading...</div></div>;

  return (
    <div className="mot-page">
      <h1 className="mot-title">My Onboarding Tasks</h1>
      {tasks.length === 0 ? (
        <div className="mot-empty">No pending onboarding tasks.</div>
      ) : (
        <div className="mot-list">
          {tasks.map(t => (
            <div key={t._id} className="mot-item">
              <input type="checkbox" className="cd-task-check" onChange={() => complete(t._id)} />
              <div className="mot-item-info">
                <div className="mot-item-title">{t.title}</div>
                <div className="mot-item-case" style={{ cursor: 'pointer' }} onClick={() => navigate(`/onboarding/${t.onboardingCase._id}`)}>
                  {t.onboardingCase.candidate.firstName} {t.onboardingCase.candidate.lastName} — {t.onboardingCase.designation}
                </div>
              </div>
              {t.dueDate && <span className="mot-item-due">{new Date(t.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
