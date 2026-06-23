# Remove URL Tracking + Add Browser URL Routing

## Goal

1. Remove the entire URL Activity tracking feature (models, routes, frontend pages).
2. Add real browser URL routing with `react-router-dom` so each nav tab has its own URL path (e.g., `/home`, `/attendance`, `/timesheet`).

## Architecture

The URL tracking feature is a clean vertical slice — 6 files to delete, plus reference cleanup in app.js, nav.ts, AppShell.tsx. No other features depend on it.

For routing, wrap the app in `BrowserRouter`, replace the `useState<NavKey>` navigation with `useNavigate()` / `useLocation()`, and convert sidebar links to `<NavLink>`. Each page maps to a URL path derived from its NavKey.

## Tech Stack

- react-router-dom v7
- Vite (historyApiFallback for SPA dev server)

---

## Part 1: Remove URL Activity Tracking

### Files to delete

- `auth-api/src/models/UrlActivity.js`
- `auth-api/src/models/UrlCategory.js`
- `auth-api/src/routes/urlTracking.js`
- `web/src/pm/urlTrackingApi.ts`
- `web/src/pm/UrlTracking.tsx`
- `web/src/pm/UrlCategories.tsx`

### Files to modify (remove references)

**`auth-api/src/app.js`**:
- Remove `import { createUrlTrackingRouter } from './routes/urlTracking.js';`
- Remove `app.use('/url-tracking', createUrlTrackingRouter());`

**`web/src/pm/nav.ts`**:
- Remove `'url-tracking'` and `'url-categories'` from `NavKey` type union.
- Remove `urlTracking` variable and all references to it in role nav arrays.
- Remove `{ key: 'url-categories', label: 'URL Categories' }` from admin array.

**`web/src/AppShell.tsx`**:
- Remove `import { UrlTracking }` and `import { UrlCategories }`.
- Remove `case 'url-tracking'` and `case 'url-categories'` from viewFor switch.
- Remove `'url-tracking'` and `'url-categories'` entries from `NAV_ICONS`.

---

## Part 2: Add react-router-dom URL Routing

### Install

```bash
cd web && npm install react-router-dom
```

### URL path mapping

The NavKey doubles as the URL path segment. Home maps to `/`.

| NavKey | URL Path |
|--------|----------|
| `home` | `/` |
| `users` | `/users` |
| `skills` | `/skills` |
| `company-fit` | `/company-fit` |
| `projects` | `/projects` |
| `requests` | `/requests` |
| `my-tasks` | `/my-tasks` |
| `my-skills` | `/my-skills` |
| `marketplace` | `/marketplace` |
| `timesheet` | `/timesheet` |
| `attendance` | `/attendance` |
| `utilization` | `/utilization` |

### nav.ts changes

Add `path` field to `NavItem`:

```ts
export type NavItem = { key: NavKey; label: string; path: string };
```

Add a helper to convert NavKey to path:

```ts
export function pathForKey(key: NavKey): string {
  return key === 'home' ? '/' : `/${key}`;
}
```

Update all nav items to include `path`:

```ts
{ key: 'home', label: 'Home', path: '/' }
{ key: 'users', label: 'Users', path: '/users' }
// etc.
```

Add a reverse lookup:

```ts
export function keyForPath(pathname: string): NavKey {
  if (pathname === '/') return 'home';
  const seg = pathname.slice(1); // strip leading /
  return NAV_KEYS.includes(seg as NavKey) ? (seg as NavKey) : 'home';
}
```

Where `NAV_KEYS` is the array of all valid NavKey values.

### main.tsx changes

Wrap `<App />` in `<BrowserRouter>`:

```tsx
import { BrowserRouter } from 'react-router-dom';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
```

### AppShell.tsx changes

Replace `useState<NavKey>` navigation with router hooks:

```tsx
import { useLocation, useNavigate, Routes, Route, Navigate } from 'react-router-dom';
import { keyForPath, pathForKey } from './pm/nav';
```

- Remove `const [active, setActive] = useState<NavKey>('home');`
- Add `const navigate = useNavigate();` and `const location = useLocation();`
- Derive active key: `const active = keyForPath(location.pathname);`
- Sidebar links: change `onClick` to `navigate(it.path)` or use `<NavLink to={it.path}>`
- Main content: replace `{viewFor(active, setActive)}` with `<Routes>` containing a `<Route>` per page
- Unknown paths: `<Route path="*" element={<Navigate to="/" replace />} />`

The `viewFor` function is removed — each `<Route>` directly renders its component.

### HomePage.tsx changes

The `onNavigate` prop changes from `(key: NavKey) => void` to using `useNavigate()`:

```tsx
import { useNavigate } from 'react-router-dom';
import { pathForKey } from '../pm/nav';

export function HomePage() {
  const navigate = useNavigate();
  // Widget click: navigate(pathForKey('attendance'))
}
```

The `onNavigate` prop is removed — HomePage navigates directly via the router.

### vite.config.ts changes

Add SPA fallback so refreshing `/attendance` doesn't 404 in dev:

```ts
export default defineConfig({
  plugins: [react()],
  server: { host: true, port: 5173 },
});
```

Vite's dev server already handles SPA fallback by default for `index.html`. No change needed unless custom behavior is required. For production builds, the hosting server (nginx, etc.) needs a catch-all rule — out of scope for this change.

---

## Scope exclusions

- No nested routes (e.g., `/projects/:id`) — each page handles its own internal state as before.
- No route guards or auth-gated routes — auth is handled by `AuthProvider`, not the router.
- No lazy loading / code splitting — all pages remain eagerly imported.
- No production server config (nginx, etc.) — only dev server.
