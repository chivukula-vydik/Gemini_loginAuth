import { User } from '../models/User.js';
import { Attendance } from '../models/Attendance.js';
import { Leave } from '../models/Leave.js';
import { Holiday } from '../models/Holiday.js';
import { LeaveBalance, getOrCreateBalance, QUOTA_LEAVE_TYPES } from '../models/LeaveBalance.js';

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export async function reconcileAbsentDays() {
  const today = new Date();
  const todayDate = ymd(today);
  const year = today.getFullYear();

  const users = await User.find({ active: true, attendanceActivatedDate: { $ne: null } })
    .select('_id attendanceActivatedDate');

  const lookbackStart = ymd(addDays(today, -7));

  const holidays = await Holiday.find({
    date: { $gte: lookbackStart, $lt: todayDate },
  });
  const holidaySet = new Set(holidays.map((h) => h.date));

  let created = 0;

  for (const user of users) {
    const startDate = user.attendanceActivatedDate > lookbackStart
      ? user.attendanceActivatedDate
      : lookbackStart;

    const dates = [];
    const d = new Date(startDate + 'T00:00:00');
    const end = new Date(todayDate + 'T00:00:00');
    while (d < end) {
      const dow = d.getDay();
      const ds = ymd(d);
      if (dow !== 0 && dow !== 6 && !holidaySet.has(ds)) {
        dates.push(ds);
      }
      d.setDate(d.getDate() + 1);
    }

    if (dates.length === 0) continue;

    const attendanceDocs = await Attendance.find({
      userId: user._id,
      date: { $in: dates },
    }).select('date checkIn status');
    const attByDate = new Map(attendanceDocs.map((a) => [a.date, a]));

    const approvedLeaves = await Leave.find({
      userId: user._id,
      status: 'approved',
      startDate: { $lte: dates[dates.length - 1] },
      endDate: { $gte: dates[0] },
    });

    const leaveDates = new Set();
    for (const lv of approvedLeaves) {
      const s = new Date(lv.startDate + 'T00:00:00');
      const e = new Date(lv.endDate + 'T00:00:00');
      while (s <= e) {
        leaveDates.add(ymd(s));
        s.setDate(s.getDate() + 1);
      }
    }

    for (const date of dates) {
      if (leaveDates.has(date)) continue;

      const att = attByDate.get(date);
      if (att && att.checkIn) continue;

      const existingLeave = await Leave.findOne({
        userId: user._id,
        startDate: { $lte: date },
        endDate: { $gte: date },
        status: { $in: ['pending', 'approved'] },
      });
      if (existingLeave) continue;

      const balance = await getOrCreateBalance(user._id, year);
      const casualRemaining = balance.casual.total - balance.casual.used;

      const leaveType = casualRemaining > 0 ? 'casual' : 'unpaid';

      await Leave.create({
        userId: user._id,
        type: leaveType,
        startDate: date,
        endDate: date,
        halfDay: 'none',
        requestedDays: 1,
        reason: 'Auto-marked: no check-in recorded',
        status: 'approved',
        requestedAt: new Date(),
        decidedAt: new Date(),
      });

      if (leaveType === 'casual') {
        balance.casual.used += 1;
        await balance.save();
      }

      if (att) {
        att.status = 'leave';
        att.note = `Auto: ${leaveType} leave (no check-in)`;
        await att.save();
      } else {
        await Attendance.create({
          userId: user._id,
          date,
          status: 'leave',
          note: `Auto: ${leaveType} leave (no check-in)`,
        });
      }

      created++;
    }
  }

  if (created > 0) {
    console.log(`[reconcile] Auto-marked ${created} absent day(s) as leave`);
  }
}
