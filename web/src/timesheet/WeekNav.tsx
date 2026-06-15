import { formatMinutes, weekRangeLabel } from './time';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

type Props = {
  weekStart: string;
  grandTotal: number;       // minutes
  status: SaveStatus;
  onPrev: () => void;
  onNext: () => void;
  onCopyLastWeek: () => void;
};

const STATUS_TEXT: Record<SaveStatus, string> = {
  idle: '', saving: 'Saving…', saved: 'Saved', error: 'Save failed — retry',
};

export function WeekNav({ weekStart, grandTotal, status, onPrev, onNext, onCopyLastWeek }: Props) {
  return (
    <div className="ts-nav">
      <div className="ts-nav-left">
        <button className="ts-arrow" type="button" aria-label="Previous week" onClick={onPrev}>‹</button>
        <span className="ts-week-label">{weekRangeLabel(weekStart)}</span>
        <button className="ts-arrow" type="button" aria-label="Next week" onClick={onNext}>›</button>
        <button className="ts-copy" type="button" onClick={onCopyLastWeek}>Copy last week</button>
      </div>
      <div className="ts-nav-right">
        <span className={`ts-status ts-status-${status}`}>{STATUS_TEXT[status]}</span>
        <span className="ts-grand">This Week · {formatMinutes(grandTotal)}</span>
      </div>
    </div>
  );
}
