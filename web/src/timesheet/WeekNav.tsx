import { weekRangeLabel } from './time';
import type { SubmitStatus } from './submit';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

type Props = {
  weekStart: string;
  status: SaveStatus;
  readOnly?: boolean;
  submitStatus?: SubmitStatus;
  submittedAt?: string | null;
  submittable?: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onCopyLastWeek: () => void;
  onSubmit?: () => void;
};

const STATUS_TEXT: Record<SaveStatus, string> = {
  idle: '', saving: 'Saving…', saved: 'Saved', error: 'Save failed — retry',
};

const SUBMIT_LABEL: Record<SubmitStatus, string> = {
  draft: 'Draft', submitted: 'Submitted', approved: 'Approved', returned: 'Returned',
};

export function WeekNav({
  weekStart, status, readOnly = false, submitStatus, submittedAt, submittable = false,
  onPrev, onNext, onToday, onCopyLastWeek, onSubmit,
}: Props) {
  return (
    <div className="ts-nav">
      <div className="ts-nav-left">
        <button className="ts-arrow" type="button" aria-label="Previous week" onClick={onPrev}>‹</button>
        <span className="ts-week-label">{weekRangeLabel(weekStart)}</span>
        <button className="ts-arrow" type="button" aria-label="Next week" onClick={onNext}>›</button>
        <button className="ts-today" type="button" onClick={onToday}>Today</button>
        {readOnly ? (
          <span className="ts-badge">Read only</span>
        ) : (
          <button className="ts-copy" type="button" onClick={onCopyLastWeek}>Copy last week</button>
        )}
      </div>
      <div className="ts-nav-right">
        <span className={`ts-status ts-status-${status}`}>{STATUS_TEXT[status]}</span>
        {submitStatus && (
          <span className={`ts-submit-badge ts-submit-${submitStatus}`}>
            {SUBMIT_LABEL[submitStatus]}
            {submitStatus === 'submitted' && submittedAt ? ` · ${submittedAt.slice(0, 10)}` : ''}
          </span>
        )}
        {submittable && onSubmit && (
          <button className="btn btn-primary ts-submit-btn" type="button" onClick={onSubmit}>Submit week</button>
        )}
      </div>
    </div>
  );
}
