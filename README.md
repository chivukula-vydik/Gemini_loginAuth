# Company Management Platform

A full-stack company management tool — projects, tasks, timesheets, attendance, leave, org structure, and more — built on a plug-and-play auth service that supports email/password, Google OAuth, and SAML SSO.

## Stack

- **auth-api** — Node 22 + Express + Passport.js, MongoDB (Mongoose), JWT sessions.
- **web** — React 19 + Vite + TypeScript.
- **mongo** — database.
- **test-saml-idp** — `kristophjunge/test-saml-idp` for local SAML development (no Okta/Azure tenant needed).

Sessions are stateless JWTs: a short-lived **access token** returned in the JSON body (held in memory by the SPA) and a long-lived **refresh token** in an httpOnly, rotating, revocable cookie.

## Roles

Users can hold multiple roles simultaneously. Navigation and permissions are merged across all assigned roles.

| Role | Access |
|---|---|
| **admin** | Full access: users, skills, departments, shifts, projects, org structure, attendance, company fit, utilization, requests |
| **pm** | Projects, tasks, requests, utilization, timesheet, attendance, org |
| **hr** | Users, requests, timesheet, attendance, team attendance, org |
| **finance** | Projects, utilization, timesheet, attendance, org |
| **reporting_manager / team_lead** | My Team dashboard, requests, timesheet, attendance, team attendance, org |
| **director / vp** | Users, projects, requests, utilization, timesheet, attendance, team attendance, org |
| **employee** | My Tasks, My Skills, Marketplace, timesheet, attendance, org |

## Features

### Home Dashboard
Role-aware home screen. Admins, PMs, and HR see a manager dashboard (team attendance today, pending requests, project and task counts, leave balances). Reporting managers and team leads see an RM dashboard (team's week calendar, pending leave approvals, team stats). Employees see a personal dashboard.

### Projects & Tasks (PM / Admin)
- Create projects, set start/target dates, define required skills.
- Staff projects using the candidate picker — shows each person's workload, skill match, and availability.
- Create tasks, assign members with share percentages, set due dates and start dates.
- Bulk operations: change status, reassign, delete, or export to CSV/XLSX.
- Filter and paginate tasks by status, assignee, or due urgency.
- Approve or reject task estimate proposals and extension requests from employees.
- Approve or reject task claim requests.

### My Tasks (Employee)
- See all tasks assigned across every project.
- Submit time estimates; a PM approves or rejects them.
- Set a personal ETA — flagged if past the task deadline.
- Request more time when overdue.
- Accept or decline direct assignment offers from PMs.

### Marketplace (Employee)
- Browse unassigned tasks from any active project that match your skills.
- Claim a task — the owning PM approves or denies.

### Timesheets (All roles)
- Log hours against assigned tasks per day, Mon–Fri, for any week.
- Auto-save with week navigation.
- Mark rows as billable. Add per-cell notes.
- Submit a week for PM review; PM can approve or return it.
- Request an edit on a locked week; PM approves the unlock.
- Past weeks are read-only after submission.

### Attendance (All roles)
- Check in / check out with office, remote, or WFH punch type.
- Start and end breaks — tracked separately from effective hours.
- Monthly attendance calendar: present, partial, WFH, leave, holiday, weekend, absent.
- Request regularisation for missed or incorrect punches; reporting manager approves.
- Submit overtime requests with reason; manager approves.

### Team Attendance (Reporting Manager / HR / Director / VP)
- Live dashboard: who's in, on leave, WFH, or absent today.
- Team calendar view per employee.
- Approve or deny leave, regularisation, and overtime from a single inbox.

### Leave (All roles)
- Request casual, sick, earned, or unpaid leave; half-day options supported.
- Balance tracking per year with quota enforcement.
- Assigned approver flow; reporting manager approves by default.
- Approved leave marks the corresponding attendance records automatically.

### Requests (PM / Admin / HR / Reporting Manager)
- Unified inbox: submitted timesheets, timesheet edit requests, task claims, leave, regularisation, overtime.

### Utilization (PM / Admin / Finance / Director / VP)
- Billable hours and utilization percentage per employee over a selectable date range.

### Organisation
- Org chart (reporting hierarchy), employee directory, and overview stats.
- Admin-managed: legal entities, business units, departments (with parent hierarchy and head), locations, designations.

### Skills (Admin)
- Global skill catalogue. Employees pick skills for their profile; used for task matching and staffing.

### Departments & Shifts (Admin)
- Manage departments linked to business units with department heads.
- Define shift schedules (start/end time) used for attendance status calculation.

### Company Fit (Admin)
- Per-person reliability: re-estimation count, completion rate, on-time delivery rate.
- Verdict: Reliable / Mixed / Needs attention.

### Users (Admin / HR / Director / VP)
- List users, change roles, activate/deactivate, delete.
- Drill into any user's re-estimation history.

## Quick start (Docker)

```bash
cp .env.example .env      # fill in the values you need (see below)
docker compose up --build
```

- Web app: http://localhost:5173
- Auth API: http://localhost:4000 (try `curl http://localhost:4000/auth/providers`)
- Test SAML IdP: http://localhost:8080

## Configuration

### `auth.config.json` — providers and feature flags

```json
{
  "features": {
    "pmTaskBulk": true
  },
  "providers": {
    "local":  { "enabled": true,  "displayName": "Email & Password" },
    "google": { "enabled": false, "displayName": "Google", "clientID": "env:GOOGLE_CLIENT_ID", "clientSecret": "env:GOOGLE_CLIENT_SECRET", "callbackURL": "http://localhost:4000/auth/google/callback" },
    "saml":   { "enabled": false, "displayName": "SAML SSO", "entryPoint": "...", "issuer": "auth-service", "callbackURL": "http://localhost:4000/auth/saml/callback", "cert": "env:SAML_IDP_CERT" }
  }
}
```

`local` works out of the box. `google` and `saml` need external setup — enable them only after providing the required env vars or the server fails fast at boot with a clear error.

### `.env` — secrets and runtime settings

| Variable | Purpose |
|---|---|
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Sign access/refresh JWTs. |
| `ACCESS_TTL`, `REFRESH_TTL` | Token lifetimes (default `15m` / `7d`). |
| `WEB_URL` | SPA origin, used for CORS and OAuth/SAML redirects. |
| `COOKIE_SECURE` | Set `true` behind HTTPS. |
| `ADMIN_EMAIL` | User registering with this email is auto-granted admin role. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth credentials. |
| `SAML_IDP_CERT` | IdP signing certificate (PEM or base64). |
| `SMTP_*`, `MAIL_FROM` | Password-reset email. Leave `SMTP_HOST` empty to log reset links to console. |

### Feature flags

| Flag | Runtime | Default | Effect |
|---|---|---|---|
| `pmTaskBulk` | backend (`auth.config.json`) | `true` | Enables `PATCH /projects/:id/tasks/bulk` |
| `FEATURE_PM_TASK_BULK` | backend env override | unset | Overrides `pmTaskBulk` when set |
| `VITE_FF_PM_TASK_TOOLS` | frontend (Vite env) | `true` | Task toolbar: search, filters, pagination |
| `VITE_FF_PM_TASK_BULK` | frontend (Vite env) | `true` | Checkbox selection and bulk action bar |

## Auth provider setup

### Google OAuth
1. Create an OAuth 2.0 Client ID in Google Cloud Console (Web application).
2. Add authorized redirect URI: `http://localhost:4000/auth/google/callback`.
3. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`.
4. Set `"google": { "enabled": true }` in `auth.config.json` and restart `auth-api`.

### SAML (local test IdP)
1. Start the IdP: `docker compose up -d test-saml-idp`.
2. Extract its signing certificate into `.env` as `SAML_IDP_CERT`:
   ```bash
   docker compose exec test-saml-idp cat /var/www/simplesamlphp/cert/server.crt
   ```
3. Set `"saml": { "enabled": true }` in `auth.config.json` and restart `auth-api`.
4. Demo logins: **`user1` / `user1pass`** and `user2` / `user2pass`.

> This project pins `@node-saml/passport-saml@4` — the cert option is `cert`, not `idpCert` from v5.

### Password reset
`POST /auth/local/forgot-password` always returns `200` (no account enumeration). Without SMTP configured, the reset link is printed to the auth-api console as `[mailer:dev] password reset for <email>: <url>`. Opening that URL (`/reset?token=...`) revokes all existing refresh tokens for that user.

## Running without Docker

```bash
# Mongo must be running locally at mongodb://localhost:27017
cd auth-api && npm install && MONGO_URL=mongodb://localhost:27017/auth npm start
cd web && npm install && npm run dev
```
