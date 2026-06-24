import { formatMinutes } from './time';

type Props = {
  billableMinutes: number;
  nonBillableMinutes: number;
  timeOffMinutes: number;
  targetMinutes: number;
};

export function BillableBar({ billableMinutes, nonBillableMinutes, timeOffMinutes, targetMinutes }: Props) {
  const total = billableMinutes + nonBillableMinutes + timeOffMinutes;
  const cap = Math.max(targetMinutes, total);
  const pctB = cap > 0 ? (billableMinutes / cap) * 100 : 0;
  const pctNB = cap > 0 ? (nonBillableMinutes / cap) * 100 : 0;
  const pctTO = cap > 0 ? (timeOffMinutes / cap) * 100 : 0;

  return (
    <div className="bb-wrap">
      <div className="bb-header">
        <span className="bb-total">{formatMinutes(total)} / {formatMinutes(targetMinutes)}</span>
        <div className="bb-legend">
          <span className="bb-legend-item"><span className="bb-dot bb-dot-billable" /> Billable</span>
          <span className="bb-legend-item"><span className="bb-dot bb-dot-nonbillable" /> Non-billable</span>
          <span className="bb-legend-item"><span className="bb-dot bb-dot-timeoff" /> Time off</span>
        </div>
      </div>
      <div className="bb-track">
        {pctB > 0 && <div className="bb-seg bb-seg-billable" style={{ width: `${pctB}%` }} />}
        {pctNB > 0 && <div className="bb-seg bb-seg-nonbillable" style={{ width: `${pctNB}%` }} />}
        {pctTO > 0 && <div className="bb-seg bb-seg-timeoff" style={{ width: `${pctTO}%` }} />}
      </div>
    </div>
  );
}
