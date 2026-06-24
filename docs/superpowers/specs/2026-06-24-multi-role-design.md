# Multi-Role Support — Design Spec

## Goal

Allow users to have multiple roles simultaneously (e.g., PM + reporting_manager). The system shows the union of all permissions — a PM+RM sees PM nav items AND RM nav items, and `requireRole` passes if any of the user's roles matches.

## Architecture

Change `User.role` (single string) to `User.roles` (array of strings). The JWT token carries `roles: ['pm', 'reporting_manager']`. Every `req.user.role === 'x'` check becomes `req.user.roles.includes('x')`. Nav items merge from all roles (deduplicated). Any combination of roles is allowed.

## Data Model

### User model (`auth-api/src/models/User.js`)

```js
// Before
role: { type: String, enum: ['admin', 'pm', 'employee', 'reporting_manager'], default: 'employee' }

// After
roles: {
  type: [String],
  enum: ['admin', 'pm', 'employee', 'reporting_manager'],
  default: ['employee'],
}
```

The old `role` field is removed from the schema. Existing user documents that still have `role` instead of `roles` are handled at read time (see Backwards Compatibility below).

## Auth Pipeline

### JWT Token (`auth-api/src/services/tokens.js`)

```js
// Before
{ sub, email, name, role: user.role || 'employee' }

// After
{ sub, email, name, roles: user.roles || [user.role || 'employee'] }
```

The fallback `[user.role || 'employee']` handles old user docs that haven't been migrated yet.

### requireRole middleware (`auth-api/src/middleware/requireRole.js`)

```js
// Before
if (!allowed.includes(req.user.role)) return 403

// After
if (!req.user.roles || !req.user.roles.some(r => allowed.includes(r))) return 403
```

### resolveRole (`auth-api/src/services/authz.js`)

```js
// Before
export function resolveRole(user, env) { ... return user.role || 'employee'; }

// After
export function resolveRoles(user, env) {
  const adminEmail = String(env.ADMIN_EMAIL || '').toLowerCase().trim();
  const roles = user.roles || [user.role || 'employee'];
  if (adminEmail && String(user.email || '').toLowerCase().trim() === adminEmail && !roles.includes('admin')) {
    return ['admin', ...roles];
  }
  return roles;
}
```

### Auth route (`auth-api/src/routes/auth.js`)

On login/signup, call `resolveRoles()` and store the result in `user.roles`. The role-syncing logic that currently does `user.role = desiredRole` changes to set `user.roles`.

## Backend Role Check Changes

Every file that reads `req.user.role` changes to use `req.user.roles`. The pattern is:

| Before | After |
|--------|-------|
| `req.user.role === 'admin'` | `req.user.roles.includes('admin')` |
| `req.user.role === 'pm'` | `req.user.roles.includes('pm')` |
| `req.user.role === 'reporting_manager'` | `req.user.roles.includes('reporting_manager')` |
| `['pm', 'admin'].includes(req.user.role)` | `req.user.roles.some(r => ['pm', 'admin'].includes(r))` |

### Files to modify (backend):

- `auth-api/src/middleware/requireRole.js` — check `roles` array
- `auth-api/src/services/tokens.js` — put `roles` in JWT
- `auth-api/src/services/authz.js` — `resolveRoles()`, update `canViewProject`/`canEditProject` to check `user.roles`
- `auth-api/src/routes/auth.js` — role resolution on login
- `auth-api/src/routes/admin.js` — role update endpoint accepts `roles` array, admin checks, RM validation, user list returns `roles`
- `auth-api/src/routes/dashboard.js` — `role` variable → check `roles` array for team sections
- `auth-api/src/routes/manager.js` — already guarded by requireRole, no inline checks needed
- `auth-api/src/routes/attendance.js` — admin/RM team scoping
- `auth-api/src/routes/leave.js` — RM/PM leave filter
- `auth-api/src/routes/timesheets.js` — RM scoping, privileged check
- `auth-api/src/routes/editRequests.js` — RM scoping
- `auth-api/src/routes/projects.js` — admin/PM project visibility, PM owner validation
- `auth-api/src/routes/users.js` — privileged check
- `auth-api/src/models/User.js` — schema change

## Frontend Changes

### authContext.tsx

```ts
// Before
type User = { ...; role: 'admin' | 'pm' | 'employee' | 'reporting_manager'; ... }

// After
type User = { ...; roles: ('admin' | 'pm' | 'employee' | 'reporting_manager')[]; ... }
```

### nav.ts

```ts
// Before
export function navForRole(role: Role): NavItem[] { ... }

// After
export function navForRoles(roles: Role[]): NavItem[] {
  // Merge nav items from all roles, deduplicate by key, preserve order
}
```

Priority order for merging: admin > pm > reporting_manager > employee. If user has `['pm', 'reporting_manager']`, start with PM nav items, then add any RM-only items not already present.

### AppShell.tsx

- `navForRole(user?.role ?? 'employee')` → `navForRoles(user?.roles ?? ['employee'])`
- Role display: `user.role` → `user.roles.join(', ')`

### Other frontend files

- `HomePage.tsx` — `isTeam` check: `user?.roles?.some(r => ['admin', 'pm', 'reporting_manager'].includes(r))`
- `AttendancePage.tsx` — `isTeamLead`: `user?.roles?.some(r => ['pm', 'admin'].includes(r))`
- `TimesheetPage.tsx` — `canOverrideBillable`: `user?.roles?.some(r => ['admin', 'pm'].includes(r))`

### AdminUsers.tsx

The role dropdown for editing a user's role changes from a single `<select>` to a checkbox group allowing multiple selections. The PATCH endpoint changes from `PATCH /admin/users/:id/role { role: 'pm' }` to `PATCH /admin/users/:id/roles { roles: ['pm', 'reporting_manager'] }`.

## Admin Endpoint Changes

### `PATCH /admin/users/:id/roles`

```js
// Request body
{ roles: ['pm', 'reporting_manager'] }

// Validation
- roles must be a non-empty array
- every element must be in ROLES
- no duplicates
```

### `GET /admin/users`

Returns `roles` array instead of `role` string. The `role` field is omitted.

### Admin checks for "last admin"

```js
// Before
User.countDocuments({ role: 'admin', ... })

// After
User.countDocuments({ roles: 'admin', ... })
```

MongoDB natively supports `{ roles: 'admin' }` to match docs where the `roles` array contains `'admin'`.

### RM assignment validation

```js
// Before
if (!rm || rm.role !== 'reporting_manager')

// After
if (!rm || !rm.roles.includes('reporting_manager'))
```

## Backwards Compatibility

No migration script. The token service and all read paths use `user.roles || [user.role || 'employee']` as fallback. When a user's roles are updated via the admin endpoint, the new `roles` field is written. Old docs with only `role` continue to work until they're updated.

## Scope Exclusions

- No role hierarchy or inheritance (admin doesn't implicitly include PM powers — it just happens to pass most requireRole checks because routes list 'admin' explicitly)
- No per-role UI themes or layouts
- No role-switching UI — user always sees the union
- Shifts feature is a separate spec
