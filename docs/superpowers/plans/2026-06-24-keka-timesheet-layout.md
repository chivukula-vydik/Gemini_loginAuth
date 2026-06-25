# Keka-Aligned Timesheet Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the timesheet UI to match the Keka PSA timesheet layout — stacked task identity, attendance hours row, billable bar, two-step task search, and comment summary panel.

**Architecture:** The changes are primarily frontend (React components + CSS) with a small backend addition to include `projectName` and `clientName` on each task row. The grid structure stays as a `<table>` but gains new rows (attendance hours) and a richer task identity column. New components: `BillableBar`, `CommentSummary`, `TaskSearch`. Existing components modified: `TaskRow`, `TimesheetGrid`, `TimesheetPage`.

**Tech Stack:** React 19, TypeScript 5.5, Express/Mongoose (backend), CSS (no preprocessor)

## Global Constraints

- Week stays Mon–Fri (5 day columns)
- Time format stays `0h 00m` (via existing `formatMinutes`)
- All new frontend code in `web/src/timesheet/`
- All CSS in `web/src/styles.css`
- No new npm dependencies

---

### Task 1: Backend — Add projectName and clientName to task rows

The GET `/timesheets/:weekStart` endpoint hydrates task rows from `taskInfoById` but doesn't include `projectName` or `clientName`. The `Project` model has both `name` and `clientName` fields. We need to populate them into each task row so the frontend can display the stacked identity.

**Files:**
- Modify: `auth-api/src/routes/timesheets.js:196-228` (GET /:weekStart handler)
- Modify: `web/src/timesheet/timesheetApi.ts:18-35` (Task type)
- Modify: `auth-api/src/services/timesheetRows.js:45-76` (mergeWeekRows)

**Interfaces:**
- Consumes: `Project.name`, `Project.clientName` from the Project model
- Produces: `task.projectName: string`, `task.clientName: string` on each Task in the API response

- [ ] **Step 1: Update the backend route to fetch and attach project names**

In `auth-api/src/routes/timesheets.js`, the `projectIds` array and `billingProjects` query already exist (lines 212-216). Extend that query to also select `name` and `clientName`, and build a lookup map for the task hydration.

Replace lines 212-216:
```js
const projectIds = [...new Set(infoTasks.map((t) => String(t.project)).filter(Boolean))];
const billingProjects = projectIds.length
  ? await Project.find({ _id: { $in: projectIds } }).select('billingType')
  : [];
const billingByProject = new Map(billingProjects.map((p) => [String(p._id), p.billingType === 'billable']));
```

With:
```js
const projectIds = [...new Set(infoTasks.map((t) => String(t.project)).filter(Boolean))];
const projectDocs = projectIds.length
  ? await Project.find({ _id: { $in: projectIds } }).select('name clientName billingType')
  : [];
const billingByProject = new Map(projectDocs.map((p) => [String(p._id), p.billingType === 'billable']));
const projectNameById = new Map(projectDocs.map((p) => [String(p._id), p.name]));
const clientNameById = new Map(projectDocs.map((p) => [String(p._id), p.clientName || '']));
```

- [ ] **Step 2: Pass project/client names into mergeWeekRows**

Update the `taskInfoById` map entries (line 205-210) to include `projectName` and `clientName`:

Replace:
```js
const taskInfoById = new Map(infoTasks.map((t) => [String(t._id), {
  title: t.title, description: t.description || '', percentComplete: t.percentComplete, estimatedHours: t.estimatedHours,
  status: t.status, actualMinutes: actualMap.get(String(t._id)) || 0,
  startDate: t.startDate ? t.startDate.toISOString().slice(0, 10) : null,
  projectId: t.project ? String(t.project) : null,
}]));
```

With:
```js
const taskInfoById = new Map(infoTasks.map((t) => {
  const pid = t.project ? String(t.project) : null;
  return [String(t._id), {
    title: t.title, description: t.description || '', percentComplete: t.percentComplete, estimatedHours: t.estimatedHours,
    status: t.status, actualMinutes: actualMap.get(String(t._id)) || 0,
    startDate: t.startDate ? t.startDate.toISOString().slice(0, 10) : null,
    projectId: pid,
    projectName: pid ? (projectNameById.get(pid) || '') : '',
    clientName: pid ? (clientNameById.get(pid) || '') : '',
  }];
}));
```

- [ ] **Step 3: Update mergeWeekRows to propagate projectName and clientName**

In `auth-api/src/services/timesheetRows.js`, update the linked-task branch of `mergeWeekRows` (line 54-70) to include the new fields:

Add after `projectId: info.projectId || null,` (line 68):
```js
projectName: info.projectName || '',
clientName: info.clientName || '',
```

And in the unlinked (blank) row branch (line 72), add:
```js
projectName: '', clientName: '',
```

- [ ] **Step 4: Update the frontend Task type**

In `web/src/timesheet/timesheetApi.ts`, add to the `Task` type (after `projectId`):
```ts
projectName?: string;
clientName?: string;
```

- [ ] **Step 5: Verify the backend returns the new fields**

Run: Start the dev server and make a GET request to `/timesheets/<current-monday>`.
Expected: Each task object in the response includes `projectName` and `clientName` strings.

- [ ] **Step 6: Commit**

```bash
git add auth-api/src/routes/timesheets.js auth-api/src/services/timesheetRows.js web/src/timesheet/timesheetApi.ts
git commit -m "feat: include projectName and clientName in timesheet task rows"
```

---

### Task 2: Task Identity Column — stacked name / project / client

Replace the flat task name in the left column with a stacked display: task name on top, project name below, client name below that (when present). Blank (non-PM) rows keep their editable name input.

**Files:**
- Modify: `web/src/timesheet/TaskRow.tsx:38-63` (task identity cell)
- Modify: `web/src/styles.css` (add stacked identity styles)

**Interfaces:**
- Consumes: `task.projectName`, `task.clientName`, `task.name` from Task type (Task 1)
- Produces: Visual change only — no new props or exports

- [ ] **Step 1: Update the PM task identity display in TaskRow**

In `web/src/timesheet/TaskRow.tsx`, replace the PM task `<td>` content (lines 41-53):

```tsx
{isPm ? (
  <div>
    <span className="ts-name-ro">{task.name || 'Untitled task'}</span>
    <span className="ts-pm-badge">PM</span>
    {task.status && <StatusBadge status={task.status} />}
    {showDue && task.endDate && (
      <span className={`due-pill ${urgency}`}>{dueLabel(task.endDate, today)}</span>
    )}
    {task.description && <div className="ts-sub">{task.description}</div>}
    <div className="ts-pm-meta">
      Planned {task.estimatedHours ?? 0}h · Actual {((task.actualMinutes ?? 0) / 60).toFixed(1)}h
    </div>
  </div>
```

With:
```tsx
{isPm ? (
  <div className="ts-task-identity">
    <div className="ts-task-identity-top">
      <span className="ts-name-ro">{task.name || 'Untitled task'}</span>
      <span className="ts-pm-badge">PM</span>
      {task.status && <StatusBadge status={task.status} />}
      {showDue && task.endDate && (
        <span className={`due-pill ${urgency}`}>{dueLabel(task.endDate, today)}</span>
      )}
    </div>
    {task.projectName && <div className="ts-task-project">{task.projectName}</div>}
    {task.clientName && <div className="ts-task-client">{task.clientName}</div>}
    {task.description && <div className="ts-sub">{task.description}</div>}
    <div className="ts-pm-meta">
      Planned {task.estimatedHours ?? 0}h · Actual {((task.actualMinutes ?? 0) / 60).toFixed(1)}h
    </div>
  </div>
```

- [ ] **Step 2: Add CSS for the stacked identity**

Append to `web/src/styles.css`:

```css
/* Task identity column — stacked name / project / client */
.ts-task-identity { display: flex; flex-direction: column; gap: 1px; }
.ts-task-identity-top { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.ts-task-project { font-size: 12px; color: var(--muted); font-weight: 500; }
.ts-task-client { font-size: 11px; color: var(--faint); }
```

- [ ] **Step 3: Commit**

```bash
git add web/src/timesheet/TaskRow.tsx web/src/styles.css
git commit -m "feat: stack task name, project, and client in timesheet identity column"
```

---

### Task 3: Attendance Hours Row — pinned read-only row at top of grid

Add a row pinned at the top of the `<tbody>` that shows attendance hours for each day. The data already exists in the `attendance` prop (type `Partial<Record<Day, AttendanceCell>>`). Each cell shows `effectiveMinutes` formatted as time. The attendance icons in the header stay as they are; this is an additional data row.

**Files:**
- Modify: `web/src/timesheet/TimesheetGrid.tsx:139-169` (tbody, before task rows)
- Modify: `web/src/styles.css` (attendance row styles)

**Interfaces:**
- Consumes: `attendance` prop already on TimesheetGrid (type `Partial<Record<Day, AttendanceCell>>`)
- Produces: Visual change only — a new `<tr>` at the top of tbody

- [ ] **Step 1: Add the attendance hours row**

In `web/src/timesheet/TimesheetGrid.tsx`, right after `<tbody>` (line 139), before the empty-state check, add:

```tsx
<tr className="ts-attendance-row">
  <td className="ts-task ts-attendance-label">Attendance</td>
  {DAYS.map((d) => {
    const cell = attendance[d];
    const mins = cell?.effectiveMinutes ?? 0;
    return (
      <td key={d} className="ts-attendance-cell">
        {mins > 0 ? formatMinutes(mins) : '—'}
      </td>
    );
  })}
  <td className="ts-rowtotal"></td>
  <td className="ts-actions"></td>
</tr>
```

- [ ] **Step 2: Add CSS for the attendance row**

Append to `web/src/styles.css`:

```css
/* Attendance hours row — pinned at top of grid */
.ts-attendance-row { background: var(--surface); }
.ts-attendance-row:hover { background: var(--surface) !important; }
.ts-attendance-label { font-size: 12px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; }
.ts-attendance-cell { font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }
```

- [ ] **Step 3: Commit**

```bash
git add web/src/timesheet/TimesheetGrid.tsx web/src/styles.css
git commit -m "feat: add attendance hours row pinned at top of timesheet grid"
```

---

### Task 4: Billable Bar — segmented progress bar above the grid

Add a horizontal bar above the grid showing total logged hours against the weekly target. The bar is split into three color segments: billable (green), non-billable (blue), and time-off (amber). A legend sits beside the bar.

**Files:**
- Create: `web/src/timesheet/BillableBar.tsx`
- Modify: `web/src/timesheet/TimesheetPage.tsx:296-304` (insert BillableBar before SummaryTiles or between SummaryTiles and grid)
- Modify: `web/src/styles.css` (bar styles)

**Interfaces:**
- Consumes: `billableMinutes: number`, `nonBillableMinutes: number`, `targetMinutes: number`, `timeOffMinutes: number` (computed from attendance)
- Produces: `<BillableBar>` component used by TimesheetPage

- [ ] **Step 1: Compute time-off minutes in TimesheetPage**

In `web/src/timesheet/TimesheetPage.tsx`, after the `attendance` resolution (line 102), compute time-off minutes. Time-off means days where attendance status is `leave` or `holiday`:

Add after line 102:
```ts
const timeOffMinutes = DAYS.reduce((sum, d) => {
  const cell = attendance[d];
  if (cell && (cell.status === 'leave' || cell.status === 'holiday')) return sum + (targetMinutes / 5);
  return sum;
}, 0);
```

- [ ] **Step 2: Create BillableBar component**

Create `web/src/timesheet/BillableBar.tsx`:

```tsx
import { formatMinutes } from './time';

type Props = {
  billableMinutes: number;
  nonBillableMinutes: number;
  timeOffMinutes: number;
  targetMinutes: number;
};

export function BillableBar({ billableMinutes, nonBillableMinutes, timeOffMinutes, targetMinutes }: Props) {
  const total = billableMinutes + nonBillableMinutes + timeOffMinutes;
  const cap = Math.max(targetMinutes, total);
  const pctB = cap > 0 ? (billableMinutes / cap) * 100 : 0;
  const pctNB = cap > 0 ? (nonBillableMinutes / cap) * 100 : 0;
  const pctTO = cap > 0 ? (timeOffMinutes / cap) * 100 : 0;

  return (
    <div className="bb-wrap">
      <div className="bb-header">
        <span className="bb-total">{formatMinutes(total)} / {formatMinutes(targetMinutes)}</span>
        <div className="bb-legend">
          <span className="bb-legend-item"><span className="bb-dot bb-dot-billable" /> Billable</span>
          <span className="bb-legend-item"><span className="bb-dot bb-dot-nonbillable" /> Non-billable</span>
          <span className="bb-legend-item"><span className="bb-dot bb-dot-timeoff" /> Time off</span>
        </div>
      </div>
      <div className="bb-track">
        {pctB > 0 && <div className="bb-seg bb-seg-billable" style={{ width: `${pctB}%` }} />}
        {pctNB > 0 && <div className="bb-seg bb-seg-nonbillable" style={{ width: `${pctNB}%` }} />}
        {pctTO > 0 && <div className="bb-seg bb-seg-timeoff" style={{ width: `${pctTO}%` }} />}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add CSS for the billable bar**

Append to `web/src/styles.css`:

```css
/* Billable bar — segmented progress above grid */
.bb-wrap { margin-bottom: 16px; }
.bb-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.bb-total { font-size: 14px; font-weight: 700; color: var(--text); font-variant-numeric: tabular-nums; }
.bb-legend { display: flex; gap: 14px; }
.bb-legend-item { display: flex; align-items: center; gap: 5px; font-size: 12px; color: var(--muted); }
.bb-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
.bb-dot-billable { background: #22c55e; }
.bb-dot-nonbillable { background: #3b82f6; }
.bb-dot-timeoff { background: #f59e0b; }
.bb-track { height: 10px; background: var(--surface-2); border-radius: 5px; display: flex; overflow: hidden; }
.bb-seg { height: 100%; transition: width 0.3s ease; }
.bb-seg-billable { background: #22c55e; }
.bb-seg-nonbillable { background: #3b82f6; }
.bb-seg-timeoff { background: #f59e0b; }
```

- [ ] **Step 4: Render BillableBar in TimesheetPage**

In `web/src/timesheet/TimesheetPage.tsx`, add the import at the top:
```ts
import { BillableBar } from './BillableBar';
```

Then insert the `<BillableBar>` between `<SummaryTiles>` and the load-error/grid section (after line 304):
```tsx
<BillableBar
  billableMinutes={billableMinutes}
  nonBillableMinutes={nonBillableMinutes}
  timeOffMinutes={timeOffMinutes}
  targetMinutes={targetMinutes}
/>
```

- [ ] **Step 5: Commit**

```bash
git add web/src/timesheet/BillableBar.tsx web/src/timesheet/TimesheetPage.tsx web/src/styles.css
git commit -m "feat: add segmented billable bar above timesheet grid"
```

---

### Task 5: Two-Step Task Search — project search then phase/task search

Replace the current add-task menu (flat list + inline create form) with a two-step search-as-you-type flow: first search and pick a project, then search and pick a task/phase under that project. This replaces the entire portaled menu in `TimesheetGrid.tsx`.

**Files:**
- Create: `web/src/timesheet/TaskSearch.tsx`
- Modify: `web/src/timesheet/TimesheetGrid.tsx:179-278` (replace add-task section)
- Modify: `web/src/timesheet/timesheetApi.ts` (add `getProjectTasks` API call)
- Modify: `web/src/styles.css` (search styles)

**Interfaces:**
- Consumes: `projects: ProjectRef[]` (already available), `assignable: Assignable[]`, API `GET /timesheets/tasks?projectId=X`
- Produces: `<TaskSearch>` component, calls `onAddAssigned(a)` or `onAddBlank()` when a selection is made

- [ ] **Step 1: Add backend endpoint for tasks by project**

In `auth-api/src/routes/timesheets.js`, add before the `router.post('/tasks', ...)` route (around line 401):

```js
router.get('/tasks', asyncHandler(async (req, res) => {
  const projectId = req.query.projectId;
  if (!projectId || !mongoose.isValidObjectId(projectId)) return res.status(400).json({ error: 'projectId required' });
  const userId = req.user.sub;
  const tasks = await Task.find({
    project: projectId,
    'assignees.user': userId,
    status: { $ne: 'done' },
  }).select('title description status estimatedHours');
  res.json(tasks.map((t) => ({
    taskId: String(t._id),
    title: t.title,
    description: t.description || '',
    status: t.status,
    estimatedHours: t.estimatedHours || 0,
  })));
}));
```

- [ ] **Step 2: Add frontend API function**

In `web/src/timesheet/timesheetApi.ts`, add:

```ts
export async function getProjectTasks(projectId: string): Promise<Assignable[]> {
  const r = await fetch(`${API}/timesheets/tasks?projectId=${projectId}`, { headers: authHeaders(), credentials: 'include' });
  if (!r.ok) throw new Error(`load failed (${r.status})`);
  const data: Array<{ taskId: string; title: string; description?: string; status: string; estimatedHours: number }> = await r.json();
  return data.map((t) => ({ ...t, projectName: null }));
}
```

- [ ] **Step 3: Create TaskSearch component**

Create `web/src/timesheet/TaskSearch.tsx`:

```tsx
import { useState, useEffect, useRef } from 'react';
import { getProjectTasks } from './timesheetApi';
import type { Assignable, ProjectRef } from './timesheetApi';
import type { Task } from './timesheetApi';

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
  const projectInputRef = useRef<HTMLInputElement>(null);
  const taskInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { projectInputRef.current?.focus(); }, []);

  useEffect(() => {
    if (!selectedProject) { setTasks([]); return; }
    setLoading(true);
    getProjectTasks(selectedProject._id)
      .then((t) => setTasks(t.filter((x) => !existingTaskIds.has(x.taskId))))
      .catch(() => setTasks([]))
      .finally(() => { setLoading(false); setTimeout(() => taskInputRef.current?.focus(), 0); });
  }, [selectedProject, existingTaskIds]);

  const filteredProjects = projects.filter((p) =>
    p.name.toLowerCase().includes(projectQuery.toLowerCase()),
  );

  const filteredTasks = tasks.filter((t) =>
    t.title.toLowerCase().includes(taskQuery.toLowerCase()),
  );

  return (
    <div className="tsk-search">
      <div className="tsk-search-row">
        <div className="tsk-search-col">
          <label className="tsk-search-label">Project</label>
          {selectedProject ? (
            <button className="tsk-search-selected" type="button" onClick={() => { setSelectedProject(null); setTaskQuery(''); }}>
              {selectedProject.name} <span className="tsk-search-clear">×</span>
            </button>
          ) : (
            <>
              <input
                ref={projectInputRef}
                className="input tsk-search-input"
                placeholder="Search projects..."
                value={projectQuery}
                onChange={(e) => setProjectQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
              />
              <div className="tsk-search-list">
                {filteredProjects.map((p) => (
                  <button key={p._id} className="tsk-search-item" type="button" onClick={() => setSelectedProject(p)}>
                    {p.name}
                  </button>
                ))}
                {filteredProjects.length === 0 && <div className="tsk-search-empty">No projects found</div>}
              </div>
            </>
          )}
        </div>
        {selectedProject && (
          <div className="tsk-search-col">
            <label className="tsk-search-label">Phase / Task</label>
            <input
              ref={taskInputRef}
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
              {!loading && tasks.length === 0 && !loading && (
                <div className="tsk-search-empty">No assigned tasks in this project</div>
              )}
            </div>
          </div>
        )}
      </div>
      <div className="tsk-search-foot">
        <button className="tsk-search-blank" type="button" onClick={() => { onAddBlank(); onClose(); }}>
          + Add without a task (meetings, admin...)
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Replace the add-task menu in TimesheetGrid**

In `web/src/timesheet/TimesheetGrid.tsx`:

Add import at top:
```ts
import { TaskSearch } from './TaskSearch';
```

Replace the entire `{!readOnly && (` block (lines 179-278) with:

```tsx
{!readOnly && (
  <div className="ts-card-foot">
    <div className="ts-add-wrap">
      <button
        ref={triggerRef}
        className="ts-add"
        type="button"
        aria-haspopup="dialog"
        aria-expanded={pickerOpen}
        onClick={() => setPickerOpen((o) => !o)}
      >
        + Add a task
      </button>
      {pickerOpen && createPortal(
        <>
          <div className="ts-add-backdrop" onClick={() => setPickerOpen(false)} />
          <div
            className="ts-add-menu tsk-search-menu"
            style={{ left: place?.left, top: place?.top ?? undefined, bottom: place?.bottom ?? undefined }}
          >
            <TaskSearch
              projects={projects || []}
              existingTaskIds={new Set(tasks.filter((t) => t.taskId).map((t) => String(t.taskId)))}
              onSelect={(a) => { onAddAssigned(a); setPickerOpen(false); }}
              onAddBlank={() => { onAddBlank(); setPickerOpen(false); }}
              onClose={() => setPickerOpen(false)}
            />
          </div>
        </>,
        document.body,
      )}
    </div>
  </div>
)}
```

Remove the now-unused state variables and imports: `createMode`, `newTitle`, `newProjectId`, `creating`, the `createTimesheetTask` import, and the `addableTasks` import + `addable` variable. Also remove the `addRow` import if no longer used (keep `addableTasks` if still referenced elsewhere — check first).

The `place` calculation and escape-key handler stay as they are. Update `ADD_MENU_WIDTH` to `420` to accommodate the two-column layout.

- [ ] **Step 5: Add CSS for the task search**

Append to `web/src/styles.css`:

```css
/* Two-step task search */
.tsk-search-menu { min-width: 420px; }
.tsk-search { padding: 8px; }
.tsk-search-row { display: flex; gap: 8px; }
.tsk-search-col { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.tsk-search-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); }
.tsk-search-input { width: 100%; font-size: 13px; padding: 6px 8px; }
.tsk-search-list { max-height: 200px; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; }
.tsk-search-item { display: flex; flex-direction: column; gap: 1px; background: none; border: none; padding: 6px 8px; border-radius: var(--radius-sm); cursor: pointer; text-align: left; width: 100%; color: var(--text); }
.tsk-search-item:hover { background: var(--surface); }
.tsk-search-item-title { font-size: 13px; font-weight: 600; }
.tsk-search-item-meta { font-size: 11px; color: var(--muted); }
.tsk-search-empty { font-size: 12px; color: var(--muted); padding: 8px; }
.tsk-search-selected { display: flex; align-items: center; gap: 6px; background: var(--primary-soft); border: 1px solid var(--primary); border-radius: var(--radius-sm); padding: 6px 8px; font-size: 13px; font-weight: 600; color: var(--text); cursor: pointer; width: 100%; }
.tsk-search-selected:hover { background: var(--surface); }
.tsk-search-clear { color: var(--muted); font-size: 16px; margin-left: auto; }
.tsk-search-foot { border-top: 1px solid var(--border); margin-top: 8px; padding-top: 8px; }
.tsk-search-blank { background: none; border: none; font-size: 13px; color: var(--muted); cursor: pointer; padding: 6px 8px; border-radius: var(--radius-sm); width: 100%; text-align: left; }
.tsk-search-blank:hover { background: var(--surface); color: var(--text); }
```

- [ ] **Step 6: Commit**

```bash
git add auth-api/src/routes/timesheets.js web/src/timesheet/timesheetApi.ts web/src/timesheet/TaskSearch.tsx web/src/timesheet/TimesheetGrid.tsx web/src/styles.css
git commit -m "feat: replace add-task menu with two-step project/task search"
```

---

### Task 6: Comment Summary Panel — notes collected below the grid

Add a panel below the grid that collects all per-cell notes for the week, grouped by project (then by task). Only tasks/days with notes appear.

**Files:**
- Create: `web/src/timesheet/CommentSummary.tsx`
- Modify: `web/src/timesheet/TimesheetPage.tsx` (insert below grid, before AttachmentBar)
- Modify: `web/src/styles.css` (panel styles)

**Interfaces:**
- Consumes: `tasks: Task[]` from TimesheetPage state
- Produces: `<CommentSummary>` component

- [ ] **Step 1: Create CommentSummary component**

Create `web/src/timesheet/CommentSummary.tsx`:

```tsx
import { DAYS, DAY_LABELS } from './time';
import type { Task } from './timesheetApi';

type Props = {
  tasks: Task[];
};

type NoteEntry = { taskName: string; day: string; note: string };
type ProjectGroup = { projectName: string; entries: NoteEntry[] };

export function CommentSummary({ tasks }: Props) {
  const groups: ProjectGroup[] = [];
  const byProject = new Map<string, NoteEntry[]>();

  for (const t of tasks) {
    for (const d of DAYS) {
      const note = t.notes?.[d];
      if (!note) continue;
      const key = t.projectName || 'Other';
      if (!byProject.has(key)) byProject.set(key, []);
      byProject.get(key)!.push({ taskName: t.name || 'Untitled', day: DAY_LABELS[d], note });
    }
  }

  for (const [projectName, entries] of byProject) {
    groups.push({ projectName, entries });
  }

  if (groups.length === 0) return null;

  return (
    <div className="cs-panel">
      <h3 className="cs-title">Notes</h3>
      {groups.map((g) => (
        <div key={g.projectName} className="cs-group">
          <div className="cs-project">{g.projectName}</div>
          {g.entries.map((e, i) => (
            <div key={i} className="cs-entry">
              <span className="cs-entry-meta">{e.taskName} · {e.day}</span>
              <span className="cs-entry-note">{e.note}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Add CSS for the comment summary**

Append to `web/src/styles.css`:

```css
/* Comment summary panel */
.cs-panel { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; margin-top: 16px; box-shadow: var(--shadow-card); }
.cs-title { margin: 0 0 12px; font-size: 14px; font-weight: 700; color: var(--text); }
.cs-group { margin-bottom: 12px; }
.cs-group:last-child { margin-bottom: 0; }
.cs-project { font-size: 12px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 6px; }
.cs-entry { display: flex; flex-direction: column; gap: 1px; padding: 4px 0; border-bottom: 1px solid var(--border); }
.cs-entry:last-child { border-bottom: none; }
.cs-entry-meta { font-size: 11px; color: var(--faint); }
.cs-entry-note { font-size: 13px; color: var(--text); white-space: pre-wrap; }
```

- [ ] **Step 3: Render CommentSummary in TimesheetPage**

In `web/src/timesheet/TimesheetPage.tsx`, add the import:
```ts
import { CommentSummary } from './CommentSummary';
```

Insert `<CommentSummary tasks={tasks} />` between the `</TimesheetGrid>` closing and `<AttachmentBar>` (after line 333):

```tsx
<CommentSummary tasks={tasks} />
```

- [ ] **Step 4: Commit**

```bash
git add web/src/timesheet/CommentSummary.tsx web/src/timesheet/TimesheetPage.tsx web/src/styles.css
git commit -m "feat: add comment summary panel below timesheet grid"
```

---

### Task 7: Day Cell Layout Polish and Daily-Total Column Fix

Verify and adjust the day cell layout to ensure the three elements stack correctly: hours input on top, note link beneath, billable toggle below that. Also ensure the daily-total footer row includes a week grand total in the task-total column.

**Files:**
- Modify: `web/src/timesheet/TaskRow.tsx:65-110` (cell layout order)
- Modify: `web/src/timesheet/TimesheetGrid.tsx:171-177` (footer totals)
- Modify: `web/src/styles.css` (cell stacking styles)

**Interfaces:**
- Consumes: Existing props — no new data
- Produces: Visual adjustment only

- [ ] **Step 1: Reorder cell elements in TaskRow**

In `web/src/timesheet/TaskRow.tsx`, the current cell renders: `<TimeCell>`, then `request` button, then `$` billable button. The `TimeCell` already renders the input and note icon internally. The billable toggle should be visually below the note icon. The current layout is already correct in DOM order (TimeCell contains input+note, then billable below). Verify by checking that `.ts-cell` has `display: flex; flex-direction: column` or equivalent.

Add to `web/src/styles.css` if not already present:

```css
/* Day cell stacking — input, note, billable */
td.ts-cell { vertical-align: top; }
.ts-cell-wrap { display: flex; flex-direction: column; align-items: center; gap: 2px; }
```

- [ ] **Step 2: Add week grand total to footer**

In `web/src/timesheet/TimesheetGrid.tsx`, the footer row (lines 171-177) currently has empty `<td>` for the total and actions columns. Add the grand total:

Replace:
```tsx
<td></td><td></td>
```

With:
```tsx
<td className="ts-rowtotal">{formatMinutes(DAYS.reduce((sum, d) => sum + dayTotal(d), 0))}</td>
<td></td>
```

- [ ] **Step 3: Commit**

```bash
git add web/src/timesheet/TaskRow.tsx web/src/timesheet/TimesheetGrid.tsx web/src/styles.css
git commit -m "feat: polish day cell stacking and add grand total to footer"
```
