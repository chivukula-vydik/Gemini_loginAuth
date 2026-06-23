import { formatMinutes } from './time';

type Props = {
  weekTotal: number;
  targetMinutes: number;
  busiestLabel: string;
  busiestMinutes: number;
  activeTasks: number;
};

export function SummaryTiles({ weekTotal, targetMinutes, busiestLabel, busiestMinutes, activeTasks }: Props) {
  const dailyAverage = Math.round(weekTotal / 5);
  const pct = targetMinutes > 0 ? Math.min(Math.round((weekTotal / targetMinutes) * 100), 100) : 0;
  const barColor = pct >= 100 ? 'var(--danger, #ef4444)' : pct >= 90 ? 'var(--warning, #f59e0b)' : 'var(--success, #22c55e)';
  return (
    <div className="ts-tiles">
      <div className="ts-tile ts-tile-accent">
        <span className="ts-tile-label">This week</span>
        <span className="ts-tile-value">
          {formatMinutes(weekTotal)}{targetMinutes > 0 ? ` / ${formatMinutes(targetMinutes)}` : ''}
        </span>
        {targetMinutes > 0 && (
          <div className="ts-progress-bar">
            <div className="ts-progress-fill" style={{ width: `${pct}%`, background: barColor }} />
          </div>
        )}
        <span className="ts-tile-foot">across {activeTasks} {activeTasks === 1 ? 'task' : 'tasks'}</span>
      </div>
      <div className="ts-tile">
        <span className="ts-tile-label">Daily average</span>
        <span className="ts-tile-value">{formatMinutes(dailyAverage)}</span>
        <span className="ts-tile-foot">over 5 weekdays</span>
      </div>
      <div className="ts-tile">
        <span className="ts-tile-label">Busiest day</span>
        <span className="ts-tile-value">{busiestMinutes > 0 ? busiestLabel : '—'}</span>
        <span className="ts-tile-foot">{busiestMinutes > 0 ? formatMinutes(busiestMinutes) : 'No hours yet'}</span>
      </div>
      <div className="ts-tile">
        <span className="ts-tile-label">Active tasks</span>
        <span className="ts-tile-value">{activeTasks}</span>
        <span className="ts-tile-foot">this week</span>
      </div>
    </div>
  );
}
