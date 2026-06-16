import { useEffect, useState } from 'react';
import { myTasks, Task } from './pmApi';

export function MyTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState('');

  useEffect(() => { myTasks().then(setTasks).catch((e) => setError(e.message)); }, []);

  return (
    <div className="ts-page">
      <header className="ts-header"><h1 className="ts-h1">My Tasks</h1></header>
      {error && <p className="ts-error">{error}</p>}
      <div className="ts-card">
        <table className="ts-table">
          <thead>
            <tr><th className="ts-task">Task</th><th>Project</th><th>Est. hrs</th><th>Status</th><th>Due</th></tr>
          </thead>
          <tbody>
            {tasks.length === 0 && <tr><td colSpan={5} className="ts-empty">No tasks assigned to you yet.</td></tr>}
            {tasks.map((t) => (
              <tr key={t._id}>
                <td className="ts-task">{t.title}</td>
                <td>{typeof t.project === 'object' ? t.project.name : '—'}</td>
                <td>{t.estimatedHours}</td>
                <td>{t.status}</td>
                <td>{t.dueDate ? t.dueDate.slice(0, 10) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
