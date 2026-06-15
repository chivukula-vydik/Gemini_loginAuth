import bcrypt from 'bcrypt';
import { Strategy as LocalStrategy } from 'passport-local';
import { User } from '../models/User.js';
import { completeLogin } from '../routes/auth.js';
import crypto from 'node:crypto';
import { PasswordResetToken } from '../models/PasswordResetToken.js';
import { sendPasswordReset } from '../services/mailer.js';
import { revokeAllForUser } from '../services/tokens.js';

function sha256(v) {
  return crypto.createHash('sha256').update(v).digest('hex');
}

export default {
  id: 'local',
  register(passport, router, config, deps) {
    passport.use(
      new LocalStrategy({ usernameField: 'email' }, async (email, password, done) => {
        try {
          const user = await User.findOne({ email: String(email).toLowerCase().trim() });
          if (!user || !user.passwordHash) return done(null, false);
          const ok = await bcrypt.compare(password, user.passwordHash);
          return ok ? done(null, user) : done(null, false);
        } catch (err) {
          return done(err);
        }
      })
    );

    router.post('/local/register', async (req, res) => {
      const { email, password, displayName } = req.body || {};
      if (!email || !password) return res.status(400).json({ error: 'email and password required' });
      const normalized = String(email).toLowerCase().trim();
      if (await User.findOne({ email: normalized })) {
        return res.status(409).json({ error: 'email already registered' });
      }
      const passwordHash = await bcrypt.hash(password, 12);
      const user = await User.create({
        email: normalized,
        displayName: displayName || normalized,
        passwordHash,
        providers: [{ provider: 'local', providerUserId: normalized }],
      });
      const accessToken = await completeLogin(res, user);
      res.status(201).json({ accessToken });
    });

    router.post('/local/login', (req, res, next) => {
      passport.authenticate('local', { session: false }, async (err, user) => {
        if (err) return next(err);
        if (!user) return res.status(401).json({ error: 'invalid credentials' });
        const accessToken = await completeLogin(res, user);
        res.json({ accessToken });
      })(req, res, next);
    });

    router.post('/local/forgot-password', async (req, res) => {
      const { email } = req.body || {};
      const normalized = String(email || '').toLowerCase().trim();
      const user = normalized ? await User.findOne({ email: normalized }) : null;
      // Always 200 — never reveal whether the account exists.
      if (user && user.passwordHash) {
        const raw = crypto.randomBytes(32).toString('hex');
        await PasswordResetToken.create({
          userId: user._id,
          tokenHash: sha256(raw),
          expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
        });
        const resetUrl = `${process.env.WEB_URL}/reset?token=${raw}`;
        await sendPasswordReset(user.email, resetUrl);
      }
      res.json({ ok: true });
    });

    router.post('/local/reset-password', async (req, res) => {
      const { token, password } = req.body || {};
      if (!token || !password) return res.status(400).json({ error: 'token and password required' });
      const record = await PasswordResetToken.findOne({ tokenHash: sha256(token) });
      if (!record || record.usedAt || record.expiresAt < new Date()) {
        return res.status(400).json({ error: 'invalid or expired token' });
      }
      const user = await User.findById(record.userId);
      if (!user) return res.status(400).json({ error: 'invalid or expired token' });
      user.passwordHash = await bcrypt.hash(password, 12);
      await user.save();
      record.usedAt = new Date();
      await record.save();
      await revokeAllForUser(user._id); // force re-login everywhere
      res.json({ ok: true });
    });
  },
};
