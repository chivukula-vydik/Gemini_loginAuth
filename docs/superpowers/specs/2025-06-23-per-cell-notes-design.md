# Per-Cell Notes — Design Spec

## Summary

Add optional text notes to each cell (task × day) in the timesheet grid. Notes
are accessed via a popover triggered by clicking a note icon in the cell.
Cells with existing notes show a filled icon indicator.

## Interaction

- Every cell (regardless of hours) shows a small note icon on hover or when
  the cell has a note.
- Clicking the icon opens a popover anchored to the cell with a textarea.
- The popover saves on blur (same debounce as hours — immediate setState,
  500ms auto-save to server).
- Cells with a non-empty note display a filled/dot indicator permanently.
- Read-only weeks: clicking shows the note in a read-only popover (no
  textarea, just text).
- Notes are always optional — never block submission.

## Data Model

### Frontend (`timesheetApi.ts`)

Add a `notes` field to the `Task` type, parallel to `entries`:

```ts
export type Notes = Record<Day, string>;
export type Task = {
  // ... existing fields ...
  entries: Entries;
  notes: Notes;        // NEW
};
```

### Backend (`Timesheet.js`)

Add a `notesSchema` to `taskSchema`, parallel to `entriesSchema`:

```js
const notesSchema = new mongoose.Schema(
  { mon: { type: String, default: '' }, tue: { type: String, default: '' },
    wed: { type: String, default: '' }, thu: { type: String, default: '' },
    fri: { type: String, default: '' } },
  { _id: false }
);

// inside taskSchema:
notes: { type: notesSchema, default: () => ({}) },
```

No migration needed — existing docs without `notes` default to `{}`, and the
frontend treats missing/undefined notes as empty strings.

## Components

### New: `NotePopover.tsx`

Props:
- `note: string` — current note text
- `readOnly: boolean`
- `onChange: (text: string) => void` — called on every keystroke
- `onClose: () => void`
- `anchorRect: DOMRect` — positioning anchor

Uses `popoverPosition` (already in the codebase) for placement. Portaled to
`document.body` like the add-task menu. Closes on Escape, outside click, or
blur.

### Modified: `TimeCell.tsx`

- Accepts new props: `note: string`, `onNoteChange: (text: string) => void`,
  `readOnly: boolean` (already has this).
- Renders a note icon button next to the time input.
- Icon states: hidden (no note, not hovered), outline (hovered, no note),
  filled (has note).
- Clicking the icon toggles `NotePopover`.

### Modified: `TaskRow.tsx`

- Passes `task.notes[day]` and `onNoteChange` callback to each `TimeCell`.

### Modified: `TimesheetGrid.tsx`

- Passes `onNoteChange(taskId, day, text)` through to `TaskRow`.

### Modified: `TimesheetPage.tsx`

- New handler: `onNoteChange(id, day, text)` — updates task state (same
  pattern as `onCellChange`).
- The existing auto-save effect already watches `tasks` — note changes trigger
  it automatically.

## Backend Changes

### `timesheetRows.js`

- `sanitizeRows`: add note sanitization — `String(note).slice(0, 500).trim()`
  per day. Max 500 chars per note.
- `mergeWeekRows`: pass `notes` through from saved rows.
- `computeRowLock`: apply the same editability rules to notes. If a day's
  minutes are locked, its note is also locked (use saved value).

### `routes/timesheets.js`

- GET handler: include `notes` in the response (already flows through
  `mergeWeekRows`).
- PUT handler: `sanitizeRows` already processes incoming rows — just extend it
  to include `notes`.

## Edge Cases

- **Empty notes**: stored as empty string, not null. Frontend treats
  `undefined` and `''` the same (no indicator shown).
- **Copy last week**: copies task rows but clears notes (notes are
  week-specific context, not recurring).
- **Cell locking**: notes follow the same lock rules as minutes. If a cell is
  read-only, its note is read-only.
- **Long notes**: capped at 500 characters in `sanitizeRows`. Frontend
  textarea gets `maxLength={500}`.

## Files Changed

| File | Change |
|---|---|
| `web/src/timesheet/NotePopover.tsx` | New component |
| `web/src/timesheet/TimeCell.tsx` | Add note icon + popover trigger |
| `web/src/timesheet/TaskRow.tsx` | Pass notes to TimeCell |
| `web/src/timesheet/TimesheetGrid.tsx` | Thread onNoteChange |
| `web/src/timesheet/TimesheetPage.tsx` | Add onNoteChange handler |
| `web/src/timesheet/timesheetApi.ts` | Add Notes type to Task |
| `web/src/timesheet/addRow.ts` | Include empty notes in new rows |
| `web/src/styles.css` | Popover + icon styles |
| `auth-api/src/models/Timesheet.js` | Add notesSchema |
| `auth-api/src/services/timesheetRows.js` | Sanitize + lock notes |
| `auth-api/src/routes/timesheets.js` | Pass notes in GET/PUT |
