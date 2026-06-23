# Per-Cell Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional text notes to each timesheet cell (task × day), stored as a parallel `notes` field and accessed via a click-triggered popover.

**Architecture:** A new `notes` record (`Record<Day, string>`) lives alongside `entries` on each task row. The backend schema mirrors this structure. A `NotePopover` component (portaled, positioned with the existing `popoverPosition` utility) provides the editing UI. Notes follow the same cell-locking rules as minutes.

**Tech Stack:** React (frontend), Mongoose/Express (backend), Node test runner (tests)

## Global Constraints

- Notes max length: 500 characters per cell
- Notes are always optional — never block submission
- Notes follow identical editability rules as minutes (cell lock, grants, read-only weeks)
- No migration needed — missing `notes` defaults to `{}`
- Copy-last-week clears notes (they're week-specific context)
- Test runner: `node --test` (Node built-in test runner, not Jest/Vitest)

---

### Task 1: Backend — Add notes to schema and sanitize

**Files:**
- Modify: `auth-api/src/models/Timesheet.js`
- Modify: `auth-api/src/services/timesheetRows.js`
- Modify: `auth-api/test/timesheetRows.test.js`

**Interfaces:**
- Produces: `sanitizeRows` now returns rows with `notes: { mon: '', ... }`. `mergeWeekRows` passes `notes` through. `computeRowLock` enforces lock rules on notes.

- [ ] **Step 1: Write failing tests for notes in sanitizeRows**

Add to `auth-api/test/timesheetRows.test.js`:

```js
test('sanitizeRows: sanitizes notes — trims, caps at 500 chars, defaults missing to empty', () => {
  const rows = sanitizeRows(
    [
      { id: 'x', name: 'A', taskId: 't1', entries: { mon: 60 }, notes: { mon: '  hello  ', tue: 'a'.repeat(600) } },
      { id: 'y', name: 'B', entries: {}, notes: null },
      { id: 'z', name: 'C', entries: {} },
    ],
    ['t1'],
  );
  assert.equal(rows[0].notes.mon, 'hello');
  assert.equal(rows[0].notes.tue.length, 500);
  assert.equal(rows[0].notes.wed, '');
  assert.equal(rows[1].notes.mon, '');
  assert.equal(rows[2].notes.mon, '');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd auth-api && node --test test/timesheetRows.test.js`
Expected: FAIL — `rows[0].notes` is undefined

- [ ] **Step 3: Update sanitizeRows to handle notes**

In `auth-api/src/services/timesheetRows.js`, update `sanitizeRows`:

```js
function notesOf(row) {
  const n = (row && row.notes) || {};
  const out = {};
  for (const d of DAYS) {
    const raw = n[d];
    out[d] = typeof raw === 'string' ? raw.trim().slice(0, 500) : '';
  }
  return out;
}

export function sanitizeRows(rows, allowedTaskIds) {
  if (!Array.isArray(rows)) return [];
  const allowed = new Set((allowedTaskIds || []).map(String));
  return rows.map((t) => {
    const entries = {};
    for (const day of DAYS) entries[day] = cleanMinutes(t?.entries?.[day]);
    const taskId = t?.taskId && allowed.has(String(t.taskId)) ? String(t.taskId) : null;
    const notes = notesOf(t);
    return { id: String(t?.id ?? ''), name: String(t?.name ?? ''), entries, taskId, notes };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd auth-api && node --test test/timesheetRows.test.js`
Expected: All tests PASS

- [ ] **Step 5: Write failing tests for notes in mergeWeekRows**

```js
test('mergeWeekRows: passes notes through from saved rows', () => {
  const saved = [{ id: 'a', name: 'Email', taskId: null, entries: z, notes: { mon: 'standup', tue: '', wed: '', thu: '', fri: '' } }];
  const rows = mergeWeekRows({ savedRows: saved, taskInfoById: new Map() });
  assert.equal(rows[0].notes.mon, 'standup');
  assert.equal(rows[0].notes.tue, '');
});

test('mergeWeekRows: defaults missing notes to empty strings', () => {
  const saved = [{ id: 'a', name: 'Email', taskId: null, entries: z }];
  const rows = mergeWeekRows({ savedRows: saved, taskInfoById: new Map() });
  assert.equal(rows[0].notes.mon, '');
  assert.equal(rows[0].notes.fri, '');
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `cd auth-api && node --test test/timesheetRows.test.js`
Expected: FAIL — `rows[0].notes` is undefined

- [ ] **Step 7: Update mergeWeekRows to pass notes through**

In `mergeWeekRows`, add a `notesOf` helper (reuse the one from sanitize, or inline). Update both the linked-row and ad-hoc-row branches:

```js
function emptyNotes() {
  const out = {};
  for (const d of DAYS) out[d] = '';
  return out;
}

function savedNotes(row) {
  const n = (row && row.notes) || {};
  const out = {};
  for (const d of DAYS) out[d] = typeof n[d] === 'string' ? n[d] : '';
  return out;
}
```

In the linked-row branch of `mergeWeekRows`, add `notes: savedNotes(r)` to the output object. In the ad-hoc branch, add `notes: savedNotes(r)`.

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd auth-api && node --test test/timesheetRows.test.js`
Expected: All PASS

- [ ] **Step 9: Write failing tests for notes in computeRowLock**

```js
test('computeRowLock: notes follow the same lock rules as minutes', () => {
  const submitted = [{ id: 'r1', name: 'A', taskId: 't1',
    entries: { mon: 60, tue: 0, wed: 60, thu: 0, fri: 0 },
    notes: { mon: 'new mon', tue: '', wed: 'new wed', thu: '', fri: 'new fri' } }];
  const saved = [{ id: 'r1', name: 'A', taskId: 't1',
    entries: { mon: 30, tue: 0, wed: 0, thu: 0, fri: 0 },
    notes: { mon: 'old mon', tue: '', wed: '', thu: '', fri: 'old fri' } }];
  const taskProjectById = new Map([['t1', 'pA']]);
  const { rows } = computeRowLock({ submittedRows: submitted, savedRows: saved, taskProjectById, todayDay: 'wed', grants: [] });
  assert.equal(rows[0].notes.mon, 'new mon');  // editable (before today)
  assert.equal(rows[0].notes.wed, 'new wed');  // editable (today)
  assert.equal(rows[0].notes.fri, 'old fri');  // locked (future) — keeps saved value
});
```

- [ ] **Step 10: Run test to verify it fails**

Run: `cd auth-api && node --test test/timesheetRows.test.js`
Expected: FAIL — `rows[0].notes` is undefined

- [ ] **Step 11: Update computeRowLock to enforce lock rules on notes**

In `computeRowLock`, update the row-mapping function to apply the same editability check to notes:

```js
const rows = (submittedRows || []).map((r) => {
  const prev = savedById.get(String(r.id));
  const projectId = projectOf(r);
  const startDate = startOf(r);
  const entries = {};
  const notes = {};
  for (const d of DAYS) {
    const editable = editableFor(projectId, d, startDate);
    entries[d] = editable
      ? cleanMinutes(r?.entries?.[d])
      : cleanMinutes(prev?.entries?.[d]);
    const subNote = typeof r?.notes?.[d] === 'string' ? r.notes[d] : '';
    const prevNote = typeof prev?.notes?.[d] === 'string' ? prev.notes[d] : '';
    notes[d] = editable ? subNote : prevNote;
  }
  return { ...r, entries, notes };
});
```

- [ ] **Step 12: Run all tests to verify they pass**

Run: `cd auth-api && node --test test/timesheetRows.test.js`
Expected: All PASS

- [ ] **Step 13: Add notesSchema to the Mongoose model**

In `auth-api/src/models/Timesheet.js`, add:

```js
const notesSchema = new mongoose.Schema(
  {
    mon: { type: String, default: '' },
    tue: { type: String, default: '' },
    wed: { type: String, default: '' },
    thu: { type: String, default: '' },
    fri: { type: String, default: '' },
  },
  { _id: false }
);
```

And add to `taskSchema`:

```js
notes: { type: notesSchema, default: () => ({}) },
```

- [ ] **Step 14: Update GET route to include notes in response**

In `auth-api/src/routes/timesheets.js`, update the `savedRows` mapping in the GET handler to include notes:

```js
const savedRows = doc
  ? doc.tasks.map((t) => ({
      id: t.id, name: t.name, entries: t.entries,
      taskId: t.taskId ? String(t.taskId) : null,
      notes: t.notes || {},
    }))
  : [];
```

- [ ] **Step 15: Commit backend changes**

```bash
git add auth-api/src/models/Timesheet.js auth-api/src/services/timesheetRows.js auth-api/src/routes/timesheets.js auth-api/test/timesheetRows.test.js
git commit -m "feat(api): add per-cell notes to timesheet schema, sanitize, and lock rules"
```

---

### Task 2: Frontend — Types, state, and data flow

**Files:**
- Modify: `web/src/timesheet/timesheetApi.ts`
- Modify: `web/src/timesheet/addRow.ts`
- Modify: `web/src/timesheet/addRow.test.ts`
- Modify: `web/src/timesheet/TimesheetPage.tsx`
- Modify: `web/src/timesheet/TimesheetGrid.tsx`
- Modify: `web/src/timesheet/TaskRow.tsx`

**Interfaces:**
- Consumes: Backend now returns `notes` on each task row.
- Produces: `Task.notes` field, `onNoteChange(taskId, day, text)` callback threaded through Grid → Row → TimeCell.

- [ ] **Step 1: Add Notes type and update Task type**

In `web/src/timesheet/timesheetApi.ts`, add:

```ts
export type Notes = Record<Day, string>;
```

Add `notes` to the `Task` type:

```ts
export type Task = {
  id: string;
  name: string;
  description?: string;
  entries: Entries;
  notes: Notes;  // NEW
  taskId?: string | null;
  locked?: boolean;
  percentComplete?: number;
  estimatedHours?: number;
  actualMinutes?: number;
  status?: string;
  startDate?: string | null;
  endDate?: string | null;
  projectId?: string | null;
};
```

In `getWeek`, ensure notes are included when mapping tasks. The existing `data.tasks as Task[]` cast handles it since the backend now returns notes.

- [ ] **Step 2: Update addRow to include empty notes**

In `web/src/timesheet/addRow.ts`, add a `zeroNotes` helper:

```ts
import type { Task, Entries, Assignable, Notes } from './timesheetApi';

function zeroNotes(): Notes {
  const n = {} as Notes;
  DAYS.forEach((d) => { n[d] = ''; });
  return n;
}
```

Add `notes: zeroNotes()` to both `blankRow` and `rowFromAssignable` return values.

- [ ] **Step 3: Update addRow tests**

In `web/src/timesheet/addRow.test.ts`, add assertions:

```ts
test('blankRow: includes empty notes for each day', () => {
  const r = blankRow('Standup');
  assert.deepEqual(r.notes, { mon: '', tue: '', wed: '', thu: '', fri: '' });
});

test('rowFromAssignable: includes empty notes for each day', () => {
  const r = rowFromAssignable({ taskId: 't1', title: 'Build API', projectName: 'P', status: 'in_progress', estimatedHours: 8 });
  assert.deepEqual(r.notes, { mon: '', tue: '', wed: '', thu: '', fri: '' });
});
```

- [ ] **Step 4: Run addRow tests**

Run: `cd web && node --test src/timesheet/addRow.test.ts`
Expected: All PASS

- [ ] **Step 5: Add onNoteChange handler to TimesheetPage**

In `web/src/timesheet/TimesheetPage.tsx`, add:

```ts
const onNoteChange = (id: string, day: Day, text: string) =>
  update(tasks.map((t) => (t.id === id ? { ...t, notes: { ...t.notes, [day]: text } } : t)));
```

Update the `newTask` helper to include notes:

```ts
function newTask(name = ''): Task {
  const entries = {} as Entries;
  DAYS.forEach((d) => { entries[d] = 0; });
  const notes = {} as Record<Day, string>;
  DAYS.forEach((d) => { notes[d] = ''; });
  return { id: crypto.randomUUID(), name, entries, notes };
}
```

In `onCopyLastWeek`, clear notes when copying:

```ts
update(prev.tasks.map((t) => newTask(t.name)));
```

This already creates fresh tasks with empty notes via `newTask`, so no change needed — just confirming the behavior.

Pass `onNoteChange` to `TimesheetGrid`:

```tsx
<TimesheetGrid
  // ... existing props ...
  onNoteChange={onNoteChange}
/>
```

- [ ] **Step 6: Thread onNoteChange through TimesheetGrid**

In `web/src/timesheet/TimesheetGrid.tsx`, add to Props:

```ts
onNoteChange: (taskId: string, day: Day, text: string) => void;
```

Destructure it in the component. Pass to each `TaskRow`:

```tsx
<TaskRow
  key={t.id}
  // ... existing props ...
  onNoteChange={(day, text) => onNoteChange(t.id, day, text)}
/>
```

- [ ] **Step 7: Thread notes through TaskRow to TimeCell**

In `web/src/timesheet/TaskRow.tsx`, add to Props:

```ts
onNoteChange: (day: Day, text: string) => void;
```

In each day's `<td>`, pass note data to `TimeCell`:

```tsx
<TimeCell
  className={isToday ? 'ts-cell-today' : ''}
  minutes={task.entries[d] || 0}
  note={task.notes?.[d] || ''}
  readOnly={!editable}
  onChange={(m) => onCellChange(d, m)}
  onNoteChange={(text) => onNoteChange(d, text)}
/>
```

- [ ] **Step 8: Commit frontend data flow**

```bash
git add web/src/timesheet/timesheetApi.ts web/src/timesheet/addRow.ts web/src/timesheet/addRow.test.ts web/src/timesheet/TimesheetPage.tsx web/src/timesheet/TimesheetGrid.tsx web/src/timesheet/TaskRow.tsx
git commit -m "feat(web): thread per-cell notes through timesheet data flow"
```

---

### Task 3: Frontend — NotePopover component and TimeCell integration

**Files:**
- Create: `web/src/timesheet/NotePopover.tsx`
- Modify: `web/src/timesheet/TimeCell.tsx`
- Modify: `web/src/styles.css`

**Interfaces:**
- Consumes: `note: string`, `onNoteChange: (text: string) => void`, `readOnly: boolean` from TaskRow via TimeCell props.
- Produces: `NotePopover` component rendered inside TimeCell.

- [ ] **Step 1: Create NotePopover component**

Create `web/src/timesheet/NotePopover.tsx`:

```tsx
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { popoverPosition, type Placement } from '../pm/popoverPosition';

const POP_WIDTH = 240;
const POP_HEIGHT = 160;

type Props = {
  note: string;
  readOnly: boolean;
  onChange: (text: string) => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
};

export function NotePopover({ note, readOnly, onChange, onClose, anchorRef }: Props) {
  const [place, setPlace] = useState<Placement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useLayoutEffect(() => {
    if (!anchorRef.current) return;
    const r = anchorRef.current.getBoundingClientRect();
    setPlace(popoverPosition(
      { left: r.left, top: r.top, bottom: r.bottom, width: r.width },
      { width: window.innerWidth, height: window.innerHeight },
      POP_HEIGHT, POP_WIDTH,
    ));
  }, [anchorRef]);

  useEffect(() => {
    if (!readOnly) textareaRef.current?.focus();
  }, [readOnly]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!place) return null;

  return createPortal(
    <>
      <div className="note-pop-backdrop" onClick={onClose} />
      <div
        className="note-pop"
        style={{ left: place.left, top: place.top ?? undefined, bottom: place.bottom ?? undefined }}
      >
        {readOnly ? (
          <p className="note-pop-text">{note || 'No note.'}</p>
        ) : (
          <textarea
            ref={textareaRef}
            className="note-pop-input"
            placeholder="Add a note…"
            maxLength={500}
            value={note}
            onChange={(e) => onChange(e.target.value)}
          />
        )}
      </div>
    </>,
    document.body,
  );
}
```

- [ ] **Step 2: Update TimeCell to accept note props and render icon + popover**

Replace `web/src/timesheet/TimeCell.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import { parseTimeInput, formatMinutes } from './time';
import { NotePopover } from './NotePopover';

type Props = {
  minutes: number;
  onChange: (minutes: number) => void;
  note?: string;
  onNoteChange?: (text: string) => void;
  readOnly?: boolean;
  className?: string;
};

export function TimeCell({ minutes, onChange, note = '', onNoteChange, readOnly = false, className = '' }: Props) {
  const display = minutes > 0 ? formatMinutes(minutes) : '';
  const [text, setText] = useState(display);
  const [editing, setEditing] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const cellRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!editing) setText(display);
  }, [display, editing]);

  function commit() {
    const parsed = parseTimeInput(text);
    setEditing(false);
    setText(parsed > 0 ? formatMinutes(parsed) : '');
    if (parsed !== minutes) onChange(parsed);
  }

  const hasNote = note.length > 0;

  if (readOnly) {
    return (
      <div ref={cellRef} className="ts-cell-wrap">
        <span className={`ts-cell-ro${minutes > 0 ? '' : ' ts-cell-ro-empty'}`}>{display || '—'}</span>
        {hasNote && (
          <button className="note-icon note-icon-filled" type="button" aria-label="View note" onClick={() => setNoteOpen(true)}>🗒</button>
        )}
        {noteOpen && (
          <NotePopover note={note} readOnly onChange={() => {}} onClose={() => setNoteOpen(false)} anchorRef={cellRef} />
        )}
      </div>
    );
  }

  return (
    <div ref={cellRef} className="ts-cell-wrap">
      <input
        className={`ts-cell${className ? ` ${className}` : ''}`}
        inputMode="text"
        placeholder="—"
        value={text}
        onFocus={() => setEditing(true)}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      />
      <button
        className={`note-icon${hasNote ? ' note-icon-filled' : ''}`}
        type="button"
        aria-label={hasNote ? 'Edit note' : 'Add note'}
        onClick={() => setNoteOpen(true)}
      >
        🗒
      </button>
      {noteOpen && onNoteChange && (
        <NotePopover note={note} readOnly={false} onChange={onNoteChange} onClose={() => setNoteOpen(false)} anchorRef={cellRef} />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Add CSS for NotePopover and note icon**

Append to `web/src/styles.css`:

```css
/* --- Per-cell notes --- */
.ts-cell-wrap { position: relative; display: inline-flex; align-items: center; gap: 2px; }
.note-icon { background: none; border: none; cursor: pointer; font-size: 11px; padding: 0 2px; opacity: 0; transition: opacity 0.12s; color: var(--faint); line-height: 1; }
.ts-cell-wrap:hover .note-icon, .note-icon:focus, .note-icon-filled { opacity: 1; }
.note-icon-filled { color: var(--primary); opacity: 0.8; }
.note-pop-backdrop { position: fixed; inset: 0; z-index: 999; }
.note-pop { position: fixed; z-index: 1000; width: 240px; background: var(--card); border: 1px solid var(--border-strong); border-radius: var(--radius); box-shadow: var(--shadow-lg); padding: 8px; }
.note-pop-input { width: 100%; min-height: 80px; resize: vertical; border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 6px 8px; font-size: 13px; font-family: inherit; background: var(--card); color: var(--text); }
.note-pop-input:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px var(--ring); }
.note-pop-text { font-size: 13px; color: var(--text); margin: 0; white-space: pre-wrap; }
```

- [ ] **Step 4: Test in browser**

Run the dev server (`npm run dev` in `web/`), open the timesheet page:
1. Hover over a cell — note icon appears
2. Click it — popover opens with textarea
3. Type a note, click outside — popover closes, icon stays filled
4. Navigate away and back — note persists after save
5. View a read-only week — filled icons show, clicking shows read-only text
6. Check a cell with no note in read-only mode — no icon visible

- [ ] **Step 5: Commit NotePopover and TimeCell changes**

```bash
git add web/src/timesheet/NotePopover.tsx web/src/timesheet/TimeCell.tsx web/src/styles.css
git commit -m "feat(web): add NotePopover component and note icon in TimeCell"
```

---
