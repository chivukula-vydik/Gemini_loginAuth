import { useState } from 'react';
import { IconHeart, IconHeartFilled, IconMessageCircle, IconTrash } from '@tabler/icons-react';
import { useAuth } from '../authContext';
import { FeedItem, toggleLike, addComment, deleteFeedItem, votePoll } from './feedApi';

const AVATAR_COLORS = ['#4f6ef7', '#22c55e', '#f59e0b', '#8b5cf6', '#ef4444', '#6b7280', '#ec4899', '#14b8a6'];
function colorFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initials(name: string): string {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function FeedCard({ item, onUpdate, onDelete }: {
  item: FeedItem;
  onUpdate: (item: Partial<FeedItem> & { _id: string }) => void;
  onDelete: (id: string) => void;
}) {
  const { user } = useAuth();
  const userId = (user as any)?._id;
  const roles: string[] = (user as any)?.roles || [];
  const isOwner = item.author._id === userId;
  const canDelete = isOwner || roles.includes('admin') || roles.includes('hr');

  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleLike() {
    const result = await toggleLike(item._id);
    onUpdate({ _id: item._id, liked: result.liked, likeCount: result.likeCount });
  }

  async function handleComment() {
    if (!commentText.trim()) return;
    setBusy(true);
    try {
      const updated = await addComment(item._id, commentText);
      onUpdate({ _id: item._id, comments: updated.comments, commentCount: updated.commentCount });
      setCommentText('');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    await deleteFeedItem(item._id);
    onDelete(item._id);
  }

  async function handleVote(indices: number[]) {
    const result = await votePoll(item._id, indices);
    onUpdate({ _id: item._id, voteTally: result.voteTally, myVote: result.myVote });
  }

  const authorName = item.author?.displayName || 'Former Employee';

  return (
    <div className={`hp-feed-card ${item.type === 'praise' ? 'hp-feed-card--praise' : ''} ${item.type === 'announcement' ? 'hp-feed-card--announcement' : ''}`}>
      <div className="hp-feed-card-header">
        <div className="hp-avatar" style={{ background: colorFor(item.author?._id || ''), width: 32, height: 32, fontSize: 12 }}>
          {initials(authorName)}
        </div>
        <div className="hp-feed-card-meta">
          <span className="hp-feed-card-author">{authorName}</span>
          <span className="hp-feed-card-time">{timeAgo(item.createdAt)}</span>
        </div>
        {item.type === 'announcement' && <span className="hp-badge">Announcement</span>}
        {item.type === 'praise' && item.praiseCategory && (
          <span className="hp-badge hp-badge--praise">{item.praiseCategory}</span>
        )}
        {canDelete && (
          <button className="hp-icon-btn hp-feed-delete" onClick={handleDelete} aria-label="Delete">
            <IconTrash size={14} />
          </button>
        )}
      </div>

      {item.type === 'praise' && item.praiseTarget && (
        <div className="hp-praise-target">
          <div className="hp-avatar" style={{ background: colorFor(item.praiseTarget._id), width: 28, height: 28, fontSize: 11 }}>
            {initials(item.praiseTarget.displayName || 'Former Employee')}
          </div>
          <span>{item.praiseTarget.displayName || 'Former Employee'}</span>
        </div>
      )}

      <div className="hp-feed-card-body">{item.body}</div>

      {item.type === 'poll' && item.pollOptions && (
        <PollSection item={item} onVote={handleVote} />
      )}

      {item.type !== 'announcement' && (
        <div className="hp-feed-card-actions">
          <button className="hp-feed-action-btn" onClick={handleLike}>
            {item.liked ? <IconHeartFilled size={16} color="#ef4444" /> : <IconHeart size={16} />}
            <span>{item.likeCount || 0}</span>
          </button>
          <button className="hp-feed-action-btn" onClick={() => setShowComments(!showComments)}>
            <IconMessageCircle size={16} />
            <span>{item.commentCount || 0}</span>
          </button>
        </div>
      )}

      {showComments && item.type !== 'announcement' && (
        <div className="hp-feed-comments">
          {(item.comments || []).map((c) => (
            <div key={c._id} className="hp-feed-comment">
              <span className="hp-feed-comment-author">{c.author?.displayName || 'Former Employee'}</span>
              <span className="hp-feed-comment-body">{c.body}</span>
              <span className="hp-feed-comment-time">{timeAgo(c.createdAt)}</span>
            </div>
          ))}
          <div className="hp-feed-comment-input">
            <input
              type="text"
              placeholder="Write a comment..."
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleComment()}
            />
            <button onClick={handleComment} disabled={busy || !commentText.trim()}>Send</button>
          </div>
        </div>
      )}
    </div>
  );
}

function PollSection({ item, onVote }: { item: FeedItem; onVote: (indices: number[]) => void }) {
  const hasVoted = item.myVote != null;
  const totalVotes = Object.values(item.voteTally || {}).reduce((a, b) => a + b, 0);
  const [selected, setSelected] = useState<number[]>([]);

  function handleOptionClick(idx: number) {
    if (hasVoted) return;
    if (item.pollMultiChoice) {
      setSelected((prev) => prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]);
    } else {
      onVote([idx]);
    }
  }

  return (
    <div className="hp-poll-section">
      {(item.pollOptions || []).map((opt, idx) => {
        const count = item.voteTally?.[String(idx)] || 0;
        const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
        const isMyChoice = (item.myVote || []).includes(idx);
        const isSelected = selected.includes(idx);

        return (
          <button
            key={opt._id}
            className={`hp-poll-option ${hasVoted ? 'voted' : ''} ${isMyChoice ? 'my-vote' : ''} ${isSelected ? 'selected' : ''}`}
            onClick={() => handleOptionClick(idx)}
            disabled={hasVoted}
          >
            <span className="hp-poll-option-text">{opt.text}</span>
            {hasVoted && (
              <>
                <div className="hp-poll-bar" style={{ width: `${pct}%` }} />
                <span className="hp-poll-pct">{pct}%</span>
              </>
            )}
          </button>
        );
      })}
      {item.pollMultiChoice && !hasVoted && selected.length > 0 && (
        <button className="hp-poll-submit" onClick={() => onVote(selected)}>Submit Vote</button>
      )}
      <div className="hp-poll-meta">
        {totalVotes} vote{totalVotes !== 1 ? 's' : ''}
        {item.pollAnonymous && <span className="hp-badge">Anonymous</span>}
        {item.pollMultiChoice && <span className="hp-badge">Multi-choice</span>}
      </div>
    </div>
  );
}
