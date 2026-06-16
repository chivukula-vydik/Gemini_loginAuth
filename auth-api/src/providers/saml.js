import { Strategy as SamlStrategy } from '@node-saml/passport-saml';
import { findOrCreateByProvider } from '../services/users.js';
import { completeLogin } from '../routes/auth.js';

function normalizeCert(value) {
  if (value.includes('BEGIN CERTIFICATE')) return value;
  return Buffer.from(value, 'base64').toString('utf8');
}

export default {
  id: 'saml',
  register(passport, router, config) {
    passport.use(
      'saml',
      new SamlStrategy(
        {
          entryPoint: config.entryPoint,
          issuer: config.issuer,
          callbackUrl: config.callbackURL,
          cert: normalizeCert(config.cert),
          wantAssertionsSigned: false,
        },
        async (profile, done) => {
          try {
            const email = profile.email || profile.nameID;
            const user = await findOrCreateByProvider({
              email,
              displayName: profile.displayName || email,
              provider: 'saml',
              providerUserId: profile.nameID,
            });
            return done(null, user);
          } catch (err) {
            return done(err);
          }
        },
        (profile, done) => done(null, {})
      )
    );

    router.get('/saml', passport.authenticate('saml', { session: false }));

    router.post('/saml/callback', (req, res, next) => {
      passport.authenticate('saml', { session: false }, async (err, user) => {
        const webUrl = process.env.WEB_URL;
        if (err || !user) {
          console.error('[saml] callback failed:', err ? err.message : 'no user returned');
          if (err && err.stack) console.error(err.stack);
          return res.redirect(`${webUrl}/?error=saml_failed`);
        }
        console.log('[saml] login ok for', user.email);
        if (user.active === false) return res.redirect(`${webUrl}/?error=account_disabled`);
        const accessToken = await completeLogin(res, user);
        return res.redirect(`${webUrl}/#access_token=${accessToken}`);
      })(req, res, next);
    });
  },
};
