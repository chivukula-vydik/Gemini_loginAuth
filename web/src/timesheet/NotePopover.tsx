import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { popoverPosition, type Placement } from '../pm/popoverPosition';

const POP_WIDTH = 240;
const POP_HEIGHT = 160;

type Props = {
  note: string;
  readOnly: boolean;
  onChange: (text: string) => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
};

export function NotePopover({ note, readOnly, onChange, onClose, anchorRef }: Props) {
  const [place, setPlace] = useState<Placement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useLayoutEffect(() => {
    if (!anchorRef.current) return;
    const r = anchorRef.current.getBoundingClientRect();
    setPlace(popoverPosition(
      { left: r.left, top: r.top, bottom: r.bottom, width: r.width },
      { width: window.innerWidth, height: window.innerHeight },
      POP_HEIGHT, POP_WIDTH,
    ));
  }, [anchorRef]);

  useEffect(() => {
    if (!readOnly) textareaRef.current?.focus();
  }, [readOnly]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!place) return null;

  return createPortal(
    <>
      <div className="note-pop-backdrop" onClick={onClose} />
      <div
        className="note-pop"
        style={{ left: place.left, top: place.top ?? undefined, bottom: place.bottom ?? undefined }}
      >
        {readOnly ? (
          <p className="note-pop-text">{note || 'No note.'}</p>
        ) : (
          <textarea
            ref={textareaRef}
            className="note-pop-input"
            placeholder="Add a note…"
            maxLength={500}
            value={note}
            onChange={(e) => onChange(e.target.value)}
          />
        )}
      </div>
    </>,
    document.body,
  );
}
