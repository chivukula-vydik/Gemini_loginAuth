import { useEffect, useRef, useState } from 'react';
import { parseTimeInput, formatMinutes } from './time';
import { NotePopover } from './NotePopover';

type Props = {
  minutes: number;
  onChange: (minutes: number) => void;
  note?: string;
  onNoteChange?: (text: string) => void;
  readOnly?: boolean;
  className?: string;
};

export function TimeCell({ minutes, onChange, note = '', onNoteChange, readOnly = false, className = '' }: Props) {
  const display = minutes > 0 ? formatMinutes(minutes) : '';
  const [text, setText] = useState(display);
  const [editing, setEditing] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const cellRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!editing) setText(display);
  }, [display, editing]);

  function commit() {
    const parsed = parseTimeInput(text);
    setEditing(false);
    setText(parsed > 0 ? formatMinutes(parsed) : '');
    if (parsed !== minutes) onChange(parsed);
  }

  const hasNote = note.length > 0;

  if (readOnly) {
    return (
      <div ref={cellRef} className="ts-cell-wrap">
        <span className={`ts-cell-ro${minutes > 0 ? '' : ' ts-cell-ro-empty'}`}>{display || '—'}</span>
        {hasNote && (
          <button className="note-icon note-icon-filled" type="button" aria-label="View note" onClick={() => setNoteOpen(true)}>🗒</button>
        )}
        {noteOpen && (
          <NotePopover note={note} readOnly onChange={() => {}} onClose={() => setNoteOpen(false)} anchorRef={cellRef} />
        )}
      </div>
    );
  }

  return (
    <div ref={cellRef} className="ts-cell-wrap">
      <input
        className={`ts-cell${className ? ` ${className}` : ''}`}
        inputMode="text"
        placeholder="—"
        value={text}
        onFocus={() => setEditing(true)}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      />
      {onNoteChange && (
        <button
          className={`note-icon${hasNote ? ' note-icon-filled' : ''}`}
          type="button"
          aria-label={hasNote ? 'Edit note' : 'Add note'}
          onClick={() => setNoteOpen(true)}
        >
          🗒
        </button>
      )}
      {noteOpen && onNoteChange && (
        <NotePopover note={note} readOnly={false} onChange={onNoteChange} onClose={() => setNoteOpen(false)} anchorRef={cellRef} />
      )}
    </div>
  );
}
