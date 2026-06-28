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

  const canSubmit = (() => {
    if (!body.trim()) return false;
    if (tab === 'Poll') {
      const filled = pollOptions.filter((o) => o.trim());
      if (filled.length < 2) return false;
    }
    if (tab === 'Praise' && !praiseTarget) return false;
    return true;
  })();

  async function handleSubmit() {
    if (!canSubmit) return;
    setBusy(true);
    setError('');
    try {
      let data: Parameters<typeof createFeedItem>[0] = { type: tab.toLowerCase() as any, body };
      if (tab === 'Poll') {
        const opts = pollOptions.filter((o) => o.trim());
        data = { ...data, pollOptions: opts.map((text) => ({ text })), pollMultiChoice, pollAnonymous };
      }
      if (tab === 'Praise') {
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
    <div className="hp-subcard fc-composer">
      <div className="fc-tabs">
        {(['Post', 'Poll', 'Praise'] as PostTab[]).map((t) => (
          <button key={t} className={`fc-tab ${tab === t ? 'fc-tab--active' : ''}`} onClick={() => { setTab(t); setError(''); }}>
            {t === 'Post' && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>}
            {t === 'Poll' && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 16V8"/><path d="M12 16v-5"/><path d="M17 16v-8"/></svg>}
            {t === 'Praise' && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>}
            {t}
          </button>
        ))}
      </div>

      <div className="fc-body">
        <textarea
          className="fc-textarea"
          placeholder={tab === 'Post' ? 'Share something with your team...' : tab === 'Poll' ? 'Ask your question...' : 'Write a praise message...'}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
        />

        {tab === 'Poll' && (
          <div className="fc-poll">
            <div className="fc-poll-options">
              {pollOptions.map((opt, i) => (
                <div key={i} className="fc-poll-row">
                  <input
                    className="fc-poll-input"
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
                    <button className="fc-poll-remove" onClick={() => setPollOptions(pollOptions.filter((_, j) => j !== i))} aria-label="Remove option">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button className="fc-poll-add" onClick={() => setPollOptions([...pollOptions, ''])}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add option
            </button>
            <div className="fc-poll-toggles">
              <label className="fc-toggle">
                <input type="checkbox" checked={pollMultiChoice} onChange={(e) => setPollMultiChoice(e.target.checked)} />
                <span className="fc-toggle-track"><span className="fc-toggle-thumb" /></span>
                Multi-choice
              </label>
              <label className="fc-toggle">
                <input type="checkbox" checked={pollAnonymous} onChange={(e) => setPollAnonymous(e.target.checked)} />
                <span className="fc-toggle-track"><span className="fc-toggle-thumb" /></span>
                Anonymous
              </label>
            </div>
          </div>
        )}

        {tab === 'Praise' && (
          <div className="fc-praise">
            <select className="fc-select" value={praiseTarget} onChange={(e) => setPraiseTarget(e.target.value)}>
              <option value="">Select person...</option>
              {users.map((u) => <option key={u._id} value={u._id}>{u.displayName}</option>)}
            </select>
            <select className="fc-select" value={praiseCategory} onChange={(e) => setPraiseCategory(e.target.value)}>
              <option value="">Category (optional)</option>
              {PRAISE_CATEGORIES.map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
            </select>
          </div>
        )}

        {error && <div className="fc-error">{error}</div>}

        <div className="fc-footer">
          <button className="fc-submit" onClick={handleSubmit} disabled={busy || !canSubmit}>
            {busy ? 'Posting...' : tab === 'Praise' ? 'Send Praise' : 'Post'}
          </button>
        </div>
      </div>
    </div>
  );
}
