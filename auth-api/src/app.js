import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

export function createApp() {
  const app = express();
  app.use(cors({ origin: process.env.WEB_URL, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());

  app.get('/health', (req, res) => res.json({ ok: true }));

  return app;
}
