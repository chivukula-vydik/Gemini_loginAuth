import { useState, useEffect } from 'react';
import { useAuth } from '../authContext';
import { authed } from '../fetchHelper';
import { createFeedItem, FeedItem } from './feedApi';

type PostTab = 'Post' | 'Poll' | 'Praise';
const PRAISE_CATEGORIES = ['teamwork', 'innovation', 'leadership', 'ownership', 'excellence'];

interface UserOption {
  _id: string;
  displayName: string;
  email: string;
}

export function FeedComposer({ onPost }: { onPost: (item: FeedItem) => void }) {
  const { user } = useAuth();
  const [tab, setTab] = useState<PostTab>('Post');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [pollOptions, setPollOptions] = useState(['', '']);
  const [pollMultiChoice, setPollMultiChoice] = useState(false);
  const [pollAnonymous, setPollAnonymous] = useState(false);

  const [praiseTarget, setPraiseTarget] = useState('');
  const [praiseCategory, setPraiseCategory] = useState('');
  const [users, setUsers] = useState<UserOption[]>([]);

  useEffect(() => {
    authed('/users').then((data: UserOption[]) => {
      setUsers(Array.isArray(data) ? data.filter((u) => u._id !== (user as any)?._id) : []);
    }).catch(() => {});
  }, [user]);

  function reset() {
    setBody('');
    setPollOptions(['', '']);
    setPollMultiChoice(false);
    setPollAnonymous(false);
    setPraiseTarget('');
    setPraiseCategory('');
    setError('');
  }

  async function handleSubmit() {
    if (!body.trim()) return;
    setBusy(true);
    setError('');
    try {
      let data: Parameters<typeof createFeedItem>[0] = { type: tab.toLowerCase() as any, body };
      if (tab === 'Poll') {
        const opts = pollOptions.filter((o) => o.trim());
        if (opts.length < 2) { setError('At least 2 options required'); setBusy(false); return; }
        data = { ...data, pollOptions: opts.map((text) => ({ text })), pollMultiChoice, pollAnonymous };
      }
      if (tab === 'Praise') {
        if (!praiseTarget) { setError('Select a person'); setBusy(false); return; }
        data = { ...data, praiseTarget, praiseCategory: praiseCategory || undefined };
      }
      const item = await createFeedItem(data);
      onPost(item);
      reset();
    } catch (e: any) {
      setError(e.message || 'Failed to post');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="hp-subcard">
      <div className="hp-composer-tabs">
        {(['Post', 'Poll', 'Praise'] as PostTab[]).map((t) => (
          <button key={t} className={`hp-composer-tab ${tab === t ? 'active' : ''}`} onClick={() => { setTab(t); setError(''); }}>{t}</button>
        ))}
      </div>

      <textarea
        className="hp-composer-input"
        placeholder={tab === 'Post' ? 'Write your post here...' : tab === 'Poll' ? 'Ask your question...' : 'Write a praise message...'}
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />

      {tab === 'Poll' && (
        <div className="hp-poll-options">
          {pollOptions.map((opt, i) => (
            <div key={i} className="hp-poll-option-row">
              <input
                type="text"
                placeholder={`Option ${i + 1}`}
                value={opt}
                onChange={(e) => {
                  const next = [...pollOptions];
                  next[i] = e.target.value;
                  setPollOptions(next);
                }}
              />
              {pollOptions.length > 2 && (
                <button className="hp-poll-remove-btn" onClick={() => setPollOptions(pollOptions.filter((_, j) => j !== i))}>×</button>
              )}
            </div>
          ))}
          <button className="hp-poll-add-btn" onClick={() => setPollOptions([...pollOptions, ''])}>+ Add option</button>
          <div className="hp-poll-toggles">
            <label><input type="checkbox" checked={pollMultiChoice} onChange={(e) => setPollMultiChoice(e.target.checked)} /> Multi-choice</label>
            <label><input type="checkbox" checked={pollAnonymous} onChange={(e) => setPollAnonymous(e.target.checked)} /> Anonymous</label>
          </div>
        </div>
      )}

      {tab === 'Praise' && (
        <div className="hp-praise-fields">
          <select value={praiseTarget} onChange={(e) => setPraiseTarget(e.target.value)}>
            <option value="">Select person...</option>
            {users.map((u) => <option key={u._id} value={u._id}>{u.displayName}</option>)}
          </select>
          <select value={praiseCategory} onChange={(e) => setPraiseCategory(e.target.value)}>
            <option value="">Category (optional)</option>
            {PRAISE_CATEGORIES.map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
          </select>
        </div>
      )}

      {error && <div className="hp-composer-error">{error}</div>}
      <button className="hp-composer-submit" onClick={handleSubmit} disabled={busy || !body.trim()}>
        {busy ? 'Posting...' : tab === 'Praise' ? 'Send Praise' : 'Post'}
      </button>
    </div>
  );
}
