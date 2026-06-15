import passport from 'passport';
import local from './local.js';
// import google from './google.js'; // re-enabled in Task 10
// import saml from './saml.js';     // re-enabled in Task 11

const MODULES = {
  local,
  // google, // re-enabled in Task 10
  // saml,   // re-enabled in Task 11
};

// Mount only the enabled providers' strategies and routes.
export function mountProviders(router, enabledProviders, deps) {
  for (const p of enabledProviders) {
    const mod = MODULES[p.id];
    if (!mod) throw new Error(`[providers] no module for "${p.id}"`);
    mod.register(passport, router, p, deps);
    console.log(`[providers] mounted ${p.id}`);
  }
  return passport;
}
