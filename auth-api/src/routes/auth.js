import express from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import {
  findValidRefreshToken,
  issueRefreshToken,
  revokeRefreshToken,
  signAccessToken,
} from '../services/tokens.js';
import { User } from '../models/User.js';

const COOKIE_NAME = 'refresh_token';

export function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: 'lax',
    path: '/auth',
  };
}

// Shared helper used by every provider after a successful login.
export async function completeLogin(res, user) {
  const refresh = await issueRefreshToken(user);
  res.cookie(COOKIE_NAME, refresh, cookieOptions());
  return signAccessToken(user);
}

export function createAuthRouter(enabledProviders) {
  const router = express.Router();

  router.get('/providers', (req, res) => {
    res.json(
      enabledProviders.map((p) => ({
        id: p.id,
        displayName: p.displayName || p.id,
        kind: p.id === 'local' ? 'password'
          : p.id === 'saml' ? 'saml-redirect' : 'oauth-redirect',
        startUrl: p.id === 'local' ? null : `/auth/${p.id}`,
      }))
    );
  });

  router.post('/refresh', async (req, res) => {
    const token = req.cookies[COOKIE_NAME];
    if (!token) return res.status(401).json({ error: 'no refresh token' });
    const record = await findValidRefreshToken(token);
    if (!record) {
      res.clearCookie(COOKIE_NAME, cookieOptions());
      return res.status(401).json({ error: 'invalid refresh token' });
    }
    const user = await User.findById(record.userId);
    await revokeRefreshToken(token); // rotate
    const accessToken = await completeLogin(res, user);
    res.json({ accessToken });
  });

  router.post('/logout', async (req, res) => {
    const token = req.cookies[COOKIE_NAME];
    if (token) await revokeRefreshToken(token);
    res.clearCookie(COOKIE_NAME, cookieOptions());
    res.json({ ok: true });
  });

  router.get('/me', requireAuth, async (req, res) => {
    const user = await User.findById(req.user.sub).select('email displayName providers');
    if (!user) return res.status(404).json({ error: 'not found' });
    res.json(user);
  });

  return router;
}
