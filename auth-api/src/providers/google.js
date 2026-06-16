import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { findOrCreateByProvider } from '../services/users.js';
import { completeLogin } from '../routes/auth.js';

export default {
  id: 'google',
  register(passport, router, config) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: config.clientID,
          clientSecret: config.clientSecret,
          callbackURL: config.callbackURL,
        },
        async (accessToken, refreshToken, profile, done) => {
          try {
            const email = profile.emails?.[0]?.value;
            if (!email) return done(new Error('no email from Google'));
            const user = await findOrCreateByProvider({
              email,
              displayName: profile.displayName,
              provider: 'google',
              providerUserId: profile.id,
            });
            return done(null, user);
          } catch (err) {
            return done(err);
          }
        }
      )
    );

    router.get('/google', passport.authenticate('google', {
      scope: ['profile', 'email'],
      session: false,
    }));

    router.get('/google/callback', (req, res, next) => {
      passport.authenticate('google', { session: false }, async (err, user) => {
        const webUrl = process.env.WEB_URL;
        if (err || !user) return res.redirect(`${webUrl}/?error=google_failed`);
        const accessToken = await completeLogin(res, user);
        return res.redirect(`${webUrl}/#access_token=${accessToken}`);
      })(req, res, next);
    });
  },
};
