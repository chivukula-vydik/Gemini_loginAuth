import { User } from '../models/User.js';

// Find a user by email and ensure the given provider link exists.
// Used by Google/SAML callbacks. Email is the linking key.
export async function findOrCreateByProvider({ email, displayName, provider, providerUserId }) {
  const normalized = String(email).toLowerCase().trim();
  let user = await User.findOne({ email: normalized });
  if (!user) {
    user = await User.create({
      email: normalized,
      displayName: displayName || normalized,
      providers: [{ provider, providerUserId }],
    });
    return user;
  }
  const linked = user.providers.some(
    (p) => p.provider === provider && p.providerUserId === providerUserId
  );
  if (!linked) {
    user.providers.push({ provider, providerUserId });
    await user.save();
  }
  return user;
}
