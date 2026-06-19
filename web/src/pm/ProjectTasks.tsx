import { useEffect, useMemo, useState } from 'react';
import { dueUrgency, type DueUrgency } from '../timesheet/due';
import { todayISO } from '../timesheet/time';
import { assigneeHours } from './workload';
import { estimateSummary } from './assigneeEstimate';
import { etaStatus } from './eta';
import { AssigneesEditor } from './AssigneesEditor';
import { StatusBadge } from './StatusBadge';
import { personName } from './personName';
import { bulkUpdateTasks, type Person, type TaskDetail } from './pmApi';
import { TaskToolbar } from './TaskToolbar';
import { BulkBar } from './BulkBar';
import { Pagination } from './Pagination';
import { filterTasks, paginate } from './taskFilter';
import { downloadCSV, downloadXLSX, toExportRows } from './taskExport';
import { PM_FLAGS } from './featureFlags';

const PAGE_SIZE = 10;

type Props = {
  projectId: string;
  members: Person[];
  tasks: TaskDetail[];
  onReload: () => Promise<void> | void;
  onError: (message: string) => void;
  onDecideEstimate: (taskId: string, decision: 'approve' | 'reject') => Promise<void>;
  onSaveDue: (taskId: string, dueDate: string | null) => Promise<void>;
  onDecideExt: (taskId: string, decision: 'approve' | 'reject') => Promise<void>;
  onSaveAssignees: (taskId: string, next: { user: string; sharePct: number }[]) => Promise<void>;
};

function DueCell({ task, onSave, onDecideExt }: {
  task: TaskDetail;
  onSave: (dueDate: string | null) => void;
  onDecideExt: (decision: 'approve' | 'reject') => void;
}) {
  const value = task.dueDate ? task.dueDate.slice(0, 10) : (task.effectiveDueDate ?? '');
  const urgency = dueUrgency(value || null, todayISO(), task.status);
  return (
    <div className="due-stack">
      <span className="due-cell">
        <input
          className={`ts-pct due-input${urgency ? ` due-${urgency}` : ''}`}
          type="date"
          value={value}
          onChange={(e) => onSave(e.target.value || null)}
          title={task.dueDateAuto ? 'Auto: start date + estimate. Pick a date to override.' : 'Due date'}
        />
        {task.dueDateAuto && value
          ? <span className="due-tag">auto</span>
          : task.dueDate
            ? <button className="link-btn due-clear" title="Clear (revert to auto)" onClick={() => onSave(null)}>×</button>
            : null}
      </span>
      {task.dueProposalStatus === 'proposed' && (
        <span className="ext-note ext-pending">
          Wants {task.dueProposalValue} {task.dueProposalUnit} more
          {task.dueProposalDate ? ` -> ${task.dueProposalDate}` : ''}
          <button className="link-btn" style={{ marginLeft: 6 }} onClick={() => onDecideExt('approve')}>approve</button>
          <button className="link-btn" style={{ color: 'var(--danger)' }} onClick={() => onDecideExt('reject')}>reject</button>
        </span>
      )}
    </div>
  );
}

export function ProjectTasks(props: Props) {
  const [query, setQuery] = useState('');
  const [statuses, setStatuses] = useState<string[]>([]);
  const [assignees, setAssignees] = useState<string[]>([]);
  const [urgencies, setUrgencies] = useState<DueUrgency[]>([]);
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingAssignees, setEditingAssignees] = useState<string | null>(null);

  const assigneeOptions = useMemo(() => (
    props.members.map((m) => ({ value: m._id, label: personName(m) }))
  ), [props.members]);

  const filtered = useMemo(() => filterTasks(props.tasks, {
    query,
    statuses,
    assignees,
    urgencies,
  }, todayISO()), [props.tasks, query, statuses, assignees, urgencies]);

  const pageState = useMemo(() => paginate(filtered, page, PAGE_SIZE), [filtered, page]);
  const pageTasks = pageState.items;
  useEffect(() => {
    if (page !== pageState.page) setPage(pageState.page);
  }, [page, pageState.page]);

  const selectedTasks = props.tasks.filter((t) => selectedIds.has(t._id));
  const allFilteredSelected = filtered.length > 0 && filtered.every((t) => selectedIds.has(t._id));
  const toolsEnabled = PM_FLAGS.taskTools;
  const bulkEnabled = PM_FLAGS.taskBulk;

  function toggleRow(taskId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId); else next.add(taskId);
      return next;
    });
  }

  function toggleSelectAllFiltered() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        for (const t of filtered) next.delete(t._id);
      } else {
        for (const t of filtered) next.add(t._id);
      }
      return next;
    });
  }

  async function runBulk(op: 'status' | 'assignee' | 'delete', value?: string) {
    const taskIds = [...selectedIds];
    if (taskIds.length === 0) return;
    try {
      await bulkUpdateTasks(props.projectId, taskIds, op, value);
      setSelectedIds(new Set());
      // notify other parts of the app when tasks are deleted so they can update (e.g., timesheets)
      if (op === 'delete') {
        try { window.dispatchEvent(new CustomEvent('pm:tasks-deleted', { detail: { taskIds } })); } catch {}
      }
      await props.onReload();
    } catch (e) {
      props.onError((e as Error).message);
    }
  }

  return (
    <div className="ts-card pm-tasks-card">
      {toolsEnabled && (
        <TaskToolbar
          query={query}
          statuses={statuses}
          assignees={assignees}
          urgencies={urgencies}
          assigneeOptions={assigneeOptions}
          onQueryChange={(v) => { setQuery(v); setPage(1); }}
          onStatusesChange={(v) => { setStatuses(v); setPage(1); }}
          onAssigneesChange={(v) => { setAssignees(v); setPage(1); }}
          onUrgenciesChange={(v) => { setUrgencies(v); setPage(1); }}
        />
      )}
      {toolsEnabled && bulkEnabled && (
        <BulkBar
          selectedCount={selectedIds.size}
          members={props.members}
          onCloseTasks={() => runBulk('status', 'done')}
          onSetStatus={(status) => runBulk('status', status)}
          onReassign={(assigneeId) => runBulk('assignee', assigneeId)}
          onDelete={() => {
            if (window.confirm(`Delete ${selectedIds.size} selected task(s)?`)) runBulk('delete');
          }}
          onExportCSV={() => downloadCSV(toExportRows(selectedTasks), 'project-tasks.csv')}
          onExportXLSX={() => downloadXLSX(toExportRows(selectedTasks), 'project-tasks.xlsx')}
        />
      )}

      <table className="ts-table">
        <thead>
          <tr>
            {toolsEnabled && bulkEnabled && (
              <th>
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  onChange={toggleSelectAllFiltered}
                  aria-label="Select all filtered tasks"
                />
              </th>
            )}
            <th className="ts-task">Task</th>
            <th className="col-left">Assignee</th>
            <th>Planned</th>
            <th>Actual</th>
            <th>%</th>
            <th>Status</th>
            <th className="col-left">Due</th>
          </tr>
        </thead>
        <tbody>
          {pageTasks.length === 0 && (
            <tr><td colSpan={toolsEnabled && bulkEnabled ? 8 : 7}>
              <div className="empty-state">
                <span className="empty-state-icon">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                  </svg>
                </span>
                <span className="empty-state-title">No tasks here</span>
                <span className="empty-state-text">{props.tasks.length === 0 ? 'Add a task above to get started.' : 'No tasks match the current filters.'}</span>
              </div>
            </td></tr>
          )}
          {pageTasks.map((t) => {
            const urgency = dueUrgency(t.dueDate ?? t.effectiveDueDate ?? null, todayISO(), t.status);
            const rowClass = urgency === 'overdue' ? 'ts-row-overdue' : urgency === 'soon' ? 'ts-row-soon' : '';
            const taskDeadline = t.dueDate ? t.dueDate.slice(0, 10) : (t.effectiveDueDate ?? null);
            const anyEtaLate = t.status !== 'done' && t.assignees.some((a) => etaStatus(a.etaAt, taskDeadline) === 'late');
            return (
              <tr key={t._id} className={rowClass}>
                {toolsEnabled && bulkEnabled && (
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(t._id)}
                      onChange={() => toggleRow(t._id)}
                      aria-label={`Select task ${t.title}`}
                    />
                  </td>
                )}
                <td className="ts-task">{t.title}</td>
                <td className="col-left">
                  {editingAssignees === t._id ? (
                    <AssigneesEditor
                      members={props.members}
                      value={t.assignees.map((a) => ({ userId: a.user._id, sharePct: a.sharePct, estimatedHours: a.estimatedHours }))}
                      onSave={async (next) => {
                        await props.onSaveAssignees(t._id, next);
                        setEditingAssignees(null);
                      }}
                      onClose={() => setEditingAssignees(null)}
                    />
                  ) : (
                    <button className="assignees-cell" type="button" onClick={() => setEditingAssignees(t._id)}>
                      {t.assignees.length === 0
                        ? <span className="ts-sub">Unassigned</span>
                        : t.assignees.map((a) => {
                            const aStatus = etaStatus(a.etaAt, taskDeadline);
                            return (
                            <span key={a.user._id} className="assignee-line">
                              <span className="assignee-line-name">{personName(a.user)}</span>
                              <span className="assignee-line-meta">
                                {a.sharePct}% · {assigneeHours(t.estimatedHours, a.sharePct)}h ·{' '}
                                {a.estimatedHours != null ? `${a.estimatedHours}h` : 'pending'}
                                {a.etaAt && (
                                  <span className={aStatus === 'late' ? 'eta-meta-late' : 'eta-meta'}>
                                    {' '}· ETA {a.etaAt.slice(0, 10)}{aStatus === 'late' ? ' ⚠' : ''}
                                  </span>
                                )}
                              </span>
                            </span>
                            );
                          })}
                    </button>
                  )}
                </td>
                <td>
                  {t.estimateStatus === 'proposed' ? (
                    <span className="ts-nav-left">
                      {t.proposedValue ?? 0} {t.proposedUnit ?? 'hours'}?
                      <button className="link-btn" onClick={() => props.onDecideEstimate(t._id, 'approve')}>approve</button>
                      <button className="link-btn" style={{ color: 'var(--danger)' }} onClick={() => props.onDecideEstimate(t._id, 'reject')}>reject</button>
                    </span>
                  ) : t.estimateStatus === 'approved' ? `${t.estimateValue || t.estimatedHours} ${t.estimateUnit ?? 'hours'}`
                    : <span className="ts-sub">{t.estimateStatus === 'rejected' ? 'rejected' : 'no estimate'}</span>}
                  {t.assignees.length > 0 && (() => {
                    const { total, submitted, count, allIn } = estimateSummary(t.assignees);
                    return (
                      <div className="ts-sub">
                        {allIn ? `${total}h` : `${submitted} of ${count} submitted`}
                      </div>
                    );
                  })()}
                </td>
                <td>{((t.actualMinutes ?? 0) / 60).toFixed(1)}h</td>
                <td>{t.percentComplete ?? 0}%</td>
                <td><StatusBadge status={t.status} /></td>
                <td className="col-left">
                  <DueCell task={t} onSave={(d) => props.onSaveDue(t._id, d)} onDecideExt={(dec) => props.onDecideExt(t._id, dec)} />
                  {anyEtaLate && <span className="eta-badge-late" title="An assignee expects to finish after the deadline">⚠ ETA past deadline</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {toolsEnabled && <Pagination page={pageState.page} totalPages={pageState.totalPages} onChange={setPage} />}
    </div>
  );
}
