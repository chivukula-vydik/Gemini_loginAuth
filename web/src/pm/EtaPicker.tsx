import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { etaStatus } from './eta';
import { popoverPosition, type Placement } from './popoverPosition';

const POPOVER_WIDTH = 220;
const POPOVER_HEIGHT = 150;

type Props = {
  etaAt: string | null;
  deadline: string | null;
  taskStatus?: string;
  onSave: (etaAt: string | null) => void;
};

function pad(n: number): string { return String(n).padStart(2, '0'); }

function triggerLabel(etaAt: string | null): string {
  if (!etaAt) return 'Set completion date';
  const d = new Date(etaAt);
  return `I'll finish by ${d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}`;
}

export function EtaPicker({ etaAt, deadline, taskStatus, onSave }: Props) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('18:00');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [place, setPlace] = useState<Placement | null>(null);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    setPlace(popoverPosition(
      { left: r.left, top: r.top, bottom: r.bottom, width: r.width },
      { width: window.innerWidth, height: window.innerHeight },
      POPOVER_HEIGHT, POPOVER_WIDTH,
    ));
  }, [open]);

  // Prefill the inputs from the current value each time the picker opens.
  useEffect(() => {
    if (!open || !etaAt) return;
    const d = new Date(etaAt);
    setDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
    setTime(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
  }, [open, etaAt]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const status = etaStatus(etaAt, deadline);

  function commit() {
    if (!date) return;
    onSave(new Date(`${date}T${time || '18:00'}`).toISOString());
    setOpen(false);
  }

  return (
    <div className="eta-picker">
      <button ref={triggerRef} className="link-btn eta-trigger" type="button" onClick={() => setOpen((o) => !o)}>
        {triggerLabel(etaAt)}
      </button>

      {open && place && createPortal(
        <>
          <div className="eta-pop-backdrop" onClick={() => setOpen(false)} />
          <div
            className="eta-pop"
            role="dialog"
            aria-label="Set expected completion date"
            style={{
              left: place.left,
              top: place.top ?? undefined,
              bottom: place.bottom ?? undefined,
              width: POPOVER_WIDTH,
            }}
          >
            <div className="eta-pop-custom">
              <input className="input eta-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              <input className="input eta-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
            <div className="eta-pop-foot">
              <button className="eta-opt" type="button" disabled={!date} onClick={commit}>Set</button>
              {etaAt && (
                <button className="link-btn eta-clear" type="button" onClick={() => { onSave(null); setOpen(false); }}>Clear</button>
              )}
            </div>
          </div>
        </>,
        document.body,
      )}

      {status === 'ontrack' && <div className="eta-ok">✓ On track for the deadline</div>}
      {status === 'late' && taskStatus !== 'done' && (
        <div className="eta-late">⚠ Your estimate is later than the deadline — discuss the timeline with your PM.</div>
      )}
    </div>
  );
}
