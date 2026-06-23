# Timesheet Feature Batch — Design Spec

## Summary

Eight features completing the Keka PSA gap list: status badges, rejection
reasons, comment summary, weekly hour target, daily submission, inline task
creation, and file attachments.

---

## 1. Status Badge on Task Rows (#17)

Render the existing `StatusBadge` component from `web/src/pm/StatusBadge.tsx`
on each PM-linked task row in the timesheet grid.

- Only shown for rows with `task.taskId` (PM-linked tasks).
- Placed next to the existing `PM` badge in `TaskRow.tsx`.
- No backend changes — `task.status` is already returned.

---

## 2. Rejection Reasons (#11)

### Backend

Add to `Timesheet` schema (week-level, later migrated to per-day in #5):

```
rejectionReason: { type: String, default: '' }
```

`PATCH /timesheets/review/:id`:
- When `decision === 'return'`, accept optional `reason: String` in the
  request body. Store in `rejectionReason`. Trim, cap at 1000 chars.
- When `decision === 'approve'`, clear `rejectionReason` to `''`.

`GET /timesheets/:weekStart` response: include `rejectionReason`.

### Frontend

- When `submitStatus === 'returned'` and `rejectionReason` is non-empty,
  show the reason in the returned banner.
- PM review page: add a textarea for entering the reason when returning a
  timesheet. Required — PM must give a reason.

---

## 3. Comment Summary View (#13)

A read-only panel showing aggregated per-cell notes for a submitted
timesheet. Aimed at managers reviewing timesheets.

### Backend

New endpoint: `GET /timesheets/review/:id/notes`

Returns a flat list:

```json
[
  { "taskName": "Build API", "day": "mon", "minutes": 150, "note": "Fixed auth bug" },
  ...
]
```

Only returns cells where `note` is non-empty. Requires `pm` or `admin` role.

### Frontend

New `CommentSummary` component. Rendered in the PM review detail view (when
a PM clicks into a submitted timesheet). Table layout:

| Task | Day | Hours | Note |
|---|---|---|---|
| Build API | Mon | 2:30 | Fixed auth bug |

---

## 4. Weekly Hour Target + Progress Bar (#16)

### Backend

Add to User model:

```
weeklyTargetMinutes: { type: Number, default: null }
```

`null` = use org default. Org default is 2400 minutes (40 hours), stored in
config (`auth.config.json` or env var `WEEKLY_TARGET_MINUTES`).

New endpoints:
- `GET /profile/target` → `{ targetMinutes: number }` (resolved value)
- `PATCH /profile/target` → `{ weeklyTargetMinutes: number | null }` (set
  or clear override)

`GET /timesheets/:weekStart` response: include `targetMinutes` (resolved
per-user value).

### Frontend

Update `SummaryTiles`:
- "This week" tile shows `8:00 / 40:00` format with a progress bar
  (percentage fill).
- Progress bar color: green when under target, amber at 90-100%, red over.
- If no target configured, show just the total (current behavior).

---

## 5. Daily Submission (#9 + #18)

The largest feature. Moves from week-level to day-level submission status.

### Data Model

Add to `Timesheet` schema:

```js
const dayStatusSchema = new mongoose.Schema({
  status: { type: String, enum: ['draft', 'submitted', 'approved', 'returned'], default: 'draft' },
  submittedAt: { type: Date, default: null },
  reviewedAt: { type: Date, default: null },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  rejectionReason: { type: String, default: '' },
}, { _id: false });

// On Timesheet:
dayStatus: {
  mon: { type: dayStatusSchema, default: () => ({}) },
  tue: { type: dayStatusSchema, default: () => ({}) },
  wed: { type: dayStatusSchema, default: () => ({}) },
  thu: { type: dayStatusSchema, default: () => ({}) },
  fri: { type: dayStatusSchema, default: () => ({}) },
}
```

The existing week-level `status` field remains but becomes **derived**:
- `approved` — all non-empty days are approved
- `submitted` — all non-empty days are submitted or approved (none draft/returned)
- `returned` — any day is returned
- `draft` — otherwise

A day is "non-empty" if any task row has `entries[day] > 0`.

### Migration from #2 (rejection reasons)

The week-level `rejectionReason` added in #2 is superseded by per-day
`rejectionReason` in `dayStatus`. When reading a doc that has the old
week-level field but no `dayStatus`, treat all days as having that status.

### Backend Changes

**Submit endpoint** changes from `POST /:weekStart/submit` to accepting a
body: `{ days: ['mon', 'wed'] }`. Each listed day moves to `submitted`.
Days not listed stay as-is. If `days` is omitted or empty, submit all
non-empty draft/returned days (backward compat = submit-all).

**Review endpoint** `PATCH /review/:id` changes to accept:
```json
{ "decision": "approve" | "return", "days": ["mon", "tue"], "reason": "..." }
```
Each listed day gets the decision. If `days` is omitted, applies to all
submitted days (backward compat).

**GET /:weekStart** response includes `dayStatus` map and the derived
week-level `status`.

### Frontend Changes

**Column headers:** Each day header gets a checkbox (visible only when the
day is draft or returned and the week is editable). Checked days are
tracked in local state.

**Submit button:** Dynamic label: "Submit for N day(s)" where N is the
count of checked days. Disabled when N = 0. Separate "Submit all" button
for submitting the entire week at once.

**Day status indicators:** Small colored dot in each column header:
- No dot: draft
- Yellow dot: submitted (awaiting review)
- Green dot: approved
- Red dot: returned

**Returned banner:** Shows per-day rejection reasons. "Mon was returned:
hours are missing. Wed was returned: wrong project."

**PM review:** Per-day approve/return controls. PM can approve some days
and return others in a single review session.

### Cell Locking

A submitted or approved day's cells are locked (same as current week-level
lock). A returned day's cells become editable again. The existing
`weekLocked` function evolves to check per-day status:

```
isCellEditable(day, ...) → also check dayStatus[day].status !== 'submitted' && !== 'approved'
```

---

## 6. Inline Task Creation (#2)

### Backend

New endpoint: `POST /timesheets/tasks`

```json
{
  "title": "Setup CI pipeline",
  "projectId": "abc123"
}
```

Creates a Task with:
- `title` from request
- `project` from `projectId` (validated: employee must be a member)
- `assignees: [{ user: currentUserId }]`
- `status: 'todo'`
- `createdBy: currentUserId`

Returns the created task (id, title, projectId, status).

### Frontend

Update the "Add a task" menu in `TimesheetGrid`:

Below the existing sections, add a "Create new task" section:
- Project dropdown (employee's assigned projects — already available in
  the `assignable` data as project names; need a new field or endpoint
  for the project list)
- Task name text input
- "Create & add" button

On create: POST to the new endpoint, then call `onAddAssigned` with the
result to add the row to the grid.

The `GET /timesheets/:weekStart` response already returns `assignable`
tasks. Add a `projects` field listing the employee's projects (id + name)
for the dropdown.

---

## 7. File Attachments (#14)

### Backend

GridFS bucket: `timesheetFiles`.

Add to Timesheet schema:

```js
const attachmentSchema = new mongoose.Schema({
  fileId: { type: mongoose.Schema.Types.ObjectId, required: true },
  filename: { type: String, required: true },
  contentType: { type: String, default: 'application/octet-stream' },
  size: { type: Number, default: 0 },
  uploadedAt: { type: Date, default: Date.now },
}, { _id: false });

// On Timesheet:
attachments: { type: [attachmentSchema], default: [] }
```

Endpoints:
- `POST /timesheets/:weekStart/attachments` — multipart file upload.
  Max 10MB per file. Max 5 attachments per timesheet. Stores file in
  GridFS, appends metadata to `attachments` array.
- `GET /timesheets/attachments/:fileId` — streams the file from GridFS.
  Validates the requesting user owns the timesheet or is pm/admin.
- `DELETE /timesheets/:weekStart/attachments/:fileId` — removes from
  GridFS and the attachments array. Only the owner or pm/admin.

### Frontend

Bottom bar (below the grid, next to "Apply for leave"):
- "Attach file" button opens a file input.
- List of attached files below: filename, size, download link, delete
  button (if editable).
- Upload shows a progress indicator.

---

## Files Changed (Summary)

| Feature | Backend Files | Frontend Files |
|---|---|---|
| #17 Status badge | — | TaskRow.tsx |
| #11 Rejection reasons | Timesheet.js, timesheets.js | TimesheetPage.tsx, WeekNav.tsx (or review page) |
| #13 Comment summary | timesheets.js | New CommentSummary.tsx |
| #16 Hour target | User.js, profile routes, timesheets.js | SummaryTiles.tsx, timesheetApi.ts |
| #5 Daily submission | Timesheet.js, timesheets.js, timesheetRows.js | TimesheetPage.tsx, TimesheetGrid.tsx, WeekNav.tsx, submit.ts, cellLock.ts, timesheetApi.ts |
| #2 Inline creation | New endpoint in timesheets.js, Task.js | TimesheetGrid.tsx, timesheetApi.ts |
| #14 File attachments | Timesheet.js, timesheets.js (GridFS) | New AttachmentBar.tsx, timesheetApi.ts |

## Edge Cases

- **Daily submission + copy last week:** Copied rows start as draft for all
  days. No day status is carried from the previous week.
- **Daily submission + edit requests:** Edit requests are per-day already.
  A grant unlocks a specific day regardless of its submission status (but
  only if the day is not currently submitted/approved).
- **File attachments + read-only:** Attachments are viewable/downloadable
  on read-only weeks but not deletable or addable.
- **Inline task creation + permissions:** Only employees assigned to a
  project can create tasks under it. The endpoint validates membership.
- **Weekly target = 0:** Treated as "no target" (same as null). Progress
  bar hidden.
- **Backward compat:** Old timesheets without `dayStatus` are read as all
  days having the week-level `status`. The derived status logic handles
  this transparently.
