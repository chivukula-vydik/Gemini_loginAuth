import '../src/env.js';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import { connectDb } from '../src/db/connect.js';
import { User } from '../src/models/User.js';
import { Department } from '../src/models/Department.js';
import { Designation } from '../src/models/Designation.js';
import { Location } from '../src/models/Location.js';
import { Shift } from '../src/models/Shift.js';
import { Project } from '../src/models/Project.js';
import { Task } from '../src/models/Task.js';
import { Attendance, deriveStatus, calcMinutes } from '../src/models/Attendance.js';
import { Leave, workingDays } from '../src/models/Leave.js';
import { Timesheet } from '../src/models/Timesheet.js';
import { Overtime } from '../src/models/Overtime.js';
import { Skill } from '../src/models/Skill.js';
import { LeaveBalance, DEFAULT_QUOTAS } from '../src/models/LeaveBalance.js';
import { OnboardingCase } from '../src/models/OnboardingCase.js';
import { Offer } from '../src/models/Offer.js';
import { OnboardingTemplate } from '../src/models/OnboardingTemplate.js';
import { OnboardingTask } from '../src/models/OnboardingTask.js';
import { DocumentRequest } from '../src/models/DocumentRequest.js';

// Usage:  node scripts/seed-all.js

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function at(date, hour, minute) {
  const d = new Date(date);
  d.setHours(hour, minute, 0, 0);
  return d;
}
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

const PASSWORD = 'test1234';

const PEOPLE = [
  { name: 'Arjun Sharma', email: 'arjun.sharma@test.com', role: 'admin' },
  { name: 'Priya Patel', email: 'priya.patel@test.com', role: 'vp' },
  { name: 'Rahul Verma', email: 'rahul.verma@test.com', role: 'director' },
  { name: 'Sneha Iyer', email: 'sneha.iyer@test.com', role: 'pm' },
  { name: 'Vikram Reddy', email: 'vikram.reddy@test.com', role: 'pm' },
  { name: 'Ananya Gupta', email: 'ananya.gupta@test.com', role: 'hr' },
  { name: 'Deepak Joshi', email: 'deepak.joshi@test.com', role: 'finance' },
  { name: 'Kavitha Nair', email: 'kavitha.nair@test.com', role: 'reporting_manager' },
  { name: 'Suresh Kumar', email: 'suresh.kumar@test.com', role: 'reporting_manager' },
  { name: 'Meera Krishnan', email: 'meera.krishnan@test.com', role: 'team_lead' },
  { name: 'Aditya Singh', email: 'aditya.singh@test.com', role: 'employee' },
  { name: 'Divya Menon', email: 'divya.menon@test.com', role: 'employee' },
  { name: 'Rohan Deshmukh', email: 'rohan.deshmukh@test.com', role: 'employee' },
  { name: 'Pooja Rao', email: 'pooja.rao@test.com', role: 'employee' },
  { name: 'Nikhil Thakur', email: 'nikhil.thakur@test.com', role: 'employee' },
  { name: 'Lakshmi Sundaram', email: 'lakshmi.sundaram@test.com', role: 'employee' },
  { name: 'Amit Chauhan', email: 'amit.chauhan@test.com', role: 'employee' },
  { name: 'Ritu Agarwal', email: 'ritu.agarwal@test.com', role: 'employee' },
  { name: 'Karthik Bhat', email: 'karthik.bhat@test.com', role: 'employee' },
  { name: 'Nisha Pillai', email: 'nisha.pillai@test.com', role: 'employee' },
  { name: 'Sanjay Malhotra', email: 'sanjay.malhotra@test.com', role: 'employee' },
  { name: 'Tanya Saxena', email: 'tanya.saxena@test.com', role: 'employee' },
  { name: 'Rajesh Hegde', email: 'rajesh.hegde@test.com', role: 'employee' },
  { name: 'Swati Kulkarni', email: 'swati.kulkarni@test.com', role: 'employee' },
  { name: 'Manish Tiwari', email: 'manish.tiwari@test.com', role: 'employee' },
];

const PROJECTS_DATA = [
  { name: 'Project Phoenix', client: 'Infosys Ltd', billing: 'hourly', rate: 150, desc: 'Cloud migration platform' },
  { name: 'E-Commerce Portal', client: 'Flipkart', billing: 'fixed-price', rate: 500000, desc: 'B2B marketplace redesign' },
  { name: 'HR Analytics Dashboard', client: 'Internal', billing: 'non-billable', desc: 'Internal HR analytics tool' },
  { name: 'Mobile Banking App', client: 'HDFC Bank', billing: 'milestone', desc: 'Next-gen mobile banking' },
  { name: 'Supply Chain Tracker', client: 'Tata Motors', billing: 'hourly', rate: 120, desc: 'Real-time supply chain visibility' },
  { name: 'Customer Support AI', client: 'Swiggy', billing: 'fixed-price', rate: 800000, desc: 'AI-powered support chatbot' },
];

const TASK_TEMPLATES = [
  ['Setup CI/CD pipeline', 'Design database schema', 'Build REST API', 'Create auth module', 'Write unit tests', 'Deploy to staging'],
  ['Design landing page', 'Build product catalog', 'Implement cart & checkout', 'Payment gateway integration', 'Admin dashboard', 'Performance optimization'],
  ['Data modeling', 'ETL pipeline setup', 'Build dashboard widgets', 'Role-based access', 'Export reports feature', 'User acceptance testing'],
  ['Onboarding flow', 'Account management', 'Fund transfer module', 'Push notifications', 'Biometric auth', 'Security audit'],
  ['GPS tracking module', 'Inventory sync API', 'Alerts & notifications', 'Vendor portal', 'Analytics dashboard', 'Load testing'],
  ['NLP model training', 'Chat widget UI', 'Ticket routing engine', 'Knowledge base integration', 'Escalation workflow', 'A/B testing framework'],
];

const LEAVE_REASONS = [
  'Family function', 'Not feeling well', 'Personal work', 'Doctor appointment',
  'Traveling to hometown', 'Wedding ceremony', 'Child unwell', 'Festival celebration',
  'Moving to new house', 'Visa appointment',
];

const TASK_SKILLS = {
  'Setup CI/CD pipeline':        ['CI/CD', 'Docker', 'AWS', 'DevOps', 'Linux'],
  'Design database schema':      ['SQL', 'MongoDB', 'PostgreSQL', 'System Design'],
  'Build REST API':              ['Node.js', 'REST API', 'JavaScript', 'TypeScript'],
  'Create auth module':          ['Node.js', 'JavaScript', 'REST API', 'System Design'],
  'Write unit tests':            ['Testing/QA', 'JavaScript', 'TypeScript'],
  'Deploy to staging':           ['AWS', 'Docker', 'CI/CD', 'DevOps', 'Linux'],
  'Design landing page':         ['HTML/CSS', 'Figma', 'React', 'TypeScript'],
  'Build product catalog':       ['React', 'TypeScript', 'REST API', 'MongoDB'],
  'Implement cart & checkout':   ['React', 'TypeScript', 'Node.js', 'REST API'],
  'Payment gateway integration': ['Node.js', 'REST API', 'JavaScript', 'System Design'],
  'Admin dashboard':             ['React', 'TypeScript', 'HTML/CSS', 'REST API'],
  'Performance optimization':    ['JavaScript', 'React', 'System Design', 'Redis'],
  'Data modeling':               ['SQL', 'PostgreSQL', 'MongoDB', 'System Design', 'Data Analysis'],
  'ETL pipeline setup':          ['Python', 'SQL', 'PostgreSQL', 'Data Analysis'],
  'Build dashboard widgets':     ['React', 'TypeScript', 'HTML/CSS', 'Data Analysis'],
  'Role-based access':           ['Node.js', 'REST API', 'System Design', 'TypeScript'],
  'Export reports feature':      ['Node.js', 'JavaScript', 'SQL', 'Data Analysis'],
  'User acceptance testing':     ['Testing/QA', 'Communication', 'Agile/Scrum'],
  'Onboarding flow':             ['React', 'TypeScript', 'HTML/CSS', 'Figma'],
  'Account management':          ['React', 'Node.js', 'REST API', 'MongoDB'],
  'Fund transfer module':        ['Node.js', 'REST API', 'SQL', 'System Design'],
  'Push notifications':          ['Node.js', 'AWS', 'REST API', 'JavaScript'],
  'Biometric auth':              ['Java', 'System Design', 'REST API', 'DevOps'],
  'Security audit':              ['DevOps', 'Linux', 'System Design', 'Testing/QA'],
  'GPS tracking module':         ['JavaScript', 'REST API', 'Node.js', 'AWS'],
  'Inventory sync API':          ['Node.js', 'REST API', 'MongoDB', 'TypeScript'],
  'Alerts & notifications':      ['Node.js', 'AWS', 'Redis', 'JavaScript'],
  'Vendor portal':               ['React', 'TypeScript', 'HTML/CSS', 'REST API'],
  'Analytics dashboard':         ['React', 'TypeScript', 'Data Analysis', 'SQL', 'GraphQL'],
  'Load testing':                ['Testing/QA', 'DevOps', 'Linux', 'Docker'],
  'NLP model training':          ['Python', 'Machine Learning', 'Data Analysis', 'AWS'],
  'Chat widget UI':              ['React', 'TypeScript', 'HTML/CSS', 'GraphQL'],
  'Ticket routing engine':       ['Node.js', 'TypeScript', 'Redis', 'System Design'],
  'Knowledge base integration':  ['REST API', 'Node.js', 'MongoDB', 'GraphQL'],
  'Escalation workflow':         ['Node.js', 'TypeScript', 'System Design', 'Agile/Scrum'],
  'A/B testing framework':       ['JavaScript', 'React', 'Data Analysis', 'Testing/QA'],
};

async function main() {
  await connectDb(process.env.MONGO_URL);
  const hash = await bcrypt.hash(PASSWORD, 12);

  // ── Lookup org data ──
  const allDepts = await Department.find({ active: true });
  const allDesigs = await Designation.find({ active: true });
  const allLocs = await Location.find({ active: true });
  const allShifts = await Shift.find({ active: true });
  const defaultShift = allShifts.find((s) => s.isDefault) || allShifts[0];

  if (!allDepts.length || !allDesigs.length) {
    console.error('Run seed-org.js first to create departments, designations, etc.');
    process.exit(1);
  }

  // ── Create Users ──
  const userMap = {};
  for (let i = 0; i < PEOPLE.length; i++) {
    const p = PEOPLE[i];
    let user = await User.findOne({ email: p.email });
    if (!user) {
      user = await User.create({
        email: p.email,
        displayName: p.name,
        passwordHash: hash,
        roles: [p.role],
        active: true,
        employeeCode: `EMP${String(i + 1).padStart(4, '0')}`,
        departmentId: pick(allDepts)._id,
        designationId: pick(allDesigs)._id,
        locationId: pick(allLocs)._id,
        shiftId: defaultShift?._id || null,
        employmentType: i < 20 ? 'full-time' : pick(['full-time', 'contract', 'intern']),
        dateOfJoining: addDays(new Date(), -rand(60, 900)),
        phone: `+91 ${rand(70000, 99999)} ${rand(10000, 99999)}`,
        attendanceActivatedDate: ymd(addDays(new Date(), -45)),
      });
    } else {
      user.passwordHash = hash;
      user.displayName = p.name;
      user.roles = [p.role];
      if (!user.employeeCode) user.employeeCode = `EMP${String(i + 1).padStart(4, '0')}`;
      if (!user.departmentId) user.departmentId = pick(allDepts)._id;
      if (!user.designationId) user.designationId = pick(allDesigs)._id;
      if (!user.locationId) user.locationId = pick(allLocs)._id;
      if (!user.shiftId) user.shiftId = defaultShift?._id || null;
      if (!user.attendanceActivatedDate) user.attendanceActivatedDate = ymd(addDays(new Date(), -45));
      await user.save();
    }
    userMap[p.email] = user;
  }
  console.log(`✓ Users: ${Object.keys(userMap).length}`);

  // ── Create skill documents (assigned to users after tasks are created) ──
  const SKILL_NAMES = [
    'JavaScript', 'TypeScript', 'React', 'Node.js', 'Python',
    'Java', 'Go', 'SQL', 'MongoDB', 'PostgreSQL',
    'AWS', 'Docker', 'Kubernetes', 'CI/CD', 'Git',
    'REST API', 'GraphQL', 'Redis', 'HTML/CSS', 'Figma',
    'Agile/Scrum', 'System Design', 'Data Analysis', 'Machine Learning', 'DevOps',
    'Testing/QA', 'Linux', 'Terraform', 'Microservices', 'Communication',
  ];
  const skillDocs = [];
  for (const name of SKILL_NAMES) {
    let skill = await Skill.findOne({ name });
    if (!skill) skill = await Skill.create({ name });
    skillDocs.push(skill);
  }
  const skillByName = new Map(skillDocs.map((s) => [s.name, s._id]));
  console.log(`✓ Skills: ${skillDocs.length}`);

  // ── Assign reporting managers ──
  const rms = [userMap['kavitha.nair@test.com'], userMap['suresh.kumar@test.com'], userMap['meera.krishnan@test.com']];
  const employees = PEOPLE.filter((p) => ['employee', 'team_lead'].includes(p.role)).map((p) => userMap[p.email]);
  for (let i = 0; i < employees.length; i++) {
    const rm = rms[i % rms.length];
    employees[i].reportingManagerId = rm._id;
    await employees[i].save();
  }
  // PMs report to director
  const director = userMap['rahul.verma@test.com'];
  for (const email of ['sneha.iyer@test.com', 'vikram.reddy@test.com']) {
    userMap[email].reportingManagerId = director._id;
    await userMap[email].save();
  }
  // RMs report to VP
  const vp = userMap['priya.patel@test.com'];
  for (const rm of rms) {
    rm.reportingManagerId = vp._id;
    await rm.save();
  }
  console.log('✓ Reporting structure set');

  // ── Projects & Tasks ──
  const pmUsers = [userMap['sneha.iyer@test.com'], userMap['vikram.reddy@test.com']];
  const allEmployees = [...employees, ...rms];
  const projects = [];

  for (let pi = 0; pi < PROJECTS_DATA.length; pi++) {
    const pd = PROJECTS_DATA[pi];
    const pm = pmUsers[pi % pmUsers.length];
    const memberPool = allEmployees.sort(() => Math.random() - 0.5).slice(0, rand(3, 6));
    const memberIds = memberPool.map((u) => u._id);

    let project = await Project.findOne({ name: pd.name });
    if (!project) {
      project = await Project.create({
        name: pd.name,
        description: pd.desc,
        ownerPm: pm._id,
        members: memberIds,
        status: 'active',
        startDate: addDays(new Date(), -rand(30, 120)),
        targetDate: addDays(new Date(), rand(30, 180)),
        clientName: pd.client,
        billingType: pd.billing,
        billingRate: pd.rate || null,
        currency: pd.billing !== 'non-billable' ? 'INR' : null,
        milestones: pd.billing === 'milestone' ? [
          { name: 'Milestone 1 - MVP', amount: 300000, status: 'completed' },
          { name: 'Milestone 2 - Beta', amount: 400000, status: 'in_progress' },
          { name: 'Milestone 3 - Launch', amount: 300000, status: 'pending' },
        ] : [],
        phases: [
          { name: 'Phase 1', description: 'Foundation', order: 1, status: 'completed' },
          { name: 'Phase 2', description: 'Development', order: 2, status: 'active' },
          { name: 'Phase 3', description: 'Testing & Launch', order: 3, status: 'upcoming' },
        ],
      });
      project.activePhase = project.phases[1]._id;
      await project.save();
    }
    projects.push({ project, members: memberPool, pm });

    // Tasks
    const tasks = TASK_TEMPLATES[pi] || TASK_TEMPLATES[0];
    const projSkillSet = new Set();
    for (let ti = 0; ti < tasks.length; ti++) {
      const taskSkillNames = TASK_SKILLS[tasks[ti]] || [];
      const taskSkillIds = taskSkillNames.map((n) => skillByName.get(n)).filter(Boolean);
      for (const n of taskSkillNames) projSkillSet.add(n);

      const existing = await Task.findOne({ project: project._id, title: tasks[ti] });
      if (existing) {
        existing.requiredSkills = taskSkillIds;
        await existing.save();
        continue;
      }
      const assignee = memberPool[ti % memberPool.length];
      const statuses = ['todo', 'in_progress', 'in_progress', 'done', 'done', 'blocked'];
      const status = statuses[ti] || 'todo';
      await Task.create({
        project: project._id,
        phaseId: project.phases[Math.min(ti < 3 ? 0 : 1, project.phases.length - 1)]._id,
        title: tasks[ti],
        description: `Task for ${pd.name}`,
        estimatedHours: rand(4, 40),
        estimateValue: rand(4, 40),
        estimateUnit: 'hours',
        assignees: [{ user: assignee._id, sharePct: 100, estimatedHours: rand(4, 40) }],
        requiredSkills: taskSkillIds,
        status,
        percentComplete: status === 'done' ? 100 : status === 'in_progress' ? rand(20, 80) : 0,
        createdBy: pm._id,
        startDate: addDays(new Date(), -rand(5, 60)),
        dueDate: addDays(new Date(), rand(5, 45)),
        completedAt: status === 'done' ? addDays(new Date(), -rand(1, 15)) : null,
      });
    }
    // Update project requiredSkills
    project.requiredSkills = [...projSkillSet].map((n) => skillByName.get(n)).filter(Boolean);
    await project.save();
  }
  console.log(`✓ Projects: ${projects.length}, Tasks: ${await Task.countDocuments()}`);

  // ── Assign skills to users based on their tasks ──
  for (const u of Object.values(userMap)) {
    const userTasks = await Task.find({ 'assignees.user': u._id });
    const skillSet = new Set();
    for (const t of userTasks) {
      const mapped = TASK_SKILLS[t.title] || [];
      for (const s of mapped) skillSet.add(s);
    }
    if (skillSet.size === 0) {
      const p = PEOPLE.find((pp) => pp.email === u.email);
      const fallback = {
        pm: ['Agile/Scrum', 'Communication', 'Figma'],
        hr: ['Communication', 'Data Analysis', 'Agile/Scrum'],
        finance: ['Data Analysis', 'SQL', 'Communication'],
        vp: ['System Design', 'Communication', 'Agile/Scrum'],
        director: ['System Design', 'Communication', 'DevOps'],
        admin: ['System Design', 'DevOps', 'AWS'],
      };
      const fb = fallback[p?.role] || ['Communication'];
      for (const s of fb) skillSet.add(s);
    }
    u.skills = [...skillSet].map((n) => skillByName.get(n)).filter(Boolean);
    await u.save();
  }
  console.log('✓ Skills assigned based on tasks');

  // ── Attendance (last 30 working days for all users) ──
  const today = new Date();
  let attCount = 0;
  for (const u of Object.values(userMap)) {
    for (let d = 1; d <= 35; d++) {
      const day = addDays(today, -d);
      const dow = day.getDay();
      if (dow === 0 || dow === 6) continue;
      const dateStr = ymd(day);

      const existing = await Attendance.findOne({ userId: u._id, date: dateStr });
      if (existing) continue;

      // 85% present, 10% WFH, 5% absent
      const roll = Math.random();
      if (roll > 0.95) continue; // absent

      const punchType = roll > 0.85 ? 'wfh' : 'office';
      const ciH = rand(8, 10);
      const ciM = rand(0, 59);
      const coH = rand(17, 19);
      const coM = rand(0, 59);
      const checkIn = at(day, ciH, ciM);
      const checkOut = at(day, coH, coM);
      const totalMinutes = Math.round((checkOut - checkIn) / 60000);
      const breakMinutes = rand(30, 60);
      const effectiveMinutes = totalMinutes - breakMinutes;

      const doc = new Attendance({
        userId: u._id, date: dateStr, checkIn, checkOut,
        totalMinutes, breakMinutes, effectiveMinutes,
        punchType,
        status: punchType === 'wfh' ? 'wfh' : 'present',
      });
      await doc.save();
      attCount++;
    }
  }
  console.log(`✓ Attendance records: ${attCount}`);

  // ── Leave requests ──
  const leaveTypes = ['casual', 'sick', 'earned'];
  let leaveCount = 0;
  for (const emp of employees) {
    // 2-3 leave requests per employee
    const count = rand(2, 3);
    for (let i = 0; i < count; i++) {
      const type = pick(leaveTypes);
      const startOffset = rand(5, 40);
      const duration = rand(1, 3);
      const startDate = ymd(addDays(today, -startOffset));
      const endDate = ymd(addDays(today, -startOffset + duration - 1));
      const rm = await User.findById(emp.reportingManagerId);

      const existing = await Leave.findOne({ userId: emp._id, startDate });
      if (existing) continue;

      const statuses = ['approved', 'approved', 'pending', 'rejected'];
      const status = statuses[i] || 'pending';

      await Leave.create({
        userId: emp._id,
        type,
        startDate,
        endDate,
        halfDay: duration === 1 && Math.random() > 0.7 ? 'first' : 'none',
        requestedDays: workingDays(startDate, endDate),
        reason: pick(LEAVE_REASONS),
        status,
        requestedAt: addDays(today, -startOffset - 2),
        decidedBy: status !== 'pending' ? rm?._id : null,
        decidedAt: status !== 'pending' ? addDays(today, -startOffset - 1) : null,
        assignedApprover: rm?._id || null,
      });
      leaveCount++;
    }
  }
  // A few fresh pending leaves for testing approvals
  for (let i = 0; i < 4; i++) {
    const emp = employees[i];
    const rm = await User.findById(emp.reportingManagerId);
    const startDate = ymd(addDays(today, rand(2, 10)));
    const endDate = ymd(addDays(today, rand(11, 14)));
    const existing = await Leave.findOne({ userId: emp._id, startDate });
    if (existing) continue;
    await Leave.create({
      userId: emp._id,
      type: pick(leaveTypes),
      startDate, endDate,
      requestedDays: workingDays(startDate, endDate),
      reason: pick(LEAVE_REASONS),
      status: 'pending',
      assignedApprover: rm?._id || null,
    });
    leaveCount++;
  }
  console.log(`✓ Leave requests: ${leaveCount}`);

  // ── Leave balances ──
  const currentYear = today.getFullYear();
  let balCount = 0;
  for (const u of Object.values(userMap)) {
    let balance = await LeaveBalance.findOne({ userId: u._id, year: currentYear });
    if (!balance) {
      balance = await LeaveBalance.create({ userId: u._id, year: currentYear });
    }
    // Reset used counts and recompute from approved leaves
    balance.casual.used = 0;
    balance.sick.used = 0;
    balance.earned.used = 0;

    const approvedLeaves = await Leave.find({
      userId: u._id,
      status: 'approved',
      startDate: { $gte: `${currentYear}-01-01`, $lte: `${currentYear}-12-31` },
    });
    for (const lv of approvedLeaves) {
      if (['casual', 'sick', 'earned'].includes(lv.type)) {
        balance[lv.type].used += lv.requestedDays || 0;
      }
    }
    await balance.save();
    balCount++;
  }
  console.log(`✓ Leave balances: ${balCount}`);

  // ── Overtime requests ──
  let otCount = 0;
  for (let i = 0; i < 6; i++) {
    const emp = employees[i];
    const date = ymd(addDays(today, -rand(1, 7)));
    const existing = await Overtime.findOne({ userId: emp._id, date, status: 'pending' });
    if (existing) continue;
    await Overtime.create({
      userId: emp._id,
      date,
      startTime: '18:30',
      endTime: `${rand(19, 21)}:${String(rand(0, 59)).padStart(2, '0')}`,
      minutes: rand(60, 180),
      reason: pick(['work-overload', 'deadline', 'client-request', 'maintenance']),
      note: pick(['Sprint deadline', 'Client demo prep', 'Production hotfix', 'Release deployment', '']),
      status: i < 4 ? 'pending' : 'approved',
      decidedBy: i >= 4 ? rms[0]._id : null,
      decidedAt: i >= 4 ? addDays(today, -rand(1, 3)) : null,
    });
    otCount++;
  }
  console.log(`✓ Overtime requests: ${otCount}`);

  // ── Regularise requests ──
  let regCount = 0;
  for (let i = 0; i < 5; i++) {
    const emp = employees[i + 3];
    const date = ymd(addDays(today, -rand(2, 10)));
    const doc = await Attendance.findOne({ userId: emp._id, date });
    if (!doc || doc.regularise?.status !== 'none') continue;
    doc.regularise = {
      status: i < 3 ? 'pending' : 'approved',
      reason: pick(['Forgot to check in', 'System was down', 'Biometric not working', 'Was in client office']),
      correctedCheckIn: '09:30',
      correctedCheckOut: '18:30',
      requestedAt: addDays(today, -rand(1, 5)),
      decidedBy: i >= 3 ? rms[0]._id : null,
      decidedAt: i >= 3 ? addDays(today, -1) : null,
    };
    await doc.save();
    regCount++;
  }
  console.log(`✓ Regularise requests: ${regCount}`);

  // ── Timesheets (last 4 weeks) ──
  const allProjects = await Project.find();
  const projBillable = new Map();
  for (const p of allProjects) projBillable.set(String(p._id), p.billingType !== 'non-billable');

  const WORK_NOTES = [
    'Sprint planning & standup', 'Code review and PR feedback', 'Worked on API endpoints',
    'Bug fixes from QA', 'Database query optimization', 'Wrote integration tests',
    'Design discussion with team', 'Client demo preparation', 'Refactored auth module',
    'Updated documentation', 'Pair programming session', 'Deployed to staging',
    'Debugging prod issue', 'Feature flag setup', 'Performance profiling',
    'UI fixes per design review', 'Schema migration', 'Slack/email follow-ups',
    'Backlog grooming', 'Retro & action items',
  ];

  let tsCount = 0;
  for (const emp of [...employees, ...rms]) {
    const userTasks = await Task.find({ 'assignees.user': emp._id }).limit(3);
    if (userTasks.length === 0) continue;

    for (let w = 0; w < 4; w++) {
      const monday = addDays(today, -(today.getDay() === 0 ? 6 : today.getDay() - 1) - w * 7);
      const weekStart = ymd(monday);

      const existing = await Timesheet.findOne({ userId: emp._id, weekStart });
      if (existing) continue;

      // w=0 current week → draft, w=1 last week → submitted, w=2/3 older → approved
      const statuses = ['draft', 'submitted', 'approved', 'approved'];
      const status = statuses[w] || 'approved';

      const n = userTasks.length;
      const dayKeys = ['mon', 'tue', 'wed', 'thu', 'fri'];
      const todayDow = today.getDay();
      const todayIdx = todayDow === 0 ? -1 : todayDow - 1; // 0=mon..4=fri, -1=sun
      const tsTasks = userTasks.map((t, ti) => {
        const isBillable = projBillable.get(String(t.project)) || false;
        const share = ti === 0 ? 0.5 : (0.5 / (n - 1 || 1));
        const dayMin = () => Math.round(rand(420, 480) * share);
        const dayNote = () => Math.random() > 0.5 ? pick(WORK_NOTES) : '';
        const entries = {}, billable = {}, notes = {};
        for (let di = 0; di < dayKeys.length; di++) {
          const dk = dayKeys[di];
          const isFuture = w === 0 && di > todayIdx;
          entries[dk] = isFuture ? 0 : dayMin();
          billable[dk] = isBillable;
          notes[dk] = isFuture ? '' : dayNote();
        }
        return { id: `task-${ti}`, name: t.title, taskId: t._id, entries, billable, notes };
      });

      const submittedAt = status !== 'draft' ? addDays(monday, 5) : null;
      const reviewedAt = status === 'approved' ? addDays(monday, 6) : null;
      const reviewer = status === 'approved' ? pmUsers[w % pmUsers.length]._id : null;

      const dayStatus = {};
      for (let di = 0; di < dayKeys.length; di++) {
        const d = dayKeys[di];
        const isFuture = w === 0 && di > todayIdx;
        if (isFuture) {
          dayStatus[d] = { status: 'draft', submittedAt: null, reviewedAt: null, reviewedBy: null, rejectionReason: '' };
        } else if (status === 'approved') {
          dayStatus[d] = { status: 'approved', submittedAt, reviewedAt, reviewedBy: reviewer, rejectionReason: '' };
        } else if (status === 'submitted') {
          dayStatus[d] = { status: 'submitted', submittedAt, reviewedAt: null, reviewedBy: null, rejectionReason: '' };
        } else {
          dayStatus[d] = { status: 'draft', submittedAt: null, reviewedAt: null, reviewedBy: null, rejectionReason: '' };
        }
      }

      await Timesheet.create({
        userId: emp._id,
        weekStart,
        tasks: tsTasks,
        status,
        submittedAt,
        reviewedAt,
        reviewedBy: reviewer,
        dayStatus,
      });
      tsCount++;
    }
  }
  console.log(`✓ Timesheets: ${tsCount}`);

  // ── Onboarding ────────────────────────────────────────────
  await OnboardingCase.deleteMany({});
  await Offer.deleteMany({});
  await OnboardingTemplate.deleteMany({});
  await OnboardingTask.deleteMany({});
  await DocumentRequest.deleteMany({});

  const hrUser = users.find(u => u.roles.includes('hr')) || users[0];
  const managerUser = users.find(u => u.roles.includes('reporting_manager')) || users[1];

  const template = await OnboardingTemplate.create({
    name: 'Engineering FTE Onboarding',
    appliesTo: { employmentType: 'full_time' },
    tasks: [
      { key: 'provision_laptop', title: 'Provision laptop', ownerRole: 'it', offsetDays: -3, category: 'asset', mandatory: true, dependsOn: [] },
      { key: 'setup_email', title: 'Create email account', ownerRole: 'it', offsetDays: -2, category: 'access', mandatory: true, dependsOn: ['provision_laptop'] },
      { key: 'id_card', title: 'Prepare ID card', ownerRole: 'hr', offsetDays: -1, category: 'admin', mandatory: true, dependsOn: [] },
      { key: 'welcome_kit', title: 'Prepare welcome kit', ownerRole: 'hr', offsetDays: 0, category: 'admin', mandatory: false, dependsOn: [] },
      { key: 'team_intro', title: 'Schedule team introduction', ownerRole: 'manager', offsetDays: 0, category: 'training', mandatory: true, dependsOn: [] },
      { key: 'read_handbook', title: 'Read employee handbook', ownerRole: 'candidate', offsetDays: -5, category: 'document', mandatory: true, dependsOn: [] },
      { key: 'bank_details', title: 'Submit bank details', ownerRole: 'candidate', offsetDays: -3, category: 'document', mandatory: true, dependsOn: [] },
    ],
  });

  const candidates = [
    { firstName: 'Priya', lastName: 'Sharma', personalEmail: 'priya.sharma@gmail.com', phone: '9876543210', designation: 'Senior Engineer', status: 'DRAFT' },
    { firstName: 'Arjun', lastName: 'Patel', personalEmail: 'arjun.patel@gmail.com', phone: '9876543211', designation: 'Product Manager', status: 'OFFER_SENT' },
    { firstName: 'Neha', lastName: 'Gupta', personalEmail: 'neha.gupta@gmail.com', phone: '9876543212', designation: 'UX Designer', status: 'OFFER_ACCEPTED' },
    { firstName: 'Rahul', lastName: 'Kumar', personalEmail: 'rahul.kumar@gmail.com', phone: '9876543213', designation: 'Frontend Developer', status: 'PRE_BOARDING' },
    { firstName: 'Ananya', lastName: 'Singh', personalEmail: 'ananya.singh@gmail.com', phone: '9876543214', designation: 'Data Analyst', status: 'JOINED' },
    { firstName: 'Vikram', lastName: 'Reddy', personalEmail: 'vikram.reddy@gmail.com', phone: '9876543215', designation: 'Backend Engineer', status: 'INDUCTION' },
    { firstName: 'Deepa', lastName: 'Nair', personalEmail: 'deepa.nair@gmail.com', phone: '9876543216', designation: 'QA Lead', status: 'PROBATION' },
  ];

  for (const cand of candidates) {
    const joiningDate = new Date('2026-08-01');
    const c = await OnboardingCase.create({
      candidate: { firstName: cand.firstName, lastName: cand.lastName, personalEmail: cand.personalEmail, phone: cand.phone },
      designation: cand.designation,
      reportingManager: managerUser._id,
      joiningDate,
      probationMonths: 3,
      employmentType: 'full_time',
      workflowTemplate: template._id,
      status: cand.status,
      createdBy: hrUser._id,
    });

    if (['OFFER_SENT', 'OFFER_ACCEPTED', 'PRE_BOARDING', 'JOINED', 'INDUCTION', 'PROBATION'].includes(cand.status)) {
      const offerStatus = cand.status === 'OFFER_SENT' ? 'sent'
        : ['OFFER_DECLINED'].includes(cand.status) ? 'declined'
        : 'accepted';
      await Offer.create({
        onboardingCase: c._id,
        ctcAnnual: 1200000 + Math.floor(Math.random() * 800000),
        componentsPreview: [
          { key: 'basic', label: 'Basic', type: 'earning', calc: 'percent_of_ctc', value: 50, taxable: true, proratable: true },
          { key: 'hra', label: 'HRA', type: 'earning', calc: 'percent_of_basic', value: 40, taxable: true, proratable: true },
          { key: 'pf', label: 'PF (Employer)', type: 'deduction', calc: 'percent_of_basic', value: 12, taxable: false, proratable: true },
        ],
        joiningDate,
        status: offerStatus,
        sentAt: new Date(),
        respondedAt: offerStatus !== 'sent' ? new Date() : null,
      });
    }

    if (['PRE_BOARDING', 'JOINED', 'INDUCTION', 'PROBATION'].includes(cand.status)) {
      const defaultDocs = ['pan', 'aadhaar', 'bank_proof', 'photo', 'education'];
      for (const docType of defaultDocs) {
        const mandatory = ['pan', 'aadhaar', 'bank_proof', 'photo'].includes(docType);
        const isVerified = ['JOINED', 'INDUCTION', 'PROBATION'].includes(cand.status) && mandatory;
        await DocumentRequest.create({
          onboardingCase: c._id,
          docType,
          mandatory,
          verifyStatus: isVerified ? 'verified' : (cand.status !== 'PRE_BOARDING' && mandatory ? 'submitted' : 'awaiting'),
          ...(isVerified ? { verifiedBy: hrUser._id, verifiedAt: new Date() } : {}),
        });
      }

      for (const t of template.tasks) {
        const isDone = ['JOINED', 'INDUCTION', 'PROBATION'].includes(cand.status);
        await OnboardingTask.create({
          onboardingCase: c._id,
          templateKey: t.key,
          title: t.title,
          ownerRole: t.ownerRole,
          assignedTo: t.ownerRole === 'manager' ? managerUser._id : (t.ownerRole === 'hr' ? hrUser._id : null),
          dueDate: new Date(joiningDate.getTime() + t.offsetDays * 86400000),
          dependsOn: t.dependsOn,
          mandatory: t.mandatory,
          status: isDone ? 'done' : 'pending',
          ...(isDone ? { completedAt: new Date(), completedBy: hrUser._id } : {}),
        });
      }
    }
  }

  console.log('  Onboarding: 7 cases, 1 template, tasks + docs per case');

  // ── Summary ──
  console.log('\n✅ Full seed complete!');
  console.log(`   Password for all users: ${PASSWORD}`);
  console.log('   Login with any email above, e.g.:');
  console.log('   Admin:    arjun.sharma@test.com');
  console.log('   VP:       priya.patel@test.com');
  console.log('   Director: rahul.verma@test.com');
  console.log('   PM:       sneha.iyer@test.com');
  console.log('   HR:       ananya.gupta@test.com');
  console.log('   Finance:  deepak.joshi@test.com');
  console.log('   RM:       kavitha.nair@test.com');
  console.log('   TL:       meera.krishnan@test.com');
  console.log('   Employee: aditya.singh@test.com');

  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
