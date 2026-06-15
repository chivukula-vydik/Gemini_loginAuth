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
  app.use(cookieParser());
  app.use(passport.initialize());

  app.get('/health', (req, res) => res.json({ ok: true }));

  const authRouter = createAuthRouter(config.enabled);
  mountProviders(authRouter, config.enabled, {});
  app.use('/auth', authRouter);

  return app;
}
