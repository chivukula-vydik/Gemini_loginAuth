import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { EstimateUnit } from './pmApi';

const UNITS: EstimateUnit[] = ['hours', 'days', 'weeks'];

type Props = {
  taskTitle: string;
  initialValue: number;
  initialUnit: EstimateUnit;
  initialReason: string;
  onSubmit: (value: number, unit: EstimateUnit, reason: string) => void;
  onClose: () => void;
};

export function EstimateRequestModal({ taskTitle, initialValue, initialUnit, initialReason, onSubmit, onClose }: Props) {
  const [value, setValue] = useState<number>(initialValue);
  const [unit, setUnit] = useState<EstimateUnit>(initialUnit);
  const [reason, setReason] = useState<string>(initialReason);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Render through a portal to <body> so the fixed overlay is not trapped inside
  // a transformed/overflow-hidden ancestor (the task table's .ts-card).
  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="ts-card modal-card" role="dialog" aria-modal="true" aria-label="Request estimate change" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">Request estimate change</h3>
        <p className="ts-sub modal-task">{taskTitle}</p>

        <label className="modal-field">
          <span className="modal-label">Revised estimate</span>
          <span className="ts-nav-left">
            <input className="ts-pct" type="number" min={0} value={value} autoFocus
              onChange={(e) => setValue(Number(e.target.value))} />
            <select className="input ts-status" value={unit} onChange={(e) => setUnit(e.target.value as EstimateUnit)}>
              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </span>
        </label>

        <label className="modal-field">
          <span className="modal-label">Reason <span className="ts-sub">(optional)</span></span>
          <textarea className="input modal-reason" rows={3} value={reason}
            placeholder="Why is the assigned estimate insufficient?"
            onChange={(e) => setReason(e.target.value)} />
        </label>

        <div className="modal-actions">
          <button className="link-btn" type="button" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" type="button" onClick={() => onSubmit(value, unit, reason.trim())}>
            Send request
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
