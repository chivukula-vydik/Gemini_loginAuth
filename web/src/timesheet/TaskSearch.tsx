import { useState, useEffect, useRef } from 'react';
import { getProjectTasks } from './timesheetApi';
import type { Assignable, ProjectRef } from './timesheetApi';

type Props = {
  projects: ProjectRef[];
  existingTaskIds: Set<string>;
  onSelect: (a: Assignable) => void;
  onAddBlank: () => void;
  onClose: () => void;
};

export function TaskSearch({ projects, existingTaskIds, onSelect, onAddBlank, onClose }: Props) {
  const [projectQuery, setProjectQuery] = useState('');
  const [selectedProject, setSelectedProject] = useState<ProjectRef | null>(null);
  const [taskQuery, setTaskQuery] = useState('');
  const [tasks, setTasks] = useState<Assignable[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, [selectedProject]);

  useEffect(() => {
    if (!selectedProject) { setTasks([]); return; }
    setLoading(true);
    getProjectTasks(selectedProject._id)
      .then((t) => setTasks(t.filter((x) => !existingTaskIds.has(x.taskId))))
      .catch(() => setTasks([]))
      .finally(() => setLoading(false));
  }, [selectedProject, existingTaskIds]);

  const filteredProjects = projects.filter((p) =>
    p.name.toLowerCase().includes(projectQuery.toLowerCase()),
  );

  const filteredTasks = tasks.filter((t) =>
    t.title.toLowerCase().includes(taskQuery.toLowerCase()),
  );

  function goBack() {
    setSelectedProject(null);
    setTaskQuery('');
  }

  return (
    <div className="tsk-search">
      {!selectedProject ? (
        <>
          <div className="tsk-search-header">Select a project</div>
          <input
            ref={inputRef}
            className="input tsk-search-input"
            placeholder="Search projects..."
            value={projectQuery}
            onChange={(e) => setProjectQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
          />
          <div className="tsk-search-list">
            {filteredProjects.map((p) => (
              <button key={p._id} className="tsk-search-item" type="button" onClick={() => setSelectedProject(p)}>
                <span className="tsk-search-item-title">{p.name}</span>
              </button>
            ))}
            {filteredProjects.length === 0 && <div className="tsk-search-empty">No projects found</div>}
          </div>
        </>
      ) : (
        <>
          <div className="tsk-search-header">
            <button className="tsk-search-back" type="button" onClick={goBack} aria-label="Back">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
            </button>
            <span className="tsk-search-project-name">{selectedProject.name}</span>
          </div>
          <input
            ref={inputRef}
            className="input tsk-search-input"
            placeholder="Search tasks..."
            value={taskQuery}
            onChange={(e) => setTaskQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
          />
          <div className="tsk-search-list">
            {loading && <div className="tsk-search-empty">Loading...</div>}
            {!loading && filteredTasks.map((t) => (
              <button key={t.taskId} className="tsk-search-item" type="button" onClick={() => onSelect(t)}>
                <span className="tsk-search-item-title">{t.title}</span>
                {t.description && <span className="tsk-search-item-meta">{t.description}</span>}
              </button>
            ))}
            {!loading && filteredTasks.length === 0 && tasks.length > 0 && (
              <div className="tsk-search-empty">No matching tasks</div>
            )}
            {!loading && tasks.length === 0 && (
              <div className="tsk-search-empty">No assigned tasks in this project</div>
            )}
          </div>
        </>
      )}
      <div className="tsk-search-foot">
        <button className="tsk-search-blank" type="button" onClick={() => { onAddBlank(); onClose(); }}>
          + Add without a task (meetings, admin...)
        </button>
      </div>
    </div>
  );
}
