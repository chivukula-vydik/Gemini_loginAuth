import { randomUUID } from 'crypto';
import * as XLSX from 'xlsx';
import { User } from '../models/User.js';
import { LegalEntity } from '../models/LegalEntity.js';

const VALID_ROLES = ['admin', 'pm', 'employee', 'reporting_manager', 'hr', 'finance', 'team_lead', 'director', 'vp'];

const TEMPLATE_COLUMNS = [
  'email', 'displayName', 'employeeCode', 'role', 'phone',
  'dateOfJoining', 'employmentType', 'managerEmail', 'legalEntity',
  'designation', 'department', 'location',
  'dateOfBirth', 'gender', 'pan', 'bankName', 'bankAccount', 'ifsc',
];

const REQUIRED_COLUMNS = ['email', 'displayName'];

export function getTemplateCSV() {
  return TEMPLATE_COLUMNS.join(',') + '\n';
}

// ── CSV parser (~30 lines, handles quoted fields) ──────────────────────
export function parseCSV(text) {
  const rows = [];
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    const fields = [];
    let i = 0;
    while (i < line.length) {
      if (line[i] === '"') {
        let val = '';
        i++; // skip opening quote
        while (i < line.length) {
          if (line[i] === '"' && line[i + 1] === '"') { val += '"'; i += 2; }
          else if (line[i] === '"') { i++; break; }
          else { val += line[i]; i++; }
        }
        if (line[i] === ',') i++;
        fields.push(val);
      } else {
        const next = line.indexOf(',', i);
        if (next === -1) { fields.push(line.slice(i)); i = line.length; }
        else { fields.push(line.slice(i, next)); i = next + 1; }
      }
    }
    rows.push(fields);
  }
  if (rows.length < 2) return { headers: [], data: [] };
  const headers = rows[0].map(h => h.trim().toLowerCase());
  const data = rows.slice(1).map(fields => {
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = (fields[idx] || '').trim(); });
    return obj;
  });
  return { headers, data };
}

// ── XLSX parser ─────────────────────────────────────────────────────────
export function parseXLSX(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (raw.length < 2) return { headers: [], data: [] };
  const headers = raw[0].map(h => String(h).trim().toLowerCase());
  const data = raw.slice(1)
    .filter(row => row.some(cell => String(cell).trim()))
    .map(fields => {
      const obj = {};
      headers.forEach((h, idx) => { obj[h] = String(fields[idx] ?? '').trim(); });
      return obj;
    });
  return { headers, data };
}

// ── Column mapping ──────────────────────────────────────────────────────
const COLUMN_ALIASES = {
  email: ['email', 'email address', 'emailaddress', 'e-mail'],
  displayname: ['displayname', 'display name', 'name', 'full name', 'fullname', 'employee name'],
  employeecode: ['employeecode', 'employee code', 'employee id', 'employeeid', 'emp id', 'empid', 'emp code'],
  role: ['role', 'roles', 'user role'],
  phone: ['phone', 'mobile', 'phone number', 'contact'],
  dateofjoining: ['dateofjoining', 'date of joining', 'doj', 'joining date', 'start date'],
  employmenttype: ['employmenttype', 'employment type', 'type'],
  manageremail: ['manageremail', 'manager email', 'manager', 'reporting manager', 'reporting manager email'],
  legalentity: ['legalentity', 'legal entity', 'company', 'entity'],
  designation: ['designation', 'title', 'job title'],
  department: ['department', 'dept'],
  location: ['location', 'office', 'office location'],
  dateofbirth: ['dateofbirth', 'date of birth', 'dob', 'birth date'],
  gender: ['gender', 'sex'],
  pan: ['pan', 'pan number', 'pan no'],
  bankname: ['bankname', 'bank name', 'bank'],
  bankaccount: ['bankaccount', 'bank account', 'account number', 'account no'],
  ifsc: ['ifsc', 'ifsc code'],
};

export function autoMapColumns(headers) {
  const mapping = {};
  const normalHeaders = headers.map(h => h.toLowerCase().trim());
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    const idx = normalHeaders.findIndex(h => aliases.includes(h));
    if (idx !== -1) mapping[field] = headers[idx];
  }
  return mapping;
}

function applyMapping(row, mapping) {
  const out = {};
  for (const [field, header] of Object.entries(mapping)) {
    out[field] = row[header.toLowerCase()] || '';
  }
  return out;
}

// ── Validation ──────────────────────────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PAN_RE = /^[A-Z]{5}\d{4}[A-Z]$/;

function validateRow(mapped, rowNum) {
  const errors = [];
  const warnings = [];

  if (!mapped.email || !EMAIL_RE.test(mapped.email)) {
    errors.push(`row ${rowNum}: invalid or missing email`);
  }
  if (!mapped.displayname) {
    errors.push(`row ${rowNum}: displayName is required`);
  }
  if (mapped.role && !VALID_ROLES.includes(mapped.role.toLowerCase())) {
    errors.push(`row ${rowNum}: unknown role "${mapped.role}" — valid: ${VALID_ROLES.join(', ')}`);
  }
  if (mapped.manageremail && !EMAIL_RE.test(mapped.manageremail)) {
    warnings.push(`row ${rowNum}: invalid manager email "${mapped.manageremail}"`);
  }
  if (mapped.pan && !PAN_RE.test(mapped.pan.toUpperCase())) {
    warnings.push(`row ${rowNum}: PAN "${mapped.pan}" doesn't match format AAAAA0000A`);
  }
  if (mapped.employmenttype && !['full-time', 'part-time', 'contract', 'intern', 'freelance'].includes(mapped.employmenttype.toLowerCase())) {
    warnings.push(`row ${rowNum}: unknown employment type "${mapped.employmenttype}"`);
  }

  return { errors, warnings };
}

// ── Dry-run (validate all, no writes) ───────────────────────────────────
export function dryRun(data, mapping) {
  const allErrors = [];
  const allWarnings = [];
  const emails = new Set();
  const managerEmails = new Set();

  for (let i = 0; i < data.length; i++) {
    const mapped = applyMapping(data[i], mapping);
    const { errors, warnings } = validateRow(mapped, i + 2); // +2 for header row + 1-indexed
    allErrors.push(...errors);
    allWarnings.push(...warnings);

    if (mapped.email) {
      if (emails.has(mapped.email.toLowerCase())) {
        allErrors.push(`row ${i + 2}: duplicate email "${mapped.email}"`);
      }
      emails.add(mapped.email.toLowerCase());
    }
    if (mapped.manageremail) {
      managerEmails.add(mapped.manageremail.toLowerCase());
    }
  }

  // Check for cycles: A→B→A
  const managerMap = {};
  for (let i = 0; i < data.length; i++) {
    const mapped = applyMapping(data[i], mapping);
    if (mapped.email && mapped.manageremail) {
      managerMap[mapped.email.toLowerCase()] = mapped.manageremail.toLowerCase();
    }
  }
  for (const email of Object.keys(managerMap)) {
    const visited = new Set();
    let current = email;
    while (current && managerMap[current]) {
      if (visited.has(current)) {
        allErrors.push(`cycle detected: ${[...visited, current].join(' → ')}`);
        break;
      }
      visited.add(current);
      current = managerMap[current];
    }
  }

  // Unresolvable manager warnings
  for (const mgr of managerEmails) {
    if (!emails.has(mgr)) {
      // might already exist in DB — warning, not error
      allWarnings.push(`manager email "${mgr}" not found in the import file — will attempt DB lookup`);
    }
  }

  return {
    totalRows: data.length,
    errors: allErrors,
    warnings: allWarnings,
    valid: allErrors.length === 0,
  };
}

// ── Commit (two-pass) ───────────────────────────────────────────────────
export async function commitImport(data, mapping) {
  const batchId = randomUUID();
  const results = [];
  const emailToId = {};

  // Collect existing users by email for dedup
  const existingEmails = await User.find({
    email: { $in: data.map(r => (applyMapping(r, mapping).email || '').toLowerCase()) },
  }).select('_id email').lean();
  const existingMap = {};
  for (const u of existingEmails) existingMap[u.email] = u._id;

  // Resolve/create legal entities inline
  const legalEntityCache = {};
  const existingEntities = await LegalEntity.find().lean();
  for (const le of existingEntities) legalEntityCache[le.name.toLowerCase()] = le._id;

  // Pass 1: create/update users (no manager link)
  for (let i = 0; i < data.length; i++) {
    const mapped = applyMapping(data[i], mapping);
    const { errors } = validateRow(mapped, i + 2);
    if (errors.length > 0) {
      results.push({ row: i + 2, email: mapped.email, status: 'error', errors });
      continue;
    }

    const email = mapped.email.toLowerCase();

    // Resolve legal entity
    let legalEntityId = null;
    if (mapped.legalentity) {
      const key = mapped.legalentity.toLowerCase();
      if (legalEntityCache[key]) {
        legalEntityId = legalEntityCache[key];
      } else {
        const le = await LegalEntity.create({ name: mapped.legalentity, legalName: mapped.legalentity });
        legalEntityCache[key] = le._id;
        legalEntityId = le._id;
      }
    }

    const userData = {
      email,
      displayName: mapped.displayname,
      roles: mapped.role ? [mapped.role.toLowerCase()] : ['employee'],
      employeeCode: mapped.employeecode || '',
      phone: mapped.phone || '',
      dateOfJoining: mapped.dateofjoining ? new Date(mapped.dateofjoining) : null,
      employmentType: mapped.employmenttype?.toLowerCase() || 'full-time',
      dateOfBirth: mapped.dateofbirth ? new Date(mapped.dateofbirth) : null,
      gender: mapped.gender?.toLowerCase() || '',
      pan: mapped.pan?.toUpperCase() || '',
      bankName: mapped.bankname || '',
      bankAccount: mapped.bankaccount || '',
      ifsc: mapped.ifsc?.toUpperCase() || '',
      legalEntityId,
      importBatchId: batchId,
      active: false, // imported users start inactive — invite/reset flow activates
    };

    try {
      if (existingMap[email]) {
        // Dedup: update existing
        await User.updateOne({ _id: existingMap[email] }, { $set: { ...userData, importBatchId: batchId } });
        emailToId[email] = existingMap[email];
        results.push({ row: i + 2, email, status: 'updated' });
      } else {
        const user = await User.create(userData);
        emailToId[email] = user._id;
        results.push({ row: i + 2, email, status: 'created' });
      }
    } catch (e) {
      results.push({ row: i + 2, email, status: 'error', errors: [e.message] });
    }
  }

  // Also load existing users for manager resolution (in case manager is already in DB)
  const allUsers = await User.find().select('_id email').lean();
  for (const u of allUsers) {
    if (!emailToId[u.email]) emailToId[u.email] = u._id;
  }

  // Pass 2: resolve manager links
  const managerWarnings = [];
  for (let i = 0; i < data.length; i++) {
    const mapped = applyMapping(data[i], mapping);
    const email = (mapped.email || '').toLowerCase();
    const managerEmail = (mapped.manageremail || '').toLowerCase();
    if (!managerEmail || !emailToId[email]) continue;

    const managerId = emailToId[managerEmail];
    if (managerId) {
      await User.updateOne({ _id: emailToId[email] }, { $set: { reportingManagerId: managerId } });
    } else {
      managerWarnings.push(`row ${i + 2}: manager "${managerEmail}" not found — user imported without manager`);
    }
  }

  const created = results.filter(r => r.status === 'created').length;
  const updated = results.filter(r => r.status === 'updated').length;
  const errored = results.filter(r => r.status === 'error').length;

  return {
    batchId,
    totalRows: data.length,
    created,
    updated,
    errored,
    managerWarnings,
    results,
  };
}

// ── Rollback ────────────────────────────────────────────────────────────
export async function rollbackBatch(batchId) {
  const result = await User.deleteMany({ importBatchId: batchId });
  return { deleted: result.deletedCount };
}
