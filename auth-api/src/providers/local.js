import bcrypt from 'bcrypt';
import { Strategy as LocalStrategy } from 'passport-local';
import { User } from '../models/User.js';
import { completeLogin } from '../routes/auth.js';

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
  },
};
