import { useEffect, useState } from 'react';
import { parseTimeInput, formatMinutes } from './time';

type Props = {
  minutes: number;
  onChange: (minutes: number) => void;
  readOnly?: boolean;
};

// Shows normalized "Hh MMm" when not focused; lets the user type freely while
// focused; parses + normalizes on blur. Empty (0) renders as a blank cell.
// In read-only mode (past weeks) it renders a static value instead of an input.
export function TimeCell({ minutes, onChange, readOnly = false }: Props) {
  const display = minutes > 0 ? formatMinutes(minutes) : '';
  const [text, setText] = useState(display);
  const [editing, setEditing] = useState(false);

  // Keep local text in sync when not actively editing (e.g. week switch, copy).
  useEffect(() => {
    if (!editing) setText(display);
  }, [display, editing]);

  function commit() {
    const parsed = parseTimeInput(text);
    setEditing(false);
    setText(parsed > 0 ? formatMinutes(parsed) : '');
    if (parsed !== minutes) onChange(parsed);
  }

  if (readOnly) {
    return <span className={`ts-cell-ro${minutes > 0 ? '' : ' ts-cell-ro-empty'}`}>{display || '—'}</span>;
  }

  return (
    <input
      className="ts-cell"
      inputMode="text"
      placeholder="—"
      value={text}
      onFocus={() => setEditing(true)}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
    />
  );
}
