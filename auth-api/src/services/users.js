import { User } from '../models/User.js';
import { nameFromEmail } from './displayName.js';

export async function findOrCreateByProvider({ email, displayName, provider, providerUserId }) {
  const normalized = String(email).toLowerCase().trim();
  let user = await User.findOne({ email: normalized });
  if (!user) {
    user = await User.create({
      email: normalized,
      displayName: displayName || nameFromEmail(normalized),
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
