import type { TaskDetail } from './pmApi';
import { personName } from './personName.ts';

export type ExportRow = {
  taskId: string;
  title: string;
  status: string;
  assignees: string;
  dueDate: string;
  estimatedHours: number;
  actualHours: number;
  progressPct: number;
};

function safeCsv(v: unknown): string {
  const s = String(v ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toExportRows(tasks: TaskDetail[]): ExportRow[] {
  return tasks.map((t) => ({
    taskId: t._id,
    title: t.title,
    status: t.status,
    assignees: t.assignees.map((a) => personName(a.user)).join(', '),
    dueDate: (t.dueDate ?? t.effectiveDueDate ?? '').slice(0, 10),
    estimatedHours: t.estimatedHours ?? 0,
    actualHours: Number((((t.actualMinutes ?? 0) / 60).toFixed(1))),
    progressPct: t.percentComplete ?? 0,
  }));
}

export function toCSV(rows: ExportRow[]): string {
  const headers: Array<keyof ExportRow> = [
    'taskId', 'title', 'status', 'assignees', 'dueDate', 'estimatedHours', 'actualHours', 'progressPct',
  ];
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => safeCsv(row[h])).join(','));
  }
  return `${lines.join('\n')}\n`;
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadCSV(rows: ExportRow[], fileName = 'tasks.csv') {
  const csv = toCSV(rows);
  triggerDownload(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), fileName);
}
