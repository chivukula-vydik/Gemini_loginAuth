import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { TaskDetail } from './pmApi';
import { toExportRows, toCSV } from './taskExport.ts';

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

test('toExportRows maps tasks into flat export rows', () => {
  const rows = toExportRows([
    task({
      _id: 't1',
      title: 'Plan roadmap',
      status: 'in_progress',
      dueDate: '2026-06-20',
      estimatedHours: 16,
      actualMinutes: 180,
      percentComplete: 40,
      assignees: [{ user: { _id: 'u1', displayName: 'Alice', email: 'alice@x.com' }, sharePct: 100 }],
    }),
  ]);
  assert.deepEqual(rows, [{
    taskId: 't1',
    title: 'Plan roadmap',
    status: 'in_progress',
    assignees: 'Alice',
    dueDate: '2026-06-20',
    estimatedHours: 16,
    actualHours: 3,
    progressPct: 40,
  }]);
});

test('toCSV escapes commas/quotes and emits header', () => {
  const csv = toCSV([
    {
      taskId: 't1',
      title: 'Build, test "deploy"',
      status: 'todo',
      assignees: 'Alice, Bob',
      dueDate: '2026-06-20',
      estimatedHours: 8,
      actualHours: 0,
      progressPct: 0,
    },
  ]);
  const lines = csv.trimEnd().split('\n');
  assert.equal(lines[0], 'taskId,title,status,assignees,dueDate,estimatedHours,actualHours,progressPct');
  assert.equal(lines[1], 't1,"Build, test ""deploy""",todo,"Alice, Bob",2026-06-20,8,0,0');
});
