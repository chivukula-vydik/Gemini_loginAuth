import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import passport from 'passport';
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

export function createApp(config) {
  const app = express();
  app.use(cors({ origin: process.env.WEB_URL, credentials: true }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());
  app.use(passport.initialize());

  app.get('/health', (req, res) => res.json({ ok: true }));

  const authRouter = createAuthRouter(config.enabled);
  mountProviders(authRouter, config.enabled, {});
  app.use('/auth', authRouter);
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

  app.use((err, req, res, next) => {
    console.error('[auth-api] request error', err);
    if (res.headersSent) return next(err);
    res.status(500).json({ error: 'internal error' });
  });

  return app;
}
