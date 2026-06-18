import '../src/env.js';
import mongoose from 'mongoose';
import { connectDb } from '../src/db/connect.js';
import { User } from '../src/models/User.js';

// Turn an email's local part into a readable name.
// "varun@example.org" -> "Varun", "john.doe@x.com" -> "John Doe".
function nameFromEmail(email) {
  const local = (email ?? '').split('@')[0];
  if (!local) return '';
  return local
    .split(/[._\-+]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

async function main() {
  await connectDb(process.env.MONGO_URL);
  // Fix users whose displayName is missing/blank OR is just an email address
  // (the old creation code defaulted displayName to the raw email).
  const users = await User.collection.find({}).toArray();

  let updated = 0;
  for (const doc of users) {
    const current = (doc.displayName ?? '').trim();
    const looksLikeEmail = current === '' || current.includes('@');
    if (!looksLikeEmail) continue; // already a real name — leave it
    const name = nameFromEmail(doc.email);
    if (!name || name === current) continue;
    await User.collection.updateOne({ _id: doc._id }, { $set: { displayName: name } });
    updated += 1;
  }

  console.log(`[backfill-display-names] set displayName for ${updated} user(s)`);
  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
