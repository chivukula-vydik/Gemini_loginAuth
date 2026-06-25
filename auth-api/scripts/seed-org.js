import '../src/env.js';
import mongoose from 'mongoose';
import { connectDb } from '../src/db/connect.js';
import { LegalEntity } from '../src/models/LegalEntity.js';
import { BusinessUnit } from '../src/models/BusinessUnit.js';
import { Department } from '../src/models/Department.js';
import { Location } from '../src/models/Location.js';
import { Designation } from '../src/models/Designation.js';
import { Shift } from '../src/models/Shift.js';

// Dev helper: seeds departments, shifts, legal entities, business units,
// locations, and designations so all dropdowns have data.
//
// Usage:  node scripts/seed-org.js

async function main() {
  await connectDb(process.env.MONGO_URL);

  // ── Legal Entities ──
  const entities = [
    { name: 'Acme Corp', legalName: 'Acme Corporation Pvt Ltd', registrationNo: 'U72200KA2020PTC123456', gstNumber: '29AABCA1234F1Z5', panNumber: 'AABCA1234F', country: 'India', currency: 'INR', address: '100 MG Road, Bengaluru 560001' },
    { name: 'Acme US LLC', legalName: 'Acme US LLC', country: 'United States', currency: 'USD', address: '350 Fifth Ave, New York, NY 10118' },
  ];
  for (const e of entities) {
    const exists = await LegalEntity.findOne({ name: e.name });
    if (!exists) await LegalEntity.create(e);
  }
  const leIndia = await LegalEntity.findOne({ name: 'Acme Corp' });
  const leUS = await LegalEntity.findOne({ name: 'Acme US LLC' });
  console.log(`✓ Legal entities: ${await LegalEntity.countDocuments()}`);

  // ── Business Units ──
  const bus = [
    { name: 'Engineering', code: 'ENG', description: 'Product & Platform Engineering', legalEntityId: leIndia._id },
    { name: 'Operations', code: 'OPS', description: 'Business Operations & Support', legalEntityId: leIndia._id },
    { name: 'Sales & Marketing', code: 'S&M', description: 'Revenue & Growth', legalEntityId: leIndia._id },
    { name: 'US Operations', code: 'US-OPS', description: 'North America operations', legalEntityId: leUS._id },
  ];
  for (const b of bus) {
    const exists = await BusinessUnit.findOne({ name: b.name });
    if (!exists) await BusinessUnit.create(b);
  }
  const buEng = await BusinessUnit.findOne({ name: 'Engineering' });
  const buOps = await BusinessUnit.findOne({ name: 'Operations' });
  const buSales = await BusinessUnit.findOne({ name: 'Sales & Marketing' });
  console.log(`✓ Business units: ${await BusinessUnit.countDocuments()}`);

  // ── Departments ──
  const depts = [
    { name: 'Frontend', description: 'Web & mobile UI', businessUnitId: buEng._id },
    { name: 'Backend', description: 'APIs & services', businessUnitId: buEng._id },
    { name: 'DevOps', description: 'Infrastructure & CI/CD', businessUnitId: buEng._id },
    { name: 'QA', description: 'Quality assurance & testing', businessUnitId: buEng._id },
    { name: 'Design', description: 'UI/UX design', businessUnitId: buEng._id },
    { name: 'Data Science', description: 'ML & analytics', businessUnitId: buEng._id },
    { name: 'Human Resources', description: 'People & culture', businessUnitId: buOps._id },
    { name: 'Finance', description: 'Accounting & payroll', businessUnitId: buOps._id },
    { name: 'Admin & Facilities', description: 'Office management', businessUnitId: buOps._id },
    { name: 'Marketing', description: 'Brand & demand gen', businessUnitId: buSales._id },
    { name: 'Sales', description: 'Direct sales & partnerships', businessUnitId: buSales._id },
    { name: 'Customer Success', description: 'Account management & support', businessUnitId: buSales._id },
  ];
  for (const d of depts) {
    const exists = await Department.findOne({ name: d.name });
    if (!exists) await Department.create(d);
  }
  // Sub-departments
  const feParent = await Department.findOne({ name: 'Frontend' });
  const beParent = await Department.findOne({ name: 'Backend' });
  const subDepts = [
    { name: 'React Team', description: 'React web apps', businessUnitId: buEng._id, parentDepartmentId: feParent._id },
    { name: 'Mobile Team', description: 'React Native / Flutter', businessUnitId: buEng._id, parentDepartmentId: feParent._id },
    { name: 'API Team', description: 'REST & GraphQL APIs', businessUnitId: buEng._id, parentDepartmentId: beParent._id },
    { name: 'Platform Team', description: 'Core platform services', businessUnitId: buEng._id, parentDepartmentId: beParent._id },
  ];
  for (const d of subDepts) {
    const exists = await Department.findOne({ name: d.name });
    if (!exists) await Department.create(d);
  }
  console.log(`✓ Departments: ${await Department.countDocuments()}`);

  // ── Locations ──
  const locs = [
    { name: 'Bengaluru HQ', code: 'BLR', country: 'India', state: 'Karnataka', city: 'Bengaluru', address: '100 MG Road, Bengaluru 560001', timezone: 'Asia/Kolkata' },
    { name: 'Hyderabad Office', code: 'HYD', country: 'India', state: 'Telangana', city: 'Hyderabad', address: 'HITEC City, Hyderabad 500081', timezone: 'Asia/Kolkata' },
    { name: 'Mumbai Office', code: 'BOM', country: 'India', state: 'Maharashtra', city: 'Mumbai', address: 'BKC, Mumbai 400051', timezone: 'Asia/Kolkata' },
    { name: 'New York Office', code: 'NYC', country: 'United States', state: 'New York', city: 'New York', address: '350 Fifth Ave, NY 10118', timezone: 'America/New_York' },
    { name: 'Remote - India', code: 'REM-IN', country: 'India', city: 'Remote', timezone: 'Asia/Kolkata' },
  ];
  for (const l of locs) {
    const exists = await Location.findOne({ name: l.name });
    if (!exists) await Location.create(l);
  }
  console.log(`✓ Locations: ${await Location.countDocuments()}`);

  // ── Designations ──
  const desigs = [
    { title: 'Software Engineer', grade: 'L1', level: 1 },
    { title: 'Senior Software Engineer', grade: 'L2', level: 2 },
    { title: 'Lead Engineer', grade: 'L3', level: 3 },
    { title: 'Staff Engineer', grade: 'L4', level: 4 },
    { title: 'Principal Engineer', grade: 'L5', level: 5 },
    { title: 'Engineering Manager', grade: 'M1', level: 3 },
    { title: 'Senior Engineering Manager', grade: 'M2', level: 4 },
    { title: 'Director of Engineering', grade: 'M3', level: 5 },
    { title: 'VP Engineering', grade: 'M4', level: 6 },
    { title: 'Product Manager', grade: 'P1', level: 3 },
    { title: 'Senior Product Manager', grade: 'P2', level: 4 },
    { title: 'Designer', grade: 'D1', level: 1 },
    { title: 'Senior Designer', grade: 'D2', level: 2 },
    { title: 'QA Engineer', grade: 'Q1', level: 1 },
    { title: 'Senior QA Engineer', grade: 'Q2', level: 2 },
    { title: 'DevOps Engineer', grade: 'O1', level: 2 },
    { title: 'Data Scientist', grade: 'DS1', level: 2 },
    { title: 'HR Executive', grade: 'H1', level: 1 },
    { title: 'HR Manager', grade: 'H2', level: 3 },
    { title: 'Finance Executive', grade: 'F1', level: 1 },
    { title: 'Sales Executive', grade: 'S1', level: 1 },
    { title: 'Account Manager', grade: 'S2', level: 2 },
    { title: 'Intern', grade: 'I0', level: 0 },
  ];
  for (const d of desigs) {
    const exists = await Designation.findOne({ title: d.title });
    if (!exists) await Designation.create(d);
  }
  console.log(`✓ Designations: ${await Designation.countDocuments()}`);

  // ── Shifts ──
  const shifts = [
    { name: 'General Shift', startHour: 9, startMinute: 30, endHour: 18, endMinute: 30, isDefault: true },
    { name: 'Morning Shift', startHour: 6, startMinute: 0, endHour: 14, endMinute: 0 },
    { name: 'Afternoon Shift', startHour: 14, startMinute: 0, endHour: 22, endMinute: 0 },
    { name: 'Night Shift', startHour: 22, startMinute: 0, endHour: 6, endMinute: 0 },
    { name: 'Flexible Shift', startHour: 10, startMinute: 0, endHour: 19, endMinute: 0 },
    { name: 'US Hours', startHour: 18, startMinute: 0, endHour: 3, endMinute: 0 },
  ];
  for (const s of shifts) {
    const exists = await Shift.findOne({ name: s.name });
    if (!exists) await Shift.create(s);
  }
  console.log(`✓ Shifts: ${await Shift.countDocuments()}`);

  console.log('\n✅ Org seed complete!');
  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
