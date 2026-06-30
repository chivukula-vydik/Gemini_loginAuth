import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCSV, autoMapColumns, dryRun, getTemplateCSV } from './rosterImport.js';

test('getTemplateCSV returns header row', () => {
  const csv = getTemplateCSV();
  assert.ok(csv.includes('email'));
  assert.ok(csv.includes('managerEmail'));
  assert.ok(csv.endsWith('\n'));
});

test('parseCSV handles basic rows', () => {
  const { headers, data } = parseCSV('email,displayName\nalice@co.com,Alice\nbob@co.com,Bob');
  assert.deepEqual(headers, ['email', 'displayname']);
  assert.equal(data.length, 2);
  assert.equal(data[0].email, 'alice@co.com');
  assert.equal(data[1].displayname, 'Bob');
});

test('parseCSV handles quoted fields with commas', () => {
  const { data } = parseCSV('email,displayName\nalice@co.com,"Smith, Alice"');
  assert.equal(data[0].displayname, 'Smith, Alice');
});

test('parseCSV handles escaped quotes', () => {
  const { data } = parseCSV('email,displayName\nalice@co.com,"She said ""hello"""');
  assert.equal(data[0].displayname, 'She said "hello"');
});

test('parseCSV skips empty lines', () => {
  const { data } = parseCSV('email,displayName\nalice@co.com,Alice\n\nbob@co.com,Bob\n');
  assert.equal(data.length, 2);
});

test('autoMapColumns maps aliases', () => {
  const mapping = autoMapColumns(['Email Address', 'Full Name', 'Emp ID', 'Reporting Manager Email']);
  assert.equal(mapping.email, 'Email Address');
  assert.equal(mapping.displayname, 'Full Name');
  assert.equal(mapping.employeecode, 'Emp ID');
  assert.equal(mapping.manageremail, 'Reporting Manager Email');
});

test('dryRun catches missing email', () => {
  const data = [{ email: '', displayname: 'Alice' }];
  const mapping = { email: 'email', displayname: 'displayname' };
  const result = dryRun(data, mapping);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('email')));
});

test('dryRun catches unknown role', () => {
  const data = [{ email: 'a@b.com', displayname: 'A', role: 'ceo' }];
  const mapping = { email: 'email', displayname: 'displayname', role: 'role' };
  const result = dryRun(data, mapping);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('unknown role')));
});

test('dryRun catches duplicate emails', () => {
  const data = [
    { email: 'a@b.com', displayname: 'A' },
    { email: 'a@b.com', displayname: 'A2' },
  ];
  const mapping = { email: 'email', displayname: 'displayname' };
  const result = dryRun(data, mapping);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('duplicate')));
});

test('dryRun detects manager cycle', () => {
  const data = [
    { email: 'a@b.com', displayname: 'A', manageremail: 'b@b.com' },
    { email: 'b@b.com', displayname: 'B', manageremail: 'a@b.com' },
  ];
  const mapping = { email: 'email', displayname: 'displayname', manageremail: 'manageremail' };
  const result = dryRun(data, mapping);
  assert.ok(result.errors.some(e => e.includes('cycle')));
});

test('dryRun passes valid data', () => {
  const data = [
    { email: 'alice@co.com', displayname: 'Alice', role: 'admin', manageremail: '' },
    { email: 'bob@co.com', displayname: 'Bob', role: 'employee', manageremail: 'alice@co.com' },
  ];
  const mapping = { email: 'email', displayname: 'displayname', role: 'role', manageremail: 'manageremail' };
  const result = dryRun(data, mapping);
  assert.equal(result.valid, true);
  assert.equal(result.totalRows, 2);
});

test('dryRun warns on bad PAN format', () => {
  const data = [{ email: 'a@b.com', displayname: 'A', pan: 'BADPAN' }];
  const mapping = { email: 'email', displayname: 'displayname', pan: 'pan' };
  const result = dryRun(data, mapping);
  assert.equal(result.valid, true); // warning, not error
  assert.ok(result.warnings.some(w => w.includes('PAN')));
});
