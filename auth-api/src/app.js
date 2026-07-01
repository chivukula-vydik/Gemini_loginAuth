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
import { createUsersRouter, createCompanyFitRouter } from './routes/users.js';
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
import { createPeopleRouter } from './routes/people.js';
import { createPayrollRouter } from './routes/payroll.js';
import { createSalaryRouter } from './routes/salary.js';
import { createPayslipsRouter } from './routes/payslips.js';
import { createReimbursementsRouter } from './routes/reimbursements.js';
import { createMyLoansRouter, createLoanManagementRouter } from './routes/loans.js';
import { createDeclarationsRouter } from './routes/declarations.js';
import { createFeedRouter } from './routes/feed.js';
import { createInboxRouter } from './routes/inbox.js';
import { createNotificationsRouter } from './routes/notifications.js';
import { createFeaturesRouter } from './routes/features.js';
import { createApprovalFlowsRouter } from './routes/approvalFlows.js';
import { createImportRouter } from './routes/import.js';
import { requireAuth } from './middleware/requireAuth.js';
import { requireFeature } from './middleware/requireFeature.js';

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
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb', parameterLimit: 200 }));
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
  // ponytail: feature-gated routes get requireAuth + requireFeature at mount level
  const fg = (key) => [requireAuth, requireFeature(key)];

  app.use('/timesheets', ...fg('timesheet'), createTimesheetRouter());
  app.use('/admin', createAdminRouter());
  app.use('/skills', ...fg('skills'), createSkillsRouter());
  app.use('/me', createProfileRouter());
  app.use('/projects', requireAuth, createProjectsRouter());
  app.use('/tasks', ...fg('my-tasks'), createTasksRouter());
  app.use('/users', ...fg('company-fit'), createCompanyFitRouter());
  app.use('/users', ...fg('users'), createUsersRouter());
  app.use('/edit-requests', createEditRequestsRouter());
  app.use('/marketplace', ...fg('marketplace'), createMarketplaceRouter());
  app.use('/claim-requests', createClaimRequestsRouter());
  app.use('/assignment-offers', createAssignmentOffersRouter());
  app.use('/attendance', requireAuth, createAttendanceRouter(shiftConfig));
  app.use('/leave', requireAuth, createLeaveRouter());
  app.use('/holidays', createHolidaysRouter());
  app.use('/reports', createReportsRouter());
  app.use('/dashboard', createDashboardRouter());
  app.use('/manager', createManagerRouter());
  app.use('/org', createOrgRouter());
  app.use('/my-requests', ...fg('my-requests'), createMyRequestsRouter());
  app.use('/onboarding/portal', createOnboardingPortalRouter());
  app.use('/onboarding', requireAuth, createOnboardingRouter());
  app.use('/people', createPeopleRouter());
  app.use('/payroll', requireAuth, createPayrollRouter());
  app.use('/salary', ...fg('payroll'), createSalaryRouter());
  app.use('/payslips', requireAuth, createPayslipsRouter());
  app.use('/reimbursements', ...fg('reimbursements'), createReimbursementsRouter());
  app.use('/loans', ...fg('my-loans'), createMyLoansRouter());
  app.use('/loans', ...fg('loan-management'), createLoanManagementRouter());
  app.use('/declarations', requireAuth, createDeclarationsRouter());
  app.use('/feed', createFeedRouter());
  app.use('/inbox', createInboxRouter());
  app.use('/notifications', createNotificationsRouter());
  app.use('/features', createFeaturesRouter());
  app.use('/approval-flows', ...fg('approval-flows'), createApprovalFlowsRouter());
  app.use('/import', createImportRouter());

  app.use((err, req, res, next) => {
    console.error('[auth-api] request error', err);
    if (res.headersSent) return next(err);
    res.status(500).json({ error: 'internal error' });
  });

  return app;
}
