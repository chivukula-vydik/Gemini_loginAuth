# Onboarding Board Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the HR onboarding Kanban board with a stats header, enriched cards (avatars, progress bars, status badges), and a proper empty state with step-by-step guide.

**Architecture:** Small backend additions (task progress aggregation on GET /onboarding, new GET /onboarding/stats endpoint) feeding a richer frontend. All changes scoped to one route file and one component + CSS file.

**Tech Stack:** Node.js/Express (ESM), Mongoose/MongoDB, React/TypeScript/Vite, `node:test` + supertest + mongodb-memory-server

## Global Constraints

- Node ESM modules (`import`/`export`), no CommonJS
- Tests use `node --test` (NOT vitest/jest)
- Auth via `requireAuth` middleware; role gating via `requireRole`
- Frontend fetches use `authed()` from `web/src/fetchHelper.ts`
- `TERMINAL_STATES` set: `OFFER_DECLINED`, `CANCELLED`, `TERMINATED`, `CONFIRMED`

---

### Task 1: Backend — taskProgress on GET /onboarding + stats endpoint

**Files:**
- Modify: `auth-api/src/routes/onboarding.js:117-129` (enhance GET `/` to include taskProgress)
- Modify: `auth-api/src/routes/onboarding.js` (add GET `/stats` before the `/:id` route)
- Test: `auth-api/test/onboarding-board.test.js`

**Interfaces:**
- Consumes: `OnboardingCase` model, `OnboardingTask` model, `TERMINAL_STATES` from `OnboardingCase.js`
- Produces: Enhanced `GET /onboarding` response (each case object gains `taskProgress: { done: number, total: number }`); new `GET /onboarding/stats` returning `{ activeCases: number, joiningSoon: number, overdueTasks: number, completedThisQuarter: number }`

- [ ] **Step 1: Write failing tests**

Create `auth-api/test/onboarding-board.test.js`:

```js
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';

process.env.JWT_ACCESS_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

const { createApp } = await import('../src/app.js');
const { User } = await import('../src/models/User.js');
const { OnboardingCase } = await import('../src/models/OnboardingCase.js');
const { OnboardingTask } = await import('../src/models/OnboardingTask.js');
const { signAccessToken } = await import('../src/services/tokens.js');

let mongod, app;

before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  app = createApp({ enabled: [] });
});

after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

function bearer(user) {
  return `Bearer ${signAccessToken(user)}`;
}

describe('GET /onboarding — taskProgress', () => {
  test('includes taskProgress on each case', async () => {
    const hr = await User.create({ email: 'ob-tp1@x.com', displayName: 'HR1', roles: ['hr'] });
    const c = await OnboardingCase.create({
      candidate: { firstName: 'A', lastName: 'B', personalEmail: 'ab@x.com' },
      joiningDate: new Date(),
      createdBy: hr._id,
    });
    await OnboardingTask.create({ onboardingCase: c._id, title: 'T1', status: 'done' });
    await OnboardingTask.create({ onboardingCase: c._id, title: 'T2', status: 'pending' });
    await OnboardingTask.create({ onboardingCase: c._id, title: 'T3', status: 'pending' });

    const res = await request(app)
      .get('/onboarding')
      .set('Authorization', bearer(hr));
    assert.equal(res.status, 200);
    const found = res.body.find(item => String(item._id) === String(c._id));
    assert.ok(found.taskProgress);
    assert.equal(found.taskProgress.done, 1);
    assert.equal(found.taskProgress.total, 3);
  });

  test('case with no tasks gets { done: 0, total: 0 }', async () => {
    const hr = await User.create({ email: 'ob-tp2@x.com', displayName: 'HR2', roles: ['hr'] });
    const c = await OnboardingCase.create({
      candidate: { firstName: 'C', lastName: 'D', personalEmail: 'cd@x.com' },
      joiningDate: new Date(),
      createdBy: hr._id,
    });

    const res = await request(app)
      .get('/onboarding')
      .set('Authorization', bearer(hr));
    assert.equal(res.status, 200);
    const found = res.body.find(item => String(item._id) === String(c._id));
    assert.deepEqual(found.taskProgress, { done: 0, total: 0 });
  });
});

describe('GET /onboarding/stats', () => {
  test('returns all zeros when no data', async () => {
    const hr = await User.create({ email: 'ob-st1@x.com', displayName: 'HRS1', roles: ['hr'] });
    await OnboardingCase.deleteMany({});
    await OnboardingTask.deleteMany({});

    const res = await request(app)
      .get('/onboarding/stats')
      .set('Authorization', bearer(hr));
    assert.equal(res.status, 200);
    assert.equal(res.body.activeCases, 0);
    assert.equal(res.body.joiningSoon, 0);
    assert.equal(res.body.overdueTasks, 0);
    assert.equal(res.body.completedThisQuarter, 0);
  });

  test('returns correct counts with mixed data', async () => {
    const hr = await User.create({ email: 'ob-st2@x.com', displayName: 'HRS2', roles: ['hr'] });
    await OnboardingCase.deleteMany({});
    await OnboardingTask.deleteMany({});

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const nextMonth = new Date();
    nextMonth.setDate(nextMonth.getDate() + 40);

    await OnboardingCase.create({ candidate: { firstName: 'X1', lastName: 'Y', personalEmail: 'x1@x.com' }, joiningDate: tomorrow, status: 'PRE_BOARDING', createdBy: hr._id });
    await OnboardingCase.create({ candidate: { firstName: 'X2', lastName: 'Y', personalEmail: 'x2@x.com' }, joiningDate: nextMonth, status: 'OFFER_SENT', createdBy: hr._id });
    await OnboardingCase.create({ candidate: { firstName: 'X3', lastName: 'Y', personalEmail: 'x3@x.com' }, joiningDate: new Date(), status: 'CONFIRMED', confirmedAt: new Date(), createdBy: hr._id });
    await OnboardingCase.create({ candidate: { firstName: 'X4', lastName: 'Y', personalEmail: 'x4@x.com' }, joiningDate: new Date(), status: 'CANCELLED', createdBy: hr._id });

    const res = await request(app)
      .get('/onboarding/stats')
      .set('Authorization', bearer(hr));
    assert.equal(res.body.activeCases, 2);
    assert.equal(res.body.joiningSoon, 1);
    assert.equal(res.body.completedThisQuarter, 1);
  });

  test('overdue count only includes tasks past dueDate', async () => {
    const hr = await User.create({ email: 'ob-st3@x.com', displayName: 'HRS3', roles: ['hr'] });
    await OnboardingCase.deleteMany({});
    await OnboardingTask.deleteMany({});

    const c = await OnboardingCase.create({ candidate: { firstName: 'Z', lastName: 'W', personalEmail: 'zw@x.com' }, joiningDate: new Date(), status: 'INDUCTION', createdBy: hr._id });
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);

    await OnboardingTask.create({ onboardingCase: c._id, title: 'Overdue', status: 'pending', dueDate: yesterday });
    await OnboardingTask.create({ onboardingCase: c._id, title: 'Future', status: 'pending', dueDate: nextWeek });
    await OnboardingTask.create({ onboardingCase: c._id, title: 'Done', status: 'done', dueDate: yesterday });

    const res = await request(app)
      .get('/onboarding/stats')
      .set('Authorization', bearer(hr));
    assert.equal(res.body.overdueTasks, 1);
  });

  test('403 for employee', async () => {
    const emp = await User.create({ email: 'ob-st4@x.com', displayName: 'EMP', roles: ['employee'] });
    const res = await request(app)
      .get('/onboarding/stats')
      .set('Authorization', bearer(emp));
    assert.equal(res.status, 403);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd auth-api && node --test test/onboarding-board.test.js`
Expected: FAIL — taskProgress not in response, /onboarding/stats 404

- [ ] **Step 3: Add stats endpoint to onboarding.js**

In `auth-api/src/routes/onboarding.js`, add the stats route BEFORE the `/:id` route (before line 131 `router.get('/:id', ...)`). This must go after the other static-prefix routes (templates, tasks, documents) but before `/:id`:

```js
  router.get('/stats', requireAuth, requireRole('admin', 'hr'), asyncHandler(async (req, res) => {
    const now = new Date();
    const sevenDays = new Date(now);
    sevenDays.setDate(sevenDays.getDate() + 7);

    const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
    const quarterStart = new Date(now.getFullYear(), quarterMonth, 1);

    const terminalStatuses = ['OFFER_DECLINED', 'CANCELLED', 'TERMINATED', 'CONFIRMED'];

    const [activeCases, joiningSoon, completedThisQuarter, overdueResult] = await Promise.all([
      OnboardingCase.countDocuments({ status: { $nin: terminalStatuses } }),
      OnboardingCase.countDocuments({
        status: { $nin: terminalStatuses },
        joiningDate: { $gte: now, $lte: sevenDays },
      }),
      OnboardingCase.countDocuments({
        status: 'CONFIRMED',
        confirmedAt: { $gte: quarterStart },
      }),
      OnboardingTask.countDocuments({
        status: { $in: ['pending', 'in_progress'] },
        dueDate: { $lt: now, $ne: null },
      }),
    ]);

    res.json({ activeCases, joiningSoon, overdueTasks: overdueResult, completedThisQuarter });
  }));
```

- [ ] **Step 4: Enhance GET / to include taskProgress**

In `auth-api/src/routes/onboarding.js`, replace the existing `router.get('/', ...)` handler (lines 117-129) with:

```js
  router.get('/', requireAuth, requireRole('admin', 'hr', 'reporting_manager'), asyncHandler(async (req, res) => {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.department) filter.department = req.query.department;
    if (!req.user.roles.includes('admin') && !req.user.roles.includes('hr')) {
      filter.reportingManager = req.user.sub;
    }
    const cases = await OnboardingCase.find(filter)
      .populate('department', 'name')
      .populate('reportingManager', 'displayName email')
      .sort('-createdAt');

    const caseIds = cases.map(c => c._id);
    const progressAgg = await OnboardingTask.aggregate([
      { $match: { onboardingCase: { $in: caseIds } } },
      { $group: {
        _id: '$onboardingCase',
        total: { $sum: 1 },
        done: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } },
      }},
    ]);
    const progressMap = new Map(progressAgg.map(p => [String(p._id), { done: p.done, total: p.total }]));

    const result = cases.map(c => ({
      ...c.toObject(),
      taskProgress: progressMap.get(String(c._id)) || { done: 0, total: 0 },
    }));

    res.json(result);
  }));
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd auth-api && node --test test/onboarding-board.test.js`
Expected: All 6 tests PASS

- [ ] **Step 6: Commit**

```bash
git add auth-api/src/routes/onboarding.js auth-api/test/onboarding-board.test.js
git commit -m "feat(onboarding): add taskProgress to case list + stats endpoint"
```

---

### Task 2: Frontend — Stats Header, Enriched Cards, Empty State

**Files:**
- Modify: `web/src/onboarding/OnboardingBoard.tsx`
- Modify: `web/src/onboarding/OnboardingBoard.css`

**Interfaces:**
- Consumes: Enhanced `GET /onboarding` (cases with `taskProgress: { done, total }`), new `GET /onboarding/stats` returning `{ activeCases, joiningSoon, overdueTasks, completedThisQuarter }`
- Produces: Redesigned OnboardingBoard component with stats header, enriched cards, empty state

- [ ] **Step 1: Rewrite OnboardingBoard.tsx**

Replace the entire contents of `web/src/onboarding/OnboardingBoard.tsx`:

```tsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authed } from '../fetchHelper';
import './OnboardingBoard.css';

interface Case {
  _id: string;
  candidate: { firstName: string; lastName: string; personalEmail: string };
  designation: string;
  department?: { name: string };
  joiningDate: string;
  status: string;
  reportingManager?: { displayName: string };
  taskProgress: { done: number; total: number };
}

interface Stats {
  activeCases: number;
  joiningSoon: number;
  overdueTasks: number;
  completedThisQuarter: number;
}

const COLUMNS = [
  { status: 'DRAFT', label: 'Draft' },
  { status: 'OFFER_SENT', label: 'Offer Sent' },
  { status: 'OFFER_ACCEPTED', label: 'Offer Accepted' },
  { status: 'PRE_BOARDING', label: 'Pre-boarding' },
  { status: 'JOINED', label: 'Joined' },
  { status: 'INDUCTION', label: 'Induction' },
  { status: 'PROBATION', label: 'Probation' },
];

const STATUS_COLORS: Record<string, string> = {
  DRAFT: '#6b7280',
  OFFER_SENT: '#3b82f6',
  OFFER_ACCEPTED: '#14b8a6',
  PRE_BOARDING: '#f59e0b',
  JOINED: '#22c55e',
  INDUCTION: '#6366f1',
  PROBATION: '#8b5cf6',
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  OFFER_SENT: 'Offer Sent',
  OFFER_ACCEPTED: 'Accepted',
  PRE_BOARDING: 'Pre-boarding',
  JOINED: 'Joined',
  INDUCTION: 'Induction',
  PROBATION: 'Probation',
};

const AVATAR_COLORS = ['#4f6ef7', '#22c55e', '#f59e0b', '#8b5cf6', '#ef4444', '#6b7280', '#ec4899', '#14b8a6'];
function colorFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initials(first: string, last: string): string {
  return ((first[0] || '') + (last[0] || '')).toUpperCase();
}

export function OnboardingBoard() {
  const [cases, setCases] = useState<Case[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([
      authed('/onboarding'),
      authed('/onboarding/stats'),
    ]).then(([c, s]) => {
      setCases(c);
      setStats(s);
      setLoaded(true);
    });
  }, []);

  const [form, setForm] = useState({
    firstName: '', lastName: '', personalEmail: '', phone: '',
    designation: '', joiningDate: '', probationMonths: 3, employmentType: 'full_time',
  });

  async function createCase() {
    const body = {
      candidate: { firstName: form.firstName, lastName: form.lastName, personalEmail: form.personalEmail, phone: form.phone },
      designation: form.designation,
      joiningDate: form.joiningDate,
      probationMonths: form.probationMonths,
      employmentType: form.employmentType,
    };
    const c = await authed('/onboarding', 'POST', body);
    setCases(prev => [{ ...c, taskProgress: { done: 0, total: 0 } }, ...prev]);
    setStats(prev => prev ? { ...prev, activeCases: prev.activeCases + 1 } : prev);
    setShowCreate(false);
    setForm({ firstName: '', lastName: '', personalEmail: '', phone: '', designation: '', joiningDate: '', probationMonths: 3, employmentType: 'full_time' });
  }

  if (!loaded) return <div className="ob-page"><div className="ob-empty">Loading...</div></div>;

  const hasCases = cases.length > 0;

  return (
    <div className="ob-page">
      <div className="ob-title">
        <span>Onboarding</span>
        <button className="pr-btn" onClick={() => setShowCreate(true)}>New Case</button>
      </div>

      {hasCases && stats && (
        <div className="ob-stats-row">
          <div className="ob-stat-card">
            <span className="ob-stat-value ob-stat--blue">{stats.activeCases}</span>
            <span className="ob-stat-label">in pipeline</span>
          </div>
          <div className="ob-stat-card">
            <span className="ob-stat-value ob-stat--green">{stats.joiningSoon}</span>
            <span className="ob-stat-label">next 7 days</span>
          </div>
          <div className="ob-stat-card">
            <span className={`ob-stat-value ${stats.overdueTasks > 0 ? 'ob-stat--red' : 'ob-stat--grey'}`}>{stats.overdueTasks}</span>
            <span className="ob-stat-label">need attention</span>
          </div>
          <div className="ob-stat-card">
            <span className="ob-stat-value ob-stat--purple">{stats.completedThisQuarter}</span>
            <span className="ob-stat-label">this quarter</span>
          </div>
        </div>
      )}

      {hasCases ? (
        <div className="ob-board">
          {COLUMNS.map(col => {
            const items = cases.filter(c => c.status === col.status);
            return (
              <div key={col.status} className="ob-column">
                <div className="ob-col-header">
                  {col.label}
                  <span className="ob-col-count">{items.length}</span>
                </div>
                <div className="ob-col-cards">
                  {items.map(c => {
                    const pct = c.taskProgress.total > 0 ? Math.round((c.taskProgress.done / c.taskProgress.total) * 100) : 0;
                    return (
                      <div key={c._id} className="ob-card" onClick={() => navigate(`/onboarding/${c._id}`)}>
                        <div className="ob-card-top">
                          <div className="ob-card-avatar" style={{ background: colorFor(c._id) }}>
                            {initials(c.candidate.firstName, c.candidate.lastName)}
                          </div>
                          <div className="ob-card-info">
                            <div className="ob-card-name">{c.candidate.firstName} {c.candidate.lastName}</div>
                            <div className="ob-card-role">{c.designation}{c.department ? ` — ${c.department.name}` : ''}</div>
                          </div>
                          <span className="ob-status-badge" style={{ background: `${STATUS_COLORS[c.status] || '#6b7280'}20`, color: STATUS_COLORS[c.status] || '#6b7280' }}>
                            {STATUS_LABELS[c.status] || c.status}
                          </span>
                        </div>
                        {c.taskProgress.total > 0 && (
                          <div className="ob-card-progress">
                            <div className="ob-progress-bar">
                              <div className="ob-progress-fill" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="ob-progress-text">{c.taskProgress.done}/{c.taskProgress.total} tasks</span>
                          </div>
                        )}
                        <div className="ob-card-footer">
                          <span className="ob-card-date-pill">
                            {new Date(c.joiningDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                          {c.reportingManager && (
                            <span className="ob-card-rm">RM: {c.reportingManager.displayName}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {items.length === 0 && <div className="ob-col-empty">No cases</div>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="ob-empty-state">
          <svg className="ob-empty-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
            <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
            <path d="M12 11v6M9 14h6" />
          </svg>
          <h2 className="ob-empty-heading">No onboarding cases yet</h2>
          <div className="ob-empty-steps">
            <div className="ob-empty-step">
              <span className="ob-step-num">1</span>
              <div>
                <div className="ob-step-title">Create a case</div>
                <div className="ob-step-desc">Add candidate details and designation</div>
              </div>
            </div>
            <div className="ob-empty-step">
              <span className="ob-step-num">2</span>
              <div>
                <div className="ob-step-title">Send an offer</div>
                <div className="ob-step-desc">Move to Offer Sent stage</div>
              </div>
            </div>
            <div className="ob-empty-step">
              <span className="ob-step-num">3</span>
              <div>
                <div className="ob-step-title">Track progress</div>
                <div className="ob-step-desc">Monitor tasks and documents</div>
              </div>
            </div>
          </div>
          <button className="pr-btn ob-empty-cta" onClick={() => setShowCreate(true)}>Create First Case</button>
        </div>
      )}

      {showCreate && (
        <div className="ob-create-modal" onClick={e => { if (e.target === e.currentTarget) setShowCreate(false); }}>
          <div className="ob-create-card">
            <div className="ob-create-title">New Onboarding Case</div>
            <div className="ob-form-row">
              <div className="ob-form-group">
                <label className="ob-form-label">First Name</label>
                <input className="se-input" value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} />
              </div>
              <div className="ob-form-group">
                <label className="ob-form-label">Last Name</label>
                <input className="se-input" value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} />
              </div>
            </div>
            <div className="ob-form-row">
              <div className="ob-form-group">
                <label className="ob-form-label">Email</label>
                <input className="se-input" type="email" value={form.personalEmail} onChange={e => setForm(f => ({ ...f, personalEmail: e.target.value }))} />
              </div>
              <div className="ob-form-group">
                <label className="ob-form-label">Phone</label>
                <input className="se-input" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
              </div>
            </div>
            <div className="ob-form-row">
              <div className="ob-form-group">
                <label className="ob-form-label">Designation</label>
                <input className="se-input" value={form.designation} onChange={e => setForm(f => ({ ...f, designation: e.target.value }))} />
              </div>
              <div className="ob-form-group">
                <label className="ob-form-label">Joining Date</label>
                <input className="se-input" type="date" value={form.joiningDate} onChange={e => setForm(f => ({ ...f, joiningDate: e.target.value }))} />
              </div>
            </div>
            <div className="ob-form-row">
              <div className="ob-form-group">
                <label className="ob-form-label">Employment Type</label>
                <select className="se-select" value={form.employmentType} onChange={e => setForm(f => ({ ...f, employmentType: e.target.value }))}>
                  <option value="full_time">Full Time</option>
                  <option value="contract">Contract</option>
                  <option value="intern">Intern</option>
                </select>
              </div>
              <div className="ob-form-group">
                <label className="ob-form-label">Probation (months)</label>
                <input className="se-input" type="number" value={form.probationMonths} onChange={e => setForm(f => ({ ...f, probationMonths: Number(e.target.value) }))} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="pr-btn" style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)' }} onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="pr-btn" onClick={createCase} disabled={!form.firstName || !form.lastName || !form.personalEmail || !form.joiningDate}>Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Rewrite OnboardingBoard.css**

Replace the entire contents of `web/src/onboarding/OnboardingBoard.css`:

```css
.ob-page { padding: 28px 32px; }
.ob-title { font-size: 20px; font-weight: 700; color: var(--text); margin-bottom: 20px; display: flex; align-items: center; justify-content: space-between; }

/* ─── Stats Row ────────────────────────────────────────────────────────── */
.ob-stats-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin-bottom: 24px; }
.ob-stat-card { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px 20px; display: flex; flex-direction: column; gap: 2px; }
.ob-stat-value { font-size: 28px; font-weight: 700; line-height: 1.1; }
.ob-stat-label { font-size: 12px; color: var(--muted); font-weight: 500; }
.ob-stat--blue { color: #3b82f6; }
.ob-stat--green { color: #22c55e; }
.ob-stat--red { color: #ef4444; }
.ob-stat--grey { color: #9ca3af; }
.ob-stat--purple { color: #8b5cf6; }

/* ─── Board ────────────────────────────────────────────────────────────── */
.ob-board { display: flex; gap: 16px; overflow-x: auto; padding-bottom: 16px; }
.ob-column { min-width: 260px; max-width: 280px; flex-shrink: 0; }
.ob-col-header { font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--muted); margin-bottom: 10px; display: flex; align-items: center; gap: 6px; }
.ob-col-count { background: var(--border); border-radius: 10px; padding: 1px 8px; font-size: 10px; font-weight: 600; color: var(--muted); }
.ob-col-cards { display: flex; flex-direction: column; gap: 8px; }
.ob-col-empty { font-size: 12px; color: var(--faint, var(--muted)); padding: 12px; }

/* ─── Card ─────────────────────────────────────────────────────────────── */
.ob-card { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px 16px; box-shadow: var(--shadow); cursor: pointer; transition: border-color 0.12s; }
.ob-card:hover { border-color: var(--accent); }
.ob-card-top { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 10px; }
.ob-card-avatar { width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 13px; font-weight: 600; flex-shrink: 0; }
.ob-card-info { flex: 1; min-width: 0; }
.ob-card-name { font-size: 14px; font-weight: 600; color: var(--text); margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ob-card-role { font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ob-status-badge { font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: 10px; white-space: nowrap; flex-shrink: 0; }

/* ─── Progress ─────────────────────────────────────────────────────────── */
.ob-card-progress { margin-bottom: 10px; }
.ob-progress-bar { height: 4px; background: var(--border); border-radius: 2px; overflow: hidden; margin-bottom: 4px; }
.ob-progress-fill { height: 100%; background: #22c55e; border-radius: 2px; transition: width 0.2s; }
.ob-progress-text { font-size: 11px; color: var(--muted); float: right; }

/* ─── Card Footer ──────────────────────────────────────────────────────── */
.ob-card-footer { display: flex; align-items: center; justify-content: space-between; clear: both; }
.ob-card-date-pill { font-size: 11px; color: var(--muted); border: 1px solid var(--border); border-radius: 10px; padding: 1px 8px; }
.ob-card-rm { font-size: 11px; color: var(--muted); }

/* ─── Empty State ──────────────────────────────────────────────────────── */
.ob-empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 80px 20px; max-width: 400px; margin: 0 auto; text-align: center; }
.ob-empty-icon { color: var(--muted); margin-bottom: 16px; }
.ob-empty-heading { font-size: 18px; font-weight: 600; color: var(--text); margin: 0 0 28px; }
.ob-empty-steps { display: flex; flex-direction: column; gap: 16px; margin-bottom: 28px; width: 100%; text-align: left; }
.ob-empty-step { display: flex; align-items: flex-start; gap: 14px; }
.ob-step-num { width: 28px; height: 28px; border-radius: 50%; background: var(--accent, #4f6ef7); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; flex-shrink: 0; }
.ob-step-title { font-size: 14px; font-weight: 600; color: var(--text); margin-bottom: 2px; }
.ob-step-desc { font-size: 12px; color: var(--muted); }
.ob-empty-cta { margin-top: 4px; }

/* ─── Loading / Empty ──────────────────────────────────────────────────── */
.ob-empty { text-align: center; color: var(--faint, var(--muted)); padding: 40px; font-size: 13px; }

/* ─── Create Modal ─────────────────────────────────────────────────────── */
.ob-create-modal { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 100; }
.ob-create-card { background: var(--card); border-radius: var(--radius); padding: 28px 32px; width: 520px; max-height: 80vh; overflow-y: auto; box-shadow: 0 8px 32px rgba(0,0,0,0.2); }
.ob-create-title { font-size: 16px; font-weight: 700; color: var(--text); margin-bottom: 18px; }
.ob-form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; }
.ob-form-group { display: flex; flex-direction: column; gap: 5px; }
.ob-form-label { font-size: 12px; font-weight: 600; color: var(--muted); }
.ob-form-full { grid-column: 1 / -1; }

/* ─── Responsive ───────────────────────────────────────────────────────── */
@media (max-width: 900px) {
  .ob-stats-row { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 600px) {
  .ob-stats-row { grid-template-columns: 1fr; }
  .ob-page { padding: 16px; }
}
```

- [ ] **Step 3: Verify build**

Run: `cd web && npx tsc --noEmit && npx vite build`
Expected: Zero errors, build succeeds

- [ ] **Step 4: Commit**

```bash
git add web/src/onboarding/OnboardingBoard.tsx web/src/onboarding/OnboardingBoard.css
git commit -m "feat(onboarding): redesign board with stats header, enriched cards, empty state"
```

---

### Task 3: End-to-End Verification

**Files:**
- Potentially modify any file from Tasks 1-2 if issues found

**Interfaces:**
- Consumes: Everything from Tasks 1-2
- Produces: Verified, working feature

- [ ] **Step 1: Run all backend tests**

Run: `cd auth-api && node --test test/onboarding-board.test.js`
Expected: All 6 tests pass

- [ ] **Step 2: Run frontend build**

Run: `cd web && npx vite build`
Expected: Build succeeds

- [ ] **Step 3: Manual smoke test**

Start servers and test in browser:
1. Log in as HR/admin → onboarding page shows stats header with 4 stat cards
2. Cards show avatar initials, name, designation, status badge, progress bar, date pill, RM
3. Delete all cases → empty state appears with icon, 3-step guide, "Create First Case" button
4. Click "Create First Case" → modal opens, create a case → board appears with the new card
5. Stats update to show 1 active case

- [ ] **Step 4: Fix any issues found**

- [ ] **Step 5: Commit fixes if any**

```bash
git add -A
git commit -m "fix(onboarding): address smoke test issues"
```
