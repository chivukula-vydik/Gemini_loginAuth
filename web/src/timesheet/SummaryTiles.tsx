import { formatMinutes } from './time';

type Props = {
  weekTotal: number;
  busiestLabel: string;
  busiestMinutes: number;
  activeTasks: number;
};

export function SummaryTiles({ weekTotal, busiestLabel, busiestMinutes, activeTasks }: Props) {
  const dailyAverage = Math.round(weekTotal / 5);
  return (
    <div className="ts-tiles">
      <div className="ts-tile ts-tile-accent">
        <span className="ts-tile-label">This week</span>
        <span className="ts-tile-value">{formatMinutes(weekTotal)}</span>
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
