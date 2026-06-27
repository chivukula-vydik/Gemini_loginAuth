import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import passport from 'passport';
import rateLimit from 'express-rate-limit';
import { createAuthRouter } from './routes/auth.js';
import { mountProviders } from './providers/index.js';
import { createTimesheetRouter } from './routes/timesheets.js';
import { createAdminRouter } from './routes/admin.js';
import { createSkillsRouter } from './routes/skills.js';
import { createProfileRouter } from './routes/profile.js';
import { createProjectsRouter } from './routes/projects.js';
import { createTasksRouter } from './routes/tasks.js';
import { createUsersRouter } from './routes/users.js';
import { createEditRequestsRouter } from './routes/editRequests.js';
import { createMarketplaceRouter } from './routes/marketplace.js';
import { createClaimRequestsRouter } from './routes/claimRequests.js';
import { createAssignmentOffersRouter } from './routes/assignmentOffers.js';
import { createAttendanceRouter } from './routes/attendance.js';
import { createLeaveRouter } from './routes/leave.js';
import { createHolidaysRouter } from './routes/holidays.js';
import { createReportsRouter } from './routes/reports.js';
import { createDashboardRouter } from './routes/dashboard.js';
import { createManagerRouter } from './routes/manager.js';
import { createOrgRouter } from './routes/org.js';
import { createOnboardingRouter } from './routes/onboarding.js';
import { createOnboardingPortalRouter } from './routes/onboardingPortal.js';
import { createMyRequestsRouter } from './routes/myRequests.js';

export function createApp(config) {
  const app = express();
  const featureFlags = { pmTaskBulk: true, ...(config?.featureFlags || {}) };
  const shiftConfig = {
    startHour: 9, startMinute: 30, endHour: 18, endMinute: 30, durationMinutes: 540,
    ...(config?.shift || {}),
  };
  const configuredOrigins = String(process.env.WEB_URL || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  const isLocalDevOrigin = (origin) => {
    try {
      const parsed = new URL(origin);
      if (!['localhost', '127.0.0.1'].includes(parsed.hostname)) return false;
      return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
      return false;
    }
  };

  const isOriginAllowed = (origin) => {
    if (!origin) return true;
    if (configuredOrigins.includes(origin)) return true;
    return isLocalDevOrigin(origin);
  };

  app.locals.featureFlags = featureFlags;
  app.locals.shiftConfig = shiftConfig;
  app.locals.weeklyTargetMinutes = Number(config?.weeklyTargetMinutes) || 2400;
  app.use(
    cors({
      origin(origin, callback) {
        if (isOriginAllowed(origin)) {
          return callback(null, true);
        }
        return callback(new Error('CORS origin blocked'));
      },
      credentials: true,
    }),
  );
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());
  app.use(passport.initialize());

  app.get('/health', (req, res) => res.json({ ok: true }));

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { error: 'too many requests, try again later' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  const authRouter = createAuthRouter(config.enabled);
  mountProviders(authRouter, config.enabled, {});
  app.use('/auth', authLimiter, authRouter);
  app.use('/timesheets', createTimesheetRouter());
  app.use('/admin', createAdminRouter());
  app.use('/skills', createSkillsRouter());
  app.use('/me', createProfileRouter());
  app.use('/projects', createProjectsRouter());
  app.use('/tasks', createTasksRouter());
  app.use('/users', createUsersRouter());
  app.use('/edit-requests', createEditRequestsRouter());
  app.use('/marketplace', createMarketplaceRouter());
  app.use('/claim-requests', createClaimRequestsRouter());
  app.use('/assignment-offers', createAssignmentOffersRouter());
  app.use('/attendance', createAttendanceRouter(shiftConfig));
  app.use('/leave', createLeaveRouter());
  app.use('/holidays', createHolidaysRouter());
  app.use('/reports', createReportsRouter());
  app.use('/dashboard', createDashboardRouter());
  app.use('/manager', createManagerRouter());
  app.use('/org', createOrgRouter());
  app.use('/my-requests', createMyRequestsRouter());
  app.use('/onboarding/portal', createOnboardingPortalRouter());
  app.use('/onboarding', createOnboardingRouter());

  app.use((err, req, res, next) => {
    console.error('[auth-api] request error', err);
    if (res.headersSent) return next(err);
    res.status(500).json({ error: 'internal error' });
  });

  return app;
}
