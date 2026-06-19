import { useEffect, useState } from 'react';
import { todayISO } from '../timesheet/time';
import { etaStatus } from './eta';
import { presetDates, etaIsoAt } from './etaPresets';

type Props = {
  etaAt: string | null;
  deadline: string | null;
  taskStatus?: string;
  onSave: (etaAt: string | null) => void;
};

function triggerLabel(etaAt: string | null): string {
  if (!etaAt) return 'Set completion date';
  const d = new Date(etaAt);
  return `I'll finish by ${d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}`;
}

export function EtaPicker({ etaAt, deadline, taskStatus, onSave }: Props) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState('');
  const [showTime, setShowTime] = useState(false);
  const [time, setTime] = useState('18:00');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const presets = presetDates(todayISO(), deadline);
  const status = etaStatus(etaAt, deadline);

  function commit(dateISO: string) {
    const iso = showTime && time ? new Date(`${dateISO}T${time}`).toISOString() : etaIsoAt(dateISO);
    onSave(iso);
    setOpen(false);
  }

  return (
    <div className="eta-picker">
      <button className="link-btn eta-trigger" type="button" onClick={() => setOpen((o) => !o)}>
        {triggerLabel(etaAt)}
      </button>

      {open && (
        <>
          <div className="eta-pop-backdrop" onClick={() => setOpen(false)} />
          <div className="eta-pop" role="dialog" aria-label="Set expected completion date">
            <div className="eta-pop-presets">
              {presets.map((p) => (
                <button key={p.key} className="eta-opt" type="button" onClick={() => commit(p.dateISO)}>{p.label}</button>
              ))}
            </div>
            <div className="eta-pop-custom">
              <input className="input eta-date" type="date" value={custom} onChange={(e) => setCustom(e.target.value)} />
              <button className="eta-opt" type="button" disabled={!custom} onClick={() => custom && commit(custom)}>Set</button>
            </div>
            <div className="eta-pop-foot">
              <button className="link-btn" type="button" onClick={() => setShowTime((s) => !s)}>
                {showTime ? 'Use 6 PM' : 'Adjust time'}
              </button>
              {showTime && (
                <input className="input eta-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              )}
              {etaAt && (
                <button className="link-btn eta-clear" type="button" onClick={() => { onSave(null); setOpen(false); }}>Clear</button>
              )}
            </div>
          </div>
        </>
      )}

      {status === 'ontrack' && <div className="eta-ok">✓ On track for the deadline</div>}
      {status === 'late' && taskStatus !== 'done' && (
        <div className="eta-late">⚠ Your estimate is later than the deadline — discuss the timeline with your PM.</div>
      )}
    </div>
  );
}
