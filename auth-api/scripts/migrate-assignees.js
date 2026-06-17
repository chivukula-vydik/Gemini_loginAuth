import '../src/env.js';
import mongoose from 'mongoose';
import { connectDb } from '../src/db/connect.js';
import { Task } from '../src/models/Task.js';

async function main() {
  await connectDb(process.env.MONGO_URL);
  // Legacy tasks still carry a top-level `assignee`. Move each to the new shape.
  const legacy = await Task.collection.find({ assignee: { $ne: null } }).toArray();
  let migrated = 0;
  for (const doc of legacy) {
    if (Array.isArray(doc.assignees) && doc.assignees.length > 0) continue; // idempotent
    await Task.collection.updateOne(
      { _id: doc._id },
      { $set: { assignees: [{ user: doc.assignee, sharePct: 100 }] }, $unset: { assignee: '' } },
    );
    migrated += 1;
  }
  // Drop any leftover null `assignee` fields too.
  await Task.collection.updateMany({ assignee: null }, { $unset: { assignee: '' } });
  console.log(`[migrate-assignees] migrated ${migrated} task(s)`);
  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
