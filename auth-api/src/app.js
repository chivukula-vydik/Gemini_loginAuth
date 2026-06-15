import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import passport from 'passport';
import { createAuthRouter } from './routes/auth.js';
import { mountProviders } from './providers/index.js';

export function createApp(config) {
  const app = express();
  app.use(cors({ origin: process.env.WEB_URL, credentials: true }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: false })); // SAML IdPs POST assertions as form-urlencoded
  app.use(cookieParser());
  app.use(passport.initialize());

  app.get('/health', (req, res) => res.json({ ok: true }));

  const authRouter = createAuthRouter(config.enabled);
  mountProviders(authRouter, config.enabled, {});
  app.use('/auth', authRouter);

  // Central error handler: turn thrown/rejected handler errors into a 500
  // instead of crashing the process. Must be registered last.
  app.use((err, req, res, next) => {
    console.error('[auth-api] request error', err);
    if (res.headersSent) return next(err);
    res.status(500).json({ error: 'internal error' });
  });

  return app;
}
