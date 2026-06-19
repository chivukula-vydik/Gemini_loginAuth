import { test } from 'node:test';
import assert from 'node:assert/strict';
import { popoverPosition } from './popoverPosition.ts';

const viewport = { width: 1000, height: 800 };

test('popoverPosition: opens below the trigger when there is room', () => {
  const p = popoverPosition({ left: 100, top: 200, bottom: 220, width: 120 }, viewport, 260, 200);
  assert.equal(p.placement, 'below');
  assert.equal(p.top, 224); // bottom + gap(4)
  assert.equal(p.bottom, null);
  assert.equal(p.left, 100);
});

test('popoverPosition: flips above when there is not enough room below', () => {
  const tight = { width: 1000, height: 600 };
  const p = popoverPosition({ left: 100, top: 560, bottom: 580, width: 120 }, tight, 260, 200);
  assert.equal(p.placement, 'above');
  assert.equal(p.bottom, 44); // viewport.height - trigger.top + gap = 600-560+4
  assert.equal(p.top, null);
});

test('popoverPosition: clamps left so the popover stays inside the right edge', () => {
  const p = popoverPosition({ left: 950, top: 200, bottom: 220, width: 120 }, viewport, 260, 200);
  assert.equal(p.left, 1000 - 200 - 8); // 792
});

test('popoverPosition: clamps left so the popover never goes off the left edge', () => {
  const p = popoverPosition({ left: 2, top: 200, bottom: 220, width: 120 }, viewport, 260, 200);
  assert.equal(p.left, 8);
});
