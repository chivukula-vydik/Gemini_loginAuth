import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { TaskDetail } from './pmApi';
import { filterTasks, paginate } from './taskFilter.ts';

const TODAY = '2026-06-17';

function task(partial: Partial<TaskDetail> & Pick<TaskDetail, '_id' | 'title' | 'status'>): TaskDetail {
  return {
    _id: partial._id,
    title: partial.title,
    description: '',
    estimatedHours: partial.estimatedHours ?? 8,
    assignees: partial.assignees ?? [],
    status: partial.status,
    percentComplete: partial.percentComplete ?? 0,
    actualMinutes: partial.actualMinutes ?? 0,
    dueDate: partial.dueDate ?? null,
    effectiveDueDate: partial.effectiveDueDate ?? null,
  };
}

const tasks: TaskDetail[] = [
  task({
    _id: '1',
    title: 'Build login page',
    status: 'todo',
    dueDate: '2026-06-16',
    assignees: [{ user: { _id: 'u1', displayName: 'Alice Doe', email: 'alice@x.com' }, sharePct: 100 }],
  }),
  task({
    _id: '2',
    title: 'Refactor API layer',
    status: 'in_progress',
    dueDate: '2026-06-19',
    assignees: [{ user: { _id: 'u2', displayName: 'Bob Ray', email: 'bob@x.com' }, sharePct: 100 }],
  }),
  task({
    _id: '3',
    title: 'Deploy release',
    status: 'done',
    dueDate: '2026-06-25',
    assignees: [{ user: { _id: 'u1', displayName: 'Alice Doe', email: 'alice@x.com' }, sharePct: 50 }],
  }),
  task({
    _id: '4',
    title: 'Document process',
    status: 'blocked',
    effectiveDueDate: '2026-06-18',
    assignees: [],
  }),
];

test('filterTasks: query matches title and assignee name/email', () => {
  assert.deepEqual(filterTasks(tasks, { query: 'login' }, TODAY).map((t) => t._id), ['1']);
  assert.deepEqual(filterTasks(tasks, { query: 'alice' }, TODAY).map((t) => t._id), ['1', '3']);
  assert.deepEqual(filterTasks(tasks, { query: 'bob@x.com' }, TODAY).map((t) => t._id), ['2']);
});

test('filterTasks: OR within field, AND across fields', () => {
  const result = filterTasks(tasks, {
    statuses: ['todo', 'in_progress'],
    assignees: ['u2'],
  }, TODAY);
  assert.deepEqual(result.map((t) => t._id), ['2']);
});

test('filterTasks: urgency uses due helper behavior', () => {
  assert.deepEqual(filterTasks(tasks, { urgencies: ['overdue'] }, TODAY).map((t) => t._id), ['1']);
  assert.deepEqual(filterTasks(tasks, { urgencies: ['soon'] }, TODAY).map((t) => t._id), ['2', '4']);
  assert.deepEqual(filterTasks(tasks, { urgencies: ['ok'] }, TODAY).map((t) => t._id), ['3']);
});

test('paginate: returns clamped page and total pages', () => {
  const items = ['a', 'b', 'c', 'd', 'e'];
  const p1 = paginate(items, 1, 2);
  assert.deepEqual(p1, { items: ['a', 'b'], page: 1, totalPages: 3 });
  const p99 = paginate(items, 99, 2);
  assert.deepEqual(p99, { items: ['e'], page: 3, totalPages: 3 });
});
