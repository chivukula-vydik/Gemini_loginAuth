import { test } from 'node:test';
import assert from 'node:assert/strict';
import { etaIsoAt, presetDates, WORKDAY_END_HOUR } from './etaPresets.ts';

test('etaIsoAt: local date at 6 PM round-trips back to the same local date and hour', () => {
  const iso = etaIsoAt('2026-06-25');
  const d = new Date(iso);
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 5); // June
  assert.equal(d.getDate(), 25);
  assert.equal(d.getHours(), WORKDAY_END_HOUR);
  assert.equal(d.getMinutes(), 0);
});

test('etaIsoAt: honours a custom hour', () => {
  const d = new Date(etaIsoAt('2026-06-25', 9));
  assert.equal(d.getDate(), 25);
  assert.equal(d.getHours(), 9);
});

test('presetDates: today / tomorrow / in 2 days offsets', () => {
  const p = presetDates('2026-06-24', null); // Wed
  const by = Object.fromEntries(p.map((o) => [o.key, o.dateISO]));
  assert.equal(by.today, '2026-06-24');
  assert.equal(by.tomorrow, '2026-06-25');
  assert.equal(by.in2, '2026-06-26');
});

test('presetDates: this Friday is the Friday of the current Mon-Fri week', () => {
  // Wed 2026-06-24 -> Friday 2026-06-26
  const wed = presetDates('2026-06-24', null).find((o) => o.key === 'friday');
  assert.equal(wed?.dateISO, '2026-06-26');
  // Mon 2026-06-22 -> Friday 2026-06-26
  const mon = presetDates('2026-06-22', null).find((o) => o.key === 'friday');
  assert.equal(mon?.dateISO, '2026-06-26');
});

test('presetDates: deadline preset is included only when a deadline exists', () => {
  const withDeadline = presetDates('2026-06-24', '2026-06-30');
  const dl = withDeadline.find((o) => o.key === 'deadline');
  assert.equal(dl?.dateISO, '2026-06-30');

  const without = presetDates('2026-06-24', null);
  assert.equal(without.find((o) => o.key === 'deadline'), undefined);
});

test('presetDates: every preset carries a human label', () => {
  for (const o of presetDates('2026-06-24', '2026-06-30')) {
    assert.equal(typeof o.label, 'string');
    assert.ok(o.label.length > 0);
  }
});
