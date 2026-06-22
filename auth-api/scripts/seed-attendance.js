import '../src/env.js';
import mongoose from 'mongoose';
import { connectDb } from '../src/db/connect.js';
import { User } from '../src/models/User.js';
import { Attendance, deriveStatus, calcMinutes } from '../src/models/Attendance.js';

// Dev helper: seed ~30 days of realistic attendance for a user so the
// Attendance page's bars, hours, arrival and LOC columns have data to render.
//
// Usage:
//   node scripts/seed-attendance.js               # seeds the first user
//   node scripts/seed-attendance.js you@email.com # seeds a specific user

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// A Date at the given local clock time on `date` (a Date).
function at(date, hour, minute) {
  const d = new Date(date);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

async function main() {
  await connectDb(process.env.MONGO_URL);

  const email = process.argv[2];
  const user = email
    ? await User.findOne({ email })
    : await User.findOne({});
  if (!user) {
    console.error(email ? `No user with email ${email}` : 'No users in the database.');
    process.exit(1);
  }
  console.log(`[seed-attendance] seeding for ${user.email} (${user._id})`);

  let created = 0;
  let earliest = null;
  for (let i = 1; i <= 32; i++) {
    const day = new Date();
    day.setDate(day.getDate() - i);
    const dow = day.getDay();
    if (dow === 0 || dow === 6) continue;        // skip weekends — they're "Day off"

    const date = ymd(day);

    // ~1 in 9 weekdays: absent (no record) so red circles / regularise rows appear.
    if (Math.random() < 0.11) continue;

    const punchType = pick(['office', 'office', 'office', 'remote', 'wfh']);

    // Arrival: mostly on-time (≤ 9:30), sometimes late.
    const late = Math.random() < 0.25;
    const inH = 9;
    const inM = late ? 35 + Math.floor(Math.random() * 40) : 5 + Math.floor(Math.random() * 25);
    const checkIn = at(day, inH, inM);

    // Roughly a 9h day ± a bit, plus a lunch break.
    const workHours = 8 + Math.random() * 1.5;
    const checkOut = new Date(checkIn.getTime() + workHours * 3600_000);
    const breakMinutes = 30 + Math.floor(Math.random() * 45);

    const doc = {
      userId: user._id, date, checkIn, checkOut, punchType, breakMinutes,
      breaks: [], note: '', regularise: { status: 'none' },
    };
    const mins = calcMinutes(doc);
    doc.totalMinutes = mins.totalMinutes;
    doc.effectiveMinutes = mins.effectiveMinutes;
    doc.status = deriveStatus(doc);

    await Attendance.updateOne(
      { userId: user._id, date },
      { $set: doc },
      { upsert: true },
    );
    if (!earliest || date < earliest) earliest = date;
    created++;
  }

  // Activate the feature from the earliest seeded day so the log table renders.
  if (earliest) {
    await User.updateOne({ _id: user._id }, { $set: { attendanceActivatedDate: earliest } });
  }

  console.log(`[seed-attendance] upserted ${created} day(s); activated from ${earliest}`);
  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
