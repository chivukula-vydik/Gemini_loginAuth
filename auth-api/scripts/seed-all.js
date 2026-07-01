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
import { LegalEntity } from '../src/models/LegalEntity.js';
import { BusinessUnit } from '../src/models/BusinessUnit.js';
import { StatutoryConfig } from '../src/models/StatutoryConfig.js';
import { PayGrade } from '../src/models/PayGrade.js';
import { PayGroup } from '../src/models/PayGroup.js';
import { SalaryStructure } from '../src/models/SalaryStructure.js';
import { InvestmentDeclaration } from '../src/models/InvestmentDeclaration.js';
import { PayrollRun } from '../src/models/PayrollRun.js';
import { Payslip } from '../src/models/Payslip.js';
import { Reimbursement } from '../src/models/Reimbursement.js';
import { Loan } from '../src/models/Loan.js';

// Usage:  node scripts/seed-all.js

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function ymdUtc(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
function at(date, hour, minute) {
  const d = new Date(date);
  d.setHours(hour, minute, 0, 0);
  return d;
}
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function addDaysUtc(d, n) { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; }

const PASSWORD = 'test1234';

const PEOPLE = [
  { name: 'Arjun Sharma', email: 'arjun.sharma@test.com', role: 'admin', dob: '1990-03-15', gender: 'male', blood: 'B+', marital: 'married', city: 'Bangalore' },
  { name: 'Priya Patel', email: 'priya.patel@test.com', role: 'vp', dob: '1985-07-22', gender: 'female', blood: 'A+', marital: 'married', city: 'Mumbai' },
  { name: 'Rahul Verma', email: 'rahul.verma@test.com', role: 'director', dob: '1988-11-10', gender: 'male', blood: 'O+', marital: 'married', city: 'Delhi' },
  { name: 'Sneha Iyer', email: 'sneha.iyer@test.com', role: 'pm', dob: '1993-06-26', gender: 'female', blood: 'AB+', marital: 'single', city: 'Chennai' },
  { name: 'Vikram Reddy', email: 'vikram.reddy@test.com', role: 'pm', dob: '1991-06-27', gender: 'male', blood: 'B+', marital: 'married', city: 'Hyderabad' },
  { name: 'Ananya Gupta', email: 'ananya.gupta@test.com', role: 'hr', dob: '1994-06-28', gender: 'female', blood: 'A-', marital: 'single', city: 'Bangalore' },
  { name: 'Deepak Joshi', email: 'deepak.joshi@test.com', role: 'finance', dob: '1989-06-29', gender: 'male', blood: 'O+', marital: 'married', city: 'Pune' },
  { name: 'Kavitha Nair', email: 'kavitha.nair@test.com', role: 'reporting_manager', dob: '1992-06-27', gender: 'female', blood: 'B-', marital: 'married', city: 'Kochi' },
  { name: 'Suresh Kumar', email: 'suresh.kumar@test.com', role: 'reporting_manager', dob: '1987-07-03', gender: 'male', blood: 'A+', marital: 'married', city: 'Bangalore' },
  { name: 'Meera Krishnan', email: 'meera.krishnan@test.com', role: 'team_lead', dob: '1995-06-26', gender: 'female', blood: 'O-', marital: 'single', city: 'Chennai' },
  { name: 'Aditya Singh', email: 'aditya.singh@test.com', role: 'employee', dob: '1996-07-06', gender: 'male', blood: 'B+', marital: 'single', city: 'Delhi' },
  { name: 'Divya Menon', email: 'divya.menon@test.com', role: 'employee', dob: '1994-06-30', gender: 'female', blood: 'A+', marital: 'single', city: 'Bangalore' },
  { name: 'Rohan Deshmukh', email: 'rohan.deshmukh@test.com', role: 'employee', dob: '1993-07-16', gender: 'male', blood: 'AB-', marital: 'married', city: 'Pune' },
  { name: 'Pooja Rao', email: 'pooja.rao@test.com', role: 'employee', dob: '1997-06-27', gender: 'female', blood: 'O+', marital: 'single', city: 'Hyderabad' },
  { name: 'Nikhil Thakur', email: 'nikhil.thakur@test.com', role: 'employee', dob: '1990-08-25', gender: 'male', blood: 'A-', marital: 'married', city: 'Mumbai' },
  { name: 'Lakshmi Sundaram', email: 'lakshmi.sundaram@test.com', role: 'employee', dob: '1991-07-11', gender: 'female', blood: 'B+', marital: 'married', city: 'Chennai' },
  { name: 'Amit Chauhan', email: 'amit.chauhan@test.com', role: 'employee', dob: '1988-08-10', gender: 'male', blood: 'O+', marital: 'married', city: 'Delhi' },
  { name: 'Ritu Agarwal', email: 'ritu.agarwal@test.com', role: 'employee', dob: '1995-06-28', gender: 'female', blood: 'AB+', marital: 'single', city: 'Bangalore' },
  { name: 'Karthik Bhat', email: 'karthik.bhat@test.com', role: 'employee', dob: '1992-09-24', gender: 'male', blood: 'B-', marital: 'single', city: 'Mangalore' },
  { name: 'Nisha Pillai', email: 'nisha.pillai@test.com', role: 'employee', dob: '1994-10-24', gender: 'female', blood: 'A+', marital: 'single', city: 'Trivandrum' },
  { name: 'Sanjay Malhotra', email: 'sanjay.malhotra@test.com', role: 'employee', dob: '1989-06-29', gender: 'male', blood: 'O-', marital: 'married', city: 'Chandigarh' },
  { name: 'Tanya Saxena', email: 'tanya.saxena@test.com', role: 'employee', dob: '1996-12-23', gender: 'female', blood: 'B+', marital: 'single', city: 'Jaipur' },
  { name: 'Rajesh Hegde', email: 'rajesh.hegde@test.com', role: 'employee', dob: '1987-01-12', gender: 'male', blood: 'A+', marital: 'married', city: 'Bangalore' },
  { name: 'Swati Kulkarni', email: 'swati.kulkarni@test.com', role: 'employee', dob: '1993-06-26' },
  { name: 'Manish Tiwari', email: 'manish.tiwari@test.com', role: 'employee', dob: '1991-07-02' },
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

  // ── Lookup legal entities & business units ──
  const allEntities = await LegalEntity.find({ active: true });
  const allBUs = await BusinessUnit.find({ active: true });

  const EMERGENCY_NAMES = ['Ramesh', 'Sunita', 'Rajesh', 'Meena', 'Prakash', 'Lakshmi', 'Mohan', 'Geeta', 'Sunil', 'Kavita'];
  const EMERGENCY_RELS = ['Father', 'Mother', 'Spouse', 'Brother', 'Sister'];
  const BANKS = ['State Bank of India', 'HDFC Bank', 'ICICI Bank', 'Axis Bank', 'Kotak Mahindra Bank', 'Punjab National Bank'];
  const ADDRESSES = [
    '42, MG Road, Indiranagar', '15, HSR Layout, Sector 2', '8, Koramangala 4th Block',
    '23, Banjara Hills, Road No 12', '56, Powai, Hiranandani Gardens', '31, Anna Nagar, 2nd Avenue',
    '7, Aundh, DP Road', '19, Sector 62, Noida', '44, Salt Lake, Sector V', '12, Jubilee Hills',
  ];

  // ── Create Users ──
  const userMap = {};
  for (let i = 0; i < PEOPLE.length; i++) {
    const p = PEOPLE[i];
    const joiningDate = addDays(new Date(), -rand(30, 365));
    const probEnd = addDays(joiningDate, 180);
    const emergName = pick(EMERGENCY_NAMES) + ' ' + p.name.split(' ').pop();
    const panLetter = p.name[0].toUpperCase();
    const userData = {
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
      legalEntityId: pick(allEntities)?._id || null,
      businessUnitId: pick(allBUs)?._id || null,
      employmentType: i < 20 ? 'full-time' : pick(['full-time', 'contract', 'intern']),
      dateOfJoining: joiningDate,
      probationEndDate: probEnd,
      dateOfBirth: new Date(p.dob),
      phone: `+91 ${rand(70000, 99999)} ${rand(10000, 99999)}`,
      gender: p.gender,
      bloodGroup: p.blood,
      maritalStatus: p.marital,
      nationality: 'Indian',
      address: `${pick(ADDRESSES)}, ${p.city}, India - ${rand(400000, 600000)}`,
      emergencyContactName: emergName,
      emergencyContactPhone: `+91 ${rand(70000, 99999)} ${rand(10000, 99999)}`,
      emergencyContactRelation: pick(EMERGENCY_RELS),
      pan: `${panLetter}${String.fromCharCode(65 + rand(0, 25))}${String.fromCharCode(65 + rand(0, 25))}P${String.fromCharCode(65 + rand(0, 25))}${rand(1000, 9999)}${String.fromCharCode(65 + rand(0, 25))}`,
      aadhaar: `${rand(2000, 9999)} ${rand(1000, 9999)} ${rand(1000, 9999)}`,
      bankName: pick(BANKS),
      bankAccount: `${rand(10000000, 99999999)}${rand(1000, 9999)}`,
      ifsc: `${pick(['SBIN', 'HDFC', 'ICIC', 'UTIB', 'KKBK', 'PUNB'])}0${rand(100000, 999999)}`,
      attendanceActivatedDate: ymd(addDays(new Date(), -45)),
    };

    let user = await User.findOne({ email: p.email });
    if (!user) {
      user = await User.create(userData);
    } else {
      Object.assign(user, userData);
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
  const allUsers = Object.values(userMap);
  const allEmployees = [...employees, ...rms];
  const projects = [];

  // Distribute ALL users across projects so everyone has at least 1 project
  const userProjectAssignment = new Map(); // userId -> [projectIndex]
  for (let i = 0; i < allUsers.length; i++) {
    const projIdx = i % PROJECTS_DATA.length;
    if (!userProjectAssignment.has(projIdx)) userProjectAssignment.set(projIdx, []);
    userProjectAssignment.get(projIdx).push(allUsers[i]);
  }

  for (let pi = 0; pi < PROJECTS_DATA.length; pi++) {
    const pd = PROJECTS_DATA[pi];
    const pm = pmUsers[pi % pmUsers.length];
    // Guaranteed members from round-robin + a few extra random ones
    const guaranteed = userProjectAssignment.get(pi) || [];
    const extras = allEmployees.filter(u => !guaranteed.includes(u)).sort(() => Math.random() - 0.5).slice(0, rand(1, 3));
    const memberPool = [...new Set([...guaranteed, ...extras])];
    const memberIds = memberPool.map((u) => u._id);

    let project = await Project.findOne({ name: pd.name });
    if (!project) {
      project = await Project.create({
        name: pd.name,
        description: pd.desc,
        ownerPm: pm._id,
        members: memberIds,
        status: 'active',
        startDate: addDays(new Date(), -rand(14, 30)),
        targetDate: addDays(new Date(), rand(7, 30)),
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
      const estHours = rand(4, 16);
      await Task.create({
        project: project._id,
        phaseId: project.phases[Math.min(ti < 3 ? 0 : 1, project.phases.length - 1)]._id,
        title: tasks[ti],
        description: `Task for ${pd.name}`,
        estimatedHours: estHours,
        estimateValue: estHours,
        estimateUnit: 'hours',
        assignees: [{ user: assignee._id, sharePct: 100, estimatedHours: estHours }],
        requiredSkills: taskSkillIds,
        status,
        percentComplete: status === 'done' ? 100 : status === 'in_progress' ? rand(30, 75) : 0,
        createdBy: pm._id,
        startDate: addDays(new Date(), -rand(3, 20)),
        dueDate: addDays(new Date(), status === 'done' ? -rand(1, 5) : rand(2, 14)),
        completedAt: status === 'done' ? addDays(new Date(), -rand(1, 5)) : null,
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
    // 1 past leave per employee (realistic for a month)
    const type = pick(leaveTypes);
    const startOffset = rand(5, 25);
    const duration = rand(1, 2);
    const startDate = ymd(addDays(today, -startOffset));
    const endDate = ymd(addDays(today, -startOffset + duration - 1));
    const rm = await User.findById(emp.reportingManagerId);

    const existing = await Leave.findOne({ userId: emp._id, startDate });
    if (existing) continue;

    await Leave.create({
      userId: emp._id,
      type,
      startDate,
      endDate,
      halfDay: duration === 1 && Math.random() > 0.7 ? 'first' : 'none',
      requestedDays: workingDays(startDate, endDate),
      reason: pick(LEAVE_REASONS),
      status: 'approved',
      requestedAt: addDays(today, -startOffset - 2),
      decidedBy: rm?._id || null,
      decidedAt: addDays(today, -startOffset - 1),
      assignedApprover: rm?._id || null,
    });
    leaveCount++;
  }
  // 2 fresh pending leaves for testing approvals
  for (let i = 0; i < 2; i++) {
    const emp = employees[i];
    const rm = await User.findById(emp.reportingManagerId);
    const startDate = ymd(addDays(today, rand(3, 7)));
    const endDate = ymd(addDays(today, rand(4, 8)));
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
  // All users get timesheets
  for (const emp of allUsers) {
    const userTasks = await Task.find({ 'assignees.user': emp._id }).limit(3);
    if (userTasks.length === 0) continue;

    // Vary weeks: most log 3-4 weeks, some only 2
    const weeksToLog = rand(2, 4);

    for (let w = 0; w < weeksToLog; w++) {
      // Use UTC to match backend's currentMonday() function
      const nowUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
      const utcDow = nowUtc.getUTCDay();
      const mondayUtc = addDaysUtc(nowUtc, (utcDow === 0 ? -6 : 1 - utcDow) - w * 7);
      const weekStart = ymdUtc(mondayUtc);

      const existing = await Timesheet.findOne({ userId: emp._id, weekStart });
      if (existing) continue;

      const statuses = ['draft', 'submitted', 'approved', 'approved'];
      const status = statuses[w] || 'approved';

      const n = userTasks.length;
      const dayKeys = ['mon', 'tue', 'wed', 'thu', 'fri'];
      const todayDow = nowUtc.getUTCDay();
      const todayIdx = todayDow === 0 ? -1 : todayDow - 1;

      const dayEntries = {};
      for (let di = 0; di < dayKeys.length; di++) {
        const dk = dayKeys[di];
        const isFuture = w === 0 && di > todayIdx;
        if (isFuture) {
          dayEntries[dk] = userTasks.map(() => 0);
        } else {
          // Realistic variation: 5h-8h per day (not everyone does full 8h every day)
          const totalSlots = rand(10, 16); // 10-16 slots of 30min = 5h-8h
          const splits = userTasks.map(() => 0);
          for (let s = 0; s < totalSlots; s++) {
            const idx = Math.random() < 0.5 ? 0 : rand(0, n - 1);
            splits[idx]++;
          }
          dayEntries[dk] = splits.map((s) => s * 30);
        }
      }

      const tsTasks = userTasks.map((t, ti) => {
        const isBillable = projBillable.get(String(t.project)) || false;
        const dayNote = () => Math.random() > 0.6 ? pick(WORK_NOTES) : '';
        const entries = {}, billable = {}, notes = {};
        for (const dk of dayKeys) {
          entries[dk] = dayEntries[dk][ti];
          billable[dk] = isBillable;
          notes[dk] = entries[dk] > 0 ? dayNote() : '';
        }
        return { id: `task-${ti}`, name: t.title, taskId: t._id, entries, billable, notes };
      });

      const submittedAt = status !== 'draft' ? addDaysUtc(mondayUtc, 5) : null;
      const reviewedAt = status === 'approved' ? addDaysUtc(mondayUtc, 6) : null;
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

  // ─── Payroll seed data ───────────────────────────────────────────────
  await StatutoryConfig.deleteMany({});
  await StatutoryConfig.create({
    effectiveFrom: '2026-04-01',
    pf: { employeePct: 12, employerPct: 12, wageCeiling: 15000 },
    esic: { employeePct: 0.75, employerPct: 3.25, grossCeiling: 21000 },
    pt: [
      { state: 'Telangana', slabs: [
        { upTo: 15000, amount: 0 },
        { upTo: 20000, amount: 150 },
        { upTo: 999999999, amount: 200 },
      ]},
      { state: 'Karnataka', slabs: [
        { upTo: 15000, amount: 0 },
        { upTo: 25000, amount: 200 },
        { upTo: 999999999, amount: 200 },
      ]},
    ],
    tds: {
      old: {
        slabs: [
          { upTo: 250000, rate: 0 },
          { upTo: 500000, rate: 5 },
          { upTo: 1000000, rate: 20 },
          { upTo: null, rate: 30 },
        ],
        standardDeduction: 50000,
        rebate: { maxIncome: 500000, maxRebate: 12500 },
        surcharge: [
          { threshold: 5000000, rate: 10 },
          { threshold: 10000000, rate: 15 },
          { threshold: 20000000, rate: 25 },
          { threshold: 50000000, rate: 37 },
        ],
        cessRate: 0.04,
        allowedDeductions: ['80C', '80D', '80E', '80G', 'HRA', '24B', '80CCD(1B)', '80TTA', '80DDB', '80U', '80EEB', 'NPS_EMPLOYER'],
      },
      new: {
        slabs: [
          { upTo: 400000, rate: 0 },
          { upTo: 800000, rate: 5 },
          { upTo: 1200000, rate: 10 },
          { upTo: 1600000, rate: 15 },
          { upTo: 2000000, rate: 20 },
          { upTo: 2400000, rate: 25 },
          { upTo: null, rate: 30 },
        ],
        standardDeduction: 75000,
        rebate: { maxIncome: 1200000, maxRebate: 60000 },
        surcharge: [
          { threshold: 5000000, rate: 10 },
          { threshold: 10000000, rate: 15 },
          { threshold: 20000000, rate: 25 },
        ],
        cessRate: 0.04,
        allowedDeductions: ['NPS_EMPLOYER'],
      },
    },
  });
  console.log('  ✓ statutory config seeded');

  await PayGrade.deleteMany({});
  const grades = await PayGrade.insertMany([
    { code: 'G1', label: 'Junior', minCtc: 300000, maxCtc: 600000, defaultComponents: [
      { key: 'basic', label: 'Basic', type: 'earning', calc: 'fixed', value: 180000, taxable: true, proratable: true },
      { key: 'hra', label: 'HRA', type: 'earning', calc: 'percent_of_basic', value: 50, taxable: true, proratable: true },
      { key: 'special', label: 'Special Allowance', type: 'earning', calc: 'fixed', value: 60000, taxable: true, proratable: true },
    ]},
    { code: 'G2', label: 'Mid-Level', minCtc: 600000, maxCtc: 1200000, defaultComponents: [
      { key: 'basic', label: 'Basic', type: 'earning', calc: 'fixed', value: 420000, taxable: true, proratable: true },
      { key: 'hra', label: 'HRA', type: 'earning', calc: 'percent_of_basic', value: 50, taxable: true, proratable: true },
      { key: 'special', label: 'Special Allowance', type: 'earning', calc: 'fixed', value: 120000, taxable: true, proratable: true },
    ]},
    { code: 'G3', label: 'Senior', minCtc: 1200000, maxCtc: 2400000, defaultComponents: [
      { key: 'basic', label: 'Basic', type: 'earning', calc: 'fixed', value: 720000, taxable: true, proratable: true },
      { key: 'hra', label: 'HRA', type: 'earning', calc: 'percent_of_basic', value: 50, taxable: true, proratable: true },
      { key: 'special', label: 'Special Allowance', type: 'earning', calc: 'fixed', value: 240000, taxable: true, proratable: true },
      { key: 'lta', label: 'LTA', type: 'earning', calc: 'fixed', value: 60000, taxable: true, proratable: false },
    ]},
    { code: 'G4', label: 'Lead / Manager', minCtc: 2400000, maxCtc: 5000000, defaultComponents: [
      { key: 'basic', label: 'Basic', type: 'earning', calc: 'fixed', value: 1200000, taxable: true, proratable: true },
      { key: 'hra', label: 'HRA', type: 'earning', calc: 'percent_of_basic', value: 50, taxable: true, proratable: true },
      { key: 'special', label: 'Special Allowance', type: 'earning', calc: 'fixed', value: 480000, taxable: true, proratable: true },
      { key: 'lta', label: 'LTA', type: 'earning', calc: 'fixed', value: 120000, taxable: true, proratable: false },
    ]},
  ]);
  console.log('  ✓ pay grades seeded');

  await PayGroup.deleteMany({});
  const legalEntity = await LegalEntity.findOne();
  const payGroup = await PayGroup.create({
    name: 'India - Monthly - HYD',
    entity: legalEntity?._id || null,
    cycle: 'calendar',
    ptState: 'Telangana',
    members: allUsers.map(u => u._id),
  });
  console.log('  ✓ pay group seeded');

  // Assign pay grades to users by role
  const gradeMap = { employee: grades[0], pm: grades[1], reporting_manager: grades[2], admin: grades[3] };
  for (const u of allUsers) {
    const role = u.roles?.[0] || 'employee';
    const grade = gradeMap[role] || grades[0];
    await User.updateOne({ _id: u._id }, { payGrade: grade._id, payGroup: payGroup._id });
  }
  console.log('  ✓ user pay assignments updated');

  await SalaryStructure.deleteMany({});
  const ctcByGrade = { G1: 500000, G2: 900000, G3: 1800000, G4: 3600000 };
  for (const u of allUsers) {
    const role = u.roles?.[0] || 'employee';
    const grade = gradeMap[role] || grades[0];
    const ctc = ctcByGrade[grade.code] || 500000;
    const components = grade.defaultComponents.map(c => {
      const scaled = { ...c.toObject ? c.toObject() : c };
      if (scaled.calc === 'fixed') {
        scaled.value = Math.round(ctc * (scaled.value / (grade.minCtc + grade.maxCtc) * 2));
      }
      return scaled;
    });
    await SalaryStructure.create({
      user: u._id,
      ctcAnnual: ctc,
      components: grade.defaultComponents,
      effectiveFrom: '2026-01-01',
    });
  }
  console.log('  ✓ salary structures seeded');

  // ── Investment Declarations ──
  await InvestmentDeclaration.deleteMany({});
  let declCount = 0;
  const SECTIONS = ['80C', '80D', '80G', '80E', '80TTA', 'HRA'];
  for (const u of allUsers) {
    const role = u.roles?.[0] || 'employee';
    const regime = Math.random() > 0.3 ? 'new' : 'old';
    const items = [];
    if (regime === 'old') {
      const numItems = rand(1, 4);
      for (let i = 0; i < numItems; i++) {
        items.push({
          section: SECTIONS[i % SECTIONS.length],
          declaredAmount: pick([50000, 100000, 150000, 25000]),
          proofAmount: null,
          verifyStatus: 'pending',
        });
      }
    }
    await InvestmentDeclaration.create({
      user: u._id,
      financialYear: '2026-27',
      regime,
      items,
      phase: 'declaration',
    });
    declCount++;
  }
  console.log(`✓ Investment declarations: ${declCount}`);

  // ── Loans ──
  await Loan.deleteMany({});
  let loanCount = 0;
  const LOAN_AMOUNTS = [50000, 100000, 200000, 300000];
  for (let i = 0; i < 8; i++) {
    const emp = allUsers[i + 5];
    const principal = pick(LOAN_AMOUNTS);
    const tenure = pick([6, 12, 18, 24]);
    const emi = Math.round(principal / tenure);
    const schedule = [];
    for (let m = 0; m < tenure; m++) {
      const d = new Date(2026, 0 + m, 1);
      schedule.push({
        period: { month: d.getMonth() + 1, year: d.getFullYear() },
        amount: emi,
        status: m < 6 ? 'paid' : 'due',
      });
    }
    await Loan.create({
      user: emp._id,
      principal,
      emiAmount: emi,
      tenureMonths: tenure,
      schedule,
      status: 'active',
    });
    loanCount++;
  }
  console.log(`✓ Loans: ${loanCount}`);

  // ── Reimbursements ──
  await Reimbursement.deleteMany({});
  let reimbCount = 0;
  const REIMB_CATEGORIES = ['travel', 'food', 'internet', 'medical', 'other'];
  const REIMB_DESCS = {
    travel: ['Cab to client office', 'Train tickets - site visit', 'Airport transfer', 'Inter-city bus fare'],
    food: ['Team lunch', 'Client dinner', 'Late-night meal during deploy', 'Working lunch with vendor'],
    internet: ['Monthly broadband bill', 'Mobile hotspot plan', 'WiFi router purchase'],
    medical: ['Doctor consultation fee', 'Lab test charges', 'Pharmacy bill', 'Annual health checkup'],
    other: ['Stationery purchase', 'Courier charges', 'Printing cost', 'Co-working space day pass'],
  };
  for (let i = 0; i < 20; i++) {
    const emp = employees[i % employees.length];
    const cat = pick(REIMB_CATEGORIES);
    const statuses = ['submitted', 'submitted', 'approved', 'approved', 'rejected'];
    const status = statuses[i % statuses.length];
    const rm = rms[i % rms.length];
    const claim = await Reimbursement.create({
      user: emp._id,
      category: cat,
      amount: pick([250, 500, 800, 1200, 1500, 2500, 3500, 5000, 7500]),
      claimDate: ymd(addDays(today, -rand(1, 30))),
      description: pick(REIMB_DESCS[cat]),
      status,
      approver: status !== 'submitted' ? rm._id : null,
      approvedAt: status === 'approved' ? addDays(today, -rand(1, 5)) : null,
      rejectionReason: status === 'rejected' ? 'Receipt not clear, please resubmit' : '',
    });
    reimbCount++;
  }
  console.log(`✓ Reimbursements: ${reimbCount}`);

  // ── Payroll Runs + Payslips (last 3 months) ──
  await PayrollRun.deleteMany({});
  await Payslip.deleteMany({});
  let runCount = 0;
  let slipCount = 0;
  const salaryStructures = await SalaryStructure.find();
  const salaryByUser = new Map(salaryStructures.map(s => [String(s.user), s]));
  const statConfig = await StatutoryConfig.findOne().sort('-effectiveFrom');

  for (let mo = 0; mo < 3; mo++) {
    const d = new Date(today.getFullYear(), today.getMonth() - mo, 1);
    const month = d.getMonth() + 1;
    const year = d.getFullYear();
    const status = mo === 0 ? 'DRAFT' : 'PAID';

    const run = await PayrollRun.create({
      period: { month, year },
      payGroup: payGroup._id,
      status,
      runType: 'regular',
      lockedAt: status === 'PAID' ? addDays(d, 28) : null,
      lockedBy: status === 'PAID' ? userMap['arjun.sharma@test.com']._id : null,
    });
    runCount++;

    let runGross = 0, runDeductions = 0, runNet = 0;

    for (const u of allUsers) {
      const ss = salaryByUser.get(String(u._id));
      if (!ss) continue;

      const monthlyBasic = Math.round(ss.ctcAnnual * 0.4 / 12);
      const monthlyHra = Math.round(monthlyBasic * 0.5);
      const monthlySpecial = Math.round(ss.ctcAnnual / 12 - monthlyBasic - monthlyHra);

      const lopDays = Math.random() > 0.9 ? rand(1, 3) : 0;
      const payableDays = 30 - lopDays;
      const lopFactor = payableDays / 30;

      const basic = Math.round(monthlyBasic * lopFactor);
      const hra = Math.round(monthlyHra * lopFactor);
      const special = Math.round(monthlySpecial * lopFactor);
      const gross = basic + hra + special;

      const pfWage = Math.min(basic, statConfig?.pf?.wageCeiling || 15000);
      const pf = Math.round(pfWage * (statConfig?.pf?.employeePct || 12) / 100);
      const esic = gross <= (statConfig?.esic?.grossCeiling || 21000)
        ? Math.round(gross * (statConfig?.esic?.employeePct || 0.75) / 100)
        : 0;
      const pt = gross > 20000 ? 200 : gross > 15000 ? 150 : 0;
      const annualTaxable = ss.ctcAnnual - 75000;
      const tds = Math.round(Math.max(0, annualTaxable > 400000 ? (Math.min(annualTaxable, 800000) - 400000) * 0.05 + Math.max(0, annualTaxable - 800000) * 0.10 : 0) / 12);

      const totalDeductions = pf + esic + pt + tds;
      const netPay = gross - totalDeductions;

      runGross += gross;
      runDeductions += totalDeductions;
      runNet += netPay;

      await Payslip.create({
        payrollRun: run._id,
        user: u._id,
        period: { month, year },
        earnings: [
          { key: 'basic', label: 'Basic', amount: basic },
          { key: 'hra', label: 'HRA', amount: hra },
          { key: 'special', label: 'Special Allowance', amount: special },
        ],
        deductions: [
          { key: 'pf', label: 'Provident Fund', amount: pf },
          ...(esic > 0 ? [{ key: 'esic', label: 'ESIC', amount: esic }] : []),
          { key: 'pt', label: 'Professional Tax', amount: pt },
          { key: 'tds', label: 'TDS', amount: tds },
        ],
        reimbursements: [],
        statutory: { pf, esic, pt, tds },
        gross,
        totalDeductions,
        netPay,
        lopDays,
        paidDays: payableDays,
      });
      slipCount++;
    }

    run.totals = { gross: runGross, deductions: runDeductions, netPay: runNet, headcount: allUsers.length };
    await run.save();
  }
  console.log(`✓ Payroll runs: ${runCount}, Payslips: ${slipCount}`);

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
