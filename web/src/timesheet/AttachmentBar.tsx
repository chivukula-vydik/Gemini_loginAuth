import { useRef, useState } from 'react';
import { uploadAttachment, deleteAttachment, attachmentUrl } from './timesheetApi';
import type { Attachment } from './timesheetApi';
import { formatSize } from '../format';

type Props = {
  weekStart: string;
  attachments: Attachment[];
  readOnly: boolean;
  onUpdate: (attachments: Attachment[]) => void;
};

export function AttachmentBar({ weekStart, attachments, readOnly, onUpdate }: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const att = await uploadAttachment(weekStart, file);
      onUpdate([...attachments, att]);
    } catch (err) {
      window.alert((err as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handleDelete(fileId: string) {
    if (!window.confirm('Delete this attachment?')) return;
    try {
      await deleteAttachment(weekStart, fileId);
      onUpdate(attachments.filter((a) => a.fileId !== fileId));
    } catch (err) {
      window.alert((err as Error).message);
    }
  }

  return (
    <div className="att-bar">
      {!readOnly && (
        <>
          <button className="att-act att-act-sm" type="button" disabled={uploading || attachments.length >= 5} onClick={() => fileRef.current?.click()}>
            {uploading ? 'Uploading…' : 'Attach file'}
          </button>
          <input ref={fileRef} type="file" hidden onChange={handleUpload} />
        </>
      )}
      {attachments.length > 0 && (
        <ul className="ts-att-list">
          {attachments.map((a) => (
            <li key={a.fileId} className="ts-att-item">
              <a href={attachmentUrl(a.fileId)} target="_blank" rel="noopener noreferrer" className="ts-att-link">{a.filename}</a>
              <span className="ts-att-size">{formatSize(a.size)}</span>
              {!readOnly && <button className="ts-att-del" type="button" onClick={() => handleDelete(a.fileId)}>&times;</button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
