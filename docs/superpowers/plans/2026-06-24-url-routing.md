# Remove URL Tracking + Add Browser URL Routing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the URL Activity tracking feature entirely and add real browser URL routing with `react-router-dom` so every nav tab has its own URL path.

**Architecture:** Part 1 deletes 6 URL tracking files and cleans references from app.js, nav.ts, and AppShell.tsx. Part 2 installs `react-router-dom`, wraps the app in `BrowserRouter`, replaces `useState`-based navigation with `useNavigate`/`useLocation`/`Routes`, and updates HomePage to navigate via the router instead of a callback prop.

**Tech Stack:** Express.js, React 19, TypeScript, react-router-dom v7, Vite

## Global Constraints

- Backend route pattern: `export function createXRouter()` factory, mounted in `auth-api/src/app.js`.
- Frontend API pattern: `authed(path)` from `web/src/fetchHelper.ts`.
- Navigation: `NavKey` union type in `web/src/pm/nav.ts`, consumed by `AppShell.tsx`.
- Role type: `'admin' | 'pm' | 'employee' | 'reporting_manager'`.
- No nested routes, no route guards, no lazy loading, no production server config.
- Vite dev server handles SPA fallback by default — no vite.config.ts change needed.

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `auth-api/src/models/UrlActivity.js` | Delete | URL tracking model |
| `auth-api/src/models/UrlCategory.js` | Delete | URL category model |
| `auth-api/src/routes/urlTracking.js` | Delete | URL tracking routes |
| `web/src/pm/urlTrackingApi.ts` | Delete | URL tracking API |
| `web/src/pm/UrlTracking.tsx` | Delete | URL tracking page |
| `web/src/pm/UrlCategories.tsx` | Delete | URL categories page |
| `auth-api/src/app.js` | Modify (lines 22, 92) | Remove URL tracking import + mount |
| `web/src/pm/nav.ts` | Modify (all) | Remove url-tracking/url-categories, add `path` field, add `pathForKey`/`keyForPath` helpers |
| `web/src/main.tsx` | Modify (all) | Wrap app in `BrowserRouter` |
| `web/src/AppShell.tsx` | Modify (all) | Replace useState nav with react-router, add `Routes`/`Route` |
| `web/src/dashboard/HomePage.tsx` | Modify (lines 5-7, 29, 63, 87, 113, 136, 163, 185) | Remove `onNavigate` prop, use `useNavigate` + `pathForKey` |

---

### Task 1: Remove URL Tracking Feature

**Files:**
- Delete: `auth-api/src/models/UrlActivity.js`
- Delete: `auth-api/src/models/UrlCategory.js`
- Delete: `auth-api/src/routes/urlTracking.js`
- Delete: `web/src/pm/urlTrackingApi.ts`
- Delete: `web/src/pm/UrlTracking.tsx`
- Delete: `web/src/pm/UrlCategories.tsx`
- Modify: `auth-api/src/app.js:22,92`
- Modify: `web/src/pm/nav.ts:2,9,19-20,26,32`
- Modify: `web/src/AppShell.tsx:15-16,35-36,53-54`

**Interfaces:**
- Consumes: nothing from other tasks
- Produces: Clean codebase with no URL tracking references. `NavKey` type without `'url-tracking'` or `'url-categories'`. Nav arrays without `urlTracking` variable or URL Categories entry.

- [ ] **Step 1: Delete the 6 URL tracking files**

```bash
cd "C:/Users/vydik/OneDrive/Desktop/login"
git rm auth-api/src/models/UrlActivity.js
git rm auth-api/src/models/UrlCategory.js
git rm auth-api/src/routes/urlTracking.js
git rm web/src/pm/urlTrackingApi.ts
git rm web/src/pm/UrlTracking.tsx
git rm web/src/pm/UrlCategories.tsx
```

- [ ] **Step 2: Remove URL tracking from app.js**

In `auth-api/src/app.js`, remove line 22:

```js
import { createUrlTrackingRouter } from './routes/urlTracking.js';
```

And remove line 92:

```js
  app.use('/url-tracking', createUrlTrackingRouter());
```

The file should go from this import block ending:

```js
import { createReportsRouter } from './routes/reports.js';
import { createUrlTrackingRouter } from './routes/urlTracking.js';
import { createDashboardRouter } from './routes/dashboard.js';
```

To:

```js
import { createReportsRouter } from './routes/reports.js';
import { createDashboardRouter } from './routes/dashboard.js';
```

And the mount section should go from:

```js
  app.use('/reports', createReportsRouter());
  app.use('/url-tracking', createUrlTrackingRouter());
  app.use('/dashboard', createDashboardRouter());
```

To:

```js
  app.use('/reports', createReportsRouter());
  app.use('/dashboard', createDashboardRouter());
```

- [ ] **Step 3: Remove URL tracking from nav.ts**

Replace the entire contents of `web/src/pm/nav.ts` with:

```ts
export type Role = 'admin' | 'pm' | 'employee' | 'reporting_manager';
export type NavKey = 'home' | 'users' | 'skills' | 'company-fit' | 'projects' | 'requests' | 'marketplace' | 'my-tasks' | 'my-skills' | 'timesheet' | 'attendance' | 'utilization';
export type NavItem = { key: NavKey; label: string };

export function navForRole(role: Role): NavItem[] {
  const home: NavItem = { key: 'home', label: 'Home' };
  const timesheet: NavItem = { key: 'timesheet', label: 'Timesheet' };
  const attendance: NavItem = { key: 'attendance', label: 'Attendance' };
  if (role === 'admin') {
    return [
      home,
      { key: 'users', label: 'Users' },
      { key: 'skills', label: 'Skills' },
      { key: 'company-fit', label: 'Company fit' },
      { key: 'projects', label: 'Projects' },
      { key: 'requests', label: 'Requests' },
      { key: 'utilization', label: 'Utilization' },
      timesheet,
      attendance,
    ];
  }
  if (role === 'pm') {
    return [home, { key: 'projects', label: 'Projects' }, { key: 'requests', label: 'Requests' }, { key: 'utilization', label: 'Utilization' }, timesheet, attendance];
  }
  if (role === 'reporting_manager') {
    return [
      home,
      { key: 'requests', label: 'Requests' },
      timesheet,
      attendance,
    ];
  }
  return [
    home,
    { key: 'my-tasks', label: 'My Tasks' },
    { key: 'my-skills', label: 'My Skills' },
    { key: 'marketplace', label: 'Marketplace' },
    timesheet,
    attendance,
  ];
}
```

- [ ] **Step 4: Remove URL tracking from AppShell.tsx**

In `web/src/AppShell.tsx`:

Remove lines 15-16 (the UrlTracking and UrlCategories imports):

```ts
import { UrlTracking } from './pm/UrlTracking';
import { UrlCategories } from './pm/UrlCategories';
```

Remove lines 35-36 from the `viewFor` switch (the url-tracking and url-categories cases):

```ts
    case 'url-tracking': return <UrlTracking />;
    case 'url-categories': return <UrlCategories />;
```

Remove lines 53-54 from `NAV_ICONS` (the url-tracking and url-categories entries):

```ts
  'url-tracking': <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />,
  'url-categories': <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />,
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `cd web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: remove URL Activity tracking feature"
```

---

### Task 2: Install react-router-dom + Update nav.ts with Routing Helpers

**Files:**
- Modify: `web/package.json` (install dependency)
- Modify: `web/src/pm/nav.ts` (add path field, pathForKey, keyForPath)

**Interfaces:**
- Consumes: Clean `NavKey` type from Task 1 (without url-tracking/url-categories)
- Produces: `NavItem` type with `path: string` field; `pathForKey(key: NavKey): string`; `keyForPath(pathname: string): NavKey`; all nav items include `path` field

- [ ] **Step 1: Install react-router-dom**

```bash
cd web && npm install react-router-dom
```

- [ ] **Step 2: Update nav.ts with path field and routing helpers**

Replace the entire contents of `web/src/pm/nav.ts` with:

```ts
export type Role = 'admin' | 'pm' | 'employee' | 'reporting_manager';
export type NavKey = 'home' | 'users' | 'skills' | 'company-fit' | 'projects' | 'requests' | 'marketplace' | 'my-tasks' | 'my-skills' | 'timesheet' | 'attendance' | 'utilization';
export type NavItem = { key: NavKey; label: string; path: string };

const ALL_NAV_KEYS: NavKey[] = ['home', 'users', 'skills', 'company-fit', 'projects', 'requests', 'marketplace', 'my-tasks', 'my-skills', 'timesheet', 'attendance', 'utilization'];

export function pathForKey(key: NavKey): string {
  return key === 'home' ? '/' : `/${key}`;
}

export function keyForPath(pathname: string): NavKey {
  if (pathname === '/') return 'home';
  const seg = pathname.slice(1);
  return ALL_NAV_KEYS.includes(seg as NavKey) ? (seg as NavKey) : 'home';
}

export function navForRole(role: Role): NavItem[] {
  const home: NavItem = { key: 'home', label: 'Home', path: '/' };
  const timesheet: NavItem = { key: 'timesheet', label: 'Timesheet', path: '/timesheet' };
  const attendance: NavItem = { key: 'attendance', label: 'Attendance', path: '/attendance' };
  if (role === 'admin') {
    return [
      home,
      { key: 'users', label: 'Users', path: '/users' },
      { key: 'skills', label: 'Skills', path: '/skills' },
      { key: 'company-fit', label: 'Company fit', path: '/company-fit' },
      { key: 'projects', label: 'Projects', path: '/projects' },
      { key: 'requests', label: 'Requests', path: '/requests' },
      { key: 'utilization', label: 'Utilization', path: '/utilization' },
      timesheet,
      attendance,
    ];
  }
  if (role === 'pm') {
    return [home, { key: 'projects', label: 'Projects', path: '/projects' }, { key: 'requests', label: 'Requests', path: '/requests' }, { key: 'utilization', label: 'Utilization', path: '/utilization' }, timesheet, attendance];
  }
  if (role === 'reporting_manager') {
    return [
      home,
      { key: 'requests', label: 'Requests', path: '/requests' },
      timesheet,
      attendance,
    ];
  }
  return [
    home,
    { key: 'my-tasks', label: 'My Tasks', path: '/my-tasks' },
    { key: 'my-skills', label: 'My Skills', path: '/my-skills' },
    { key: 'marketplace', label: 'Marketplace', path: '/marketplace' },
    timesheet,
    attendance,
  ];
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd web && npx tsc --noEmit`
Expected: Errors about `NavItem` missing `path` in AppShell — this is expected because AppShell still uses the old `NavItem` shape. The errors will be in `AppShell.tsx` where `it.key` / `it.label` are used. Task 3 will fix these.

- [ ] **Step 4: Commit**

```bash
git add web/package.json web/package-lock.json web/src/pm/nav.ts
git commit -m "feat: install react-router-dom and add routing helpers to nav.ts"
```

---

### Task 3: Convert AppShell.tsx + main.tsx to react-router

**Files:**
- Modify: `web/src/main.tsx`
- Modify: `web/src/AppShell.tsx`

**Interfaces:**
- Consumes: `NavItem` with `path` field, `pathForKey()`, `keyForPath()` from Task 2's `nav.ts`; all page components (HomePage, AdminUsers, etc.)
- Produces: `<BrowserRouter>` wrapping the app; `<Routes>` in AppShell with a `<Route>` per page; sidebar uses `<NavLink>` from react-router-dom; unknown paths redirect to `/`

- [ ] **Step 1: Wrap App in BrowserRouter in main.tsx**

Replace the entire contents of `web/src/main.tsx` with:

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles.css';
import { applyTheme, resolveTheme } from './theme';

applyTheme(resolveTheme());

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
```

- [ ] **Step 2: Rewrite AppShell.tsx to use react-router**

Replace the entire contents of `web/src/AppShell.tsx` with:

```tsx
import { type ReactElement } from 'react';
import { useLocation, useNavigate, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './authContext';
import { TimesheetPage } from './timesheet/TimesheetPage';
import { AttendancePage } from './attendance/AttendancePage';
import { navForRole, keyForPath, NavKey } from './pm/nav';
import { AdminUsers } from './pm/AdminUsers';
import { AdminSkills } from './pm/AdminSkills';
import { CompanyFit } from './pm/CompanyFit';
import { Projects } from './pm/Projects';
import { MyTasks } from './pm/MyTasks';
import { MySkills } from './pm/MySkills';
import { Requests } from './pm/Requests';
import { Marketplace } from './pm/Marketplace';
import { Utilization } from './pm/Utilization';
import { HomePage } from './dashboard/HomePage';
import { ThemeToggle } from './ThemeToggle';
import { personName } from './pm/personName';

const NAV_ICONS: Record<NavKey, ReactElement> = {
  home: <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" />,
  users: <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />,
  skills: <path d="M12 2l2.4 7.4H22l-6 4.5 2.3 7.1L12 16.6 5.7 21l2.3-7.1-6-4.5h7.6z" />,
  'company-fit': <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4L12 14.01l-3-3M9 11l3 3L22 4" />,
  projects: <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />,
  requests: <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4L12 14.01l-3-3" />,
  marketplace: <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0" />,
  'my-tasks': <path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />,
  'my-skills': <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />,
  timesheet: <path d="M12 8v4l3 3M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />,
  attendance: <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 11l-4 4-2-2" />,
  utilization: <path d="M18 20V10M12 20V4M6 20v-6" />,
};

function NavIcon({ name }: { name: NavKey }) {
  return (
    <svg className="shell-nav-icon" width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {NAV_ICONS[name]}
    </svg>
  );
}

export function AppShell() {
  const { user, signOut } = useAuth();
  const items = navForRole(user?.role ?? 'employee');
  const navigate = useNavigate();
  const location = useLocation();
  const active = keyForPath(location.pathname);
  const name = personName(user);
  const initial = (name[0] ?? '?').toUpperCase();

  return (
    <div className="shell">
      <aside className="shell-sidebar">
        <div className="shell-brand"><span className="logo">A</span><span className="name">Auth Service</span></div>
        <nav className="shell-nav">
          {items.map((it) => (
            <a key={it.key} className={`shell-nav-item${active === it.key ? ' active' : ''}`}
              href={it.path} onClick={(e) => { e.preventDefault(); navigate(it.path); }}>
              <NavIcon name={it.key} />
              <span>{it.label}</span>
            </a>
          ))}
        </nav>
        <div className="shell-foot">
          <ThemeToggle />
          <div className="shell-user">
            <div className="shell-avatar">{initial}</div>
            <div className="shell-user-meta">
              <div className="shell-user-email">{name}</div>
              {user?.role && <div className="shell-user-role">{user.role}</div>}
            </div>
            <button className="shell-signout" onClick={signOut} title="Sign out" aria-label="Sign out">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
              </svg>
            </button>
          </div>
        </div>
      </aside>
      <main className="shell-content">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/users" element={<AdminUsers />} />
          <Route path="/skills" element={<AdminSkills />} />
          <Route path="/company-fit" element={<CompanyFit />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/requests" element={<Requests />} />
          <Route path="/my-tasks" element={<MyTasks />} />
          <Route path="/my-skills" element={<MySkills />} />
          <Route path="/marketplace" element={<Marketplace />} />
          <Route path="/timesheet" element={<TimesheetPage />} />
          <Route path="/attendance" element={<AttendancePage />} />
          <Route path="/utilization" element={<Utilization />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd web && npx tsc --noEmit`
Expected: Error in `HomePage.tsx` because it still expects `onNavigate` prop but AppShell no longer passes it. Task 4 fixes this.

- [ ] **Step 4: Commit**

```bash
git add web/src/main.tsx web/src/AppShell.tsx
git commit -m "feat: convert AppShell and main.tsx to react-router-dom"
```

---

### Task 4: Update HomePage to Use Router Navigation

**Files:**
- Modify: `web/src/dashboard/HomePage.tsx`

**Interfaces:**
- Consumes: `useNavigate` from `react-router-dom`; `pathForKey` from `web/src/pm/nav.ts` (Task 2)
- Produces: `HomePage` component with no props — navigates via `useNavigate()` + `pathForKey()` instead of `onNavigate` callback

- [ ] **Step 1: Update HomePage.tsx to use router navigation**

Replace the entire contents of `web/src/dashboard/HomePage.tsx` with:

```tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../authContext';
import { personName } from '../pm/personName';
import { getDashboard, DashboardData } from './dashboardApi';
import { pathForKey } from '../pm/nav';

function fmtMin(m: number): string {
  const h = Math.floor(m / 60);
  const min = Math.round(m % 60);
  return h > 0 ? `${h}h ${String(min).padStart(2, '0')}m` : `${min}m`;
}

const STATUS_LABEL: Record<string, string> = {
  in: 'Clocked in',
  idle: 'Not clocked in',
  'on-break': 'On break',
  done: 'Clocked out',
};

const STATUS_COLOR: Record<string, string> = {
  in: 'var(--success, #22c55e)',
  idle: 'var(--muted, #888)',
  'on-break': 'var(--warning, #f59e0b)',
  done: 'var(--info, #3b82f6)',
};

export function HomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getDashboard().then(setData).catch((e) => setError(e.message));
  }, []);

  const name = personName(user);
  const now = new Date();
  const dateStr = now.toLocaleDateString(undefined, {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const isTeam = user?.role === 'admin' || user?.role === 'pm' || user?.role === 'reporting_manager';

  return (
    <div className="ts-page dash-page">
      <header className="dash-greeting">
        <div>
          <h1 className="dash-hello">{data?.greeting ?? 'Hello'}, {name}</h1>
          <p className="dash-date">{dateStr}</p>
        </div>
      </header>

      {error && <p className="ts-error">{error}</p>}

      {!data && !error && <p className="dash-loading">Loading dashboard...</p>}

      {data && (
        <div className="dash-grid">
          {/* Attendance */}
          {data.attendance && (
            <div className="ts-card dash-card" onClick={() => navigate(pathForKey('attendance'))} role="button" tabIndex={0}>
              <div className="dash-card-head">
                <span className="dash-status-dot" style={{ background: STATUS_COLOR[data.attendance.status] }} />
                <span className="dash-card-title">Attendance</span>
              </div>
              <div className="dash-card-body">
                <span className="dash-metric-value">{STATUS_LABEL[data.attendance.status]}</span>
                {data.attendance.checkIn && (
                  <span className="dash-metric-sub">
                    In at {new Date(data.attendance.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
                <div className="dash-progress">
                  <div className="dash-progress-fill" style={{
                    width: `${data.attendance.shiftDuration > 0 ? Math.min(100, Math.round((data.attendance.effectiveMinutes / data.attendance.shiftDuration) * 100)) : 0}%`,
                  }} />
                </div>
                <span className="dash-metric-sub">{fmtMin(data.attendance.effectiveMinutes)} / {fmtMin(data.attendance.shiftDuration)}</span>
              </div>
            </div>
          )}

          {/* Leave Balance */}
          {data.leave && (
            <div className="ts-card dash-card" onClick={() => navigate(pathForKey('attendance'))} role="button" tabIndex={0}>
              <div className="dash-card-head">
                <span className="dash-card-title">Leave Balance</span>
                {data.leave.pendingCount > 0 && (
                  <span className="dash-badge">{data.leave.pendingCount} pending</span>
                )}
              </div>
              <div className="dash-card-body dash-leave-grid">
                <div className="dash-leave-item">
                  <span className="dash-leave-count">{data.leave.casual.remaining}</span>
                  <span className="dash-leave-label">Casual <span className="dash-leave-total">/ {data.leave.casual.total}</span></span>
                </div>
                <div className="dash-leave-item">
                  <span className="dash-leave-count">{data.leave.sick.remaining}</span>
                  <span className="dash-leave-label">Sick <span className="dash-leave-total">/ {data.leave.sick.total}</span></span>
                </div>
                <div className="dash-leave-item">
                  <span className="dash-leave-count">{data.leave.earned.remaining}</span>
                  <span className="dash-leave-label">Earned <span className="dash-leave-total">/ {data.leave.earned.total}</span></span>
                </div>
              </div>
            </div>
          )}

          {/* Timesheet */}
          {data.timesheet && (
            <div className="ts-card dash-card" onClick={() => navigate(pathForKey('timesheet'))} role="button" tabIndex={0}>
              <div className="dash-card-head">
                <span className="dash-card-title">Timesheet</span>
                <span className="dash-card-sub">This week</span>
              </div>
              <div className="dash-card-body">
                <span className="dash-metric-value">{fmtMin(data.timesheet.totalMinutes)}</span>
                <div className="dash-progress">
                  <div className="dash-progress-fill" style={{
                    width: `${data.timesheet.targetMinutes > 0 ? Math.min(100, Math.round((data.timesheet.totalMinutes / data.timesheet.targetMinutes) * 100)) : 0}%`,
                  }} />
                </div>
                <span className="dash-metric-sub">Target: {fmtMin(data.timesheet.targetMinutes)}</span>
                <span className="dash-metric-sub">{data.timesheet.submittedDays}/5 days submitted</span>
                {data.timesheet.billableMinutes > 0 && (
                  <span className="dash-metric-sub">{fmtMin(data.timesheet.billableMinutes)} billable</span>
                )}
              </div>
            </div>
          )}

          {/* Tasks */}
          {data.tasks && (
            <div className="ts-card dash-card" onClick={() => navigate(pathForKey('my-tasks'))} role="button" tabIndex={0}>
              <div className="dash-card-head">
                <span className="dash-card-title">My Tasks</span>
              </div>
              <div className="dash-card-body dash-tasks-grid">
                <div className="dash-task-chip dash-chip-todo">
                  <span className="dash-chip-count">{data.tasks.todo}</span>
                  <span className="dash-chip-label">To Do</span>
                </div>
                <div className="dash-task-chip dash-chip-progress">
                  <span className="dash-chip-count">{data.tasks.inProgress}</span>
                  <span className="dash-chip-label">In Progress</span>
                </div>
                <div className="dash-task-chip dash-chip-blocked">
                  <span className="dash-chip-count">{data.tasks.blocked}</span>
                  <span className="dash-chip-label">Blocked</span>
                </div>
                <div className="dash-task-chip dash-chip-done">
                  <span className="dash-chip-count">{data.tasks.done}</span>
                  <span className="dash-chip-label">Done</span>
                </div>
              </div>
            </div>
          )}

          {/* Pending Approvals — team roles only */}
          {isTeam && data.pendingApprovals && (
            <div className="ts-card dash-card" onClick={() => navigate(pathForKey('requests'))} role="button" tabIndex={0}>
              <div className="dash-card-head">
                <span className="dash-card-title">Pending Approvals</span>
              </div>
              <div className="dash-card-body">
                <span className="dash-metric-value dash-metric-hero">
                  {data.pendingApprovals.leave + data.pendingApprovals.timesheets + data.pendingApprovals.regularise + data.pendingApprovals.editRequests + data.pendingApprovals.claimRequests}
                </span>
                <span className="dash-metric-sub">total pending</span>
                <div className="dash-approval-breakdown">
                  {data.pendingApprovals.leave > 0 && <span className="dash-approval-item">{data.pendingApprovals.leave} leave</span>}
                  {data.pendingApprovals.timesheets > 0 && <span className="dash-approval-item">{data.pendingApprovals.timesheets} timesheets</span>}
                  {data.pendingApprovals.regularise > 0 && <span className="dash-approval-item">{data.pendingApprovals.regularise} regularise</span>}
                  {data.pendingApprovals.editRequests > 0 && <span className="dash-approval-item">{data.pendingApprovals.editRequests} edits</span>}
                  {data.pendingApprovals.claimRequests > 0 && <span className="dash-approval-item">{data.pendingApprovals.claimRequests} claims</span>}
                </div>
              </div>
            </div>
          )}

          {/* Team Overview — team roles only */}
          {isTeam && data.teamSummary && (
            <div className="ts-card dash-card" onClick={() => navigate(pathForKey('attendance'))} role="button" tabIndex={0}>
              <div className="dash-card-head">
                <span className="dash-card-title">Team Overview</span>
                <span className="dash-card-sub">Today</span>
              </div>
              <div className="dash-card-body dash-team-grid">
                <div className="dash-team-stat">
                  <span className="dash-team-value">{data.teamSummary.presentToday}</span>
                  <span className="dash-team-label">Present</span>
                </div>
                <div className="dash-team-stat">
                  <span className="dash-team-value">{data.teamSummary.onLeaveToday}</span>
                  <span className="dash-team-label">On Leave</span>
                </div>
                <div className="dash-team-stat">
                  <span className="dash-team-value">{data.teamSummary.totalMembers}</span>
                  <span className="dash-team-label">Total</span>
                </div>
                <div className="dash-team-stat">
                  <span className="dash-team-value">{data.teamSummary.avgUtilization}%</span>
                  <span className="dash-team-label">Utilization</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add web/src/dashboard/HomePage.tsx
git commit -m "feat: update HomePage to use react-router navigation"
```
