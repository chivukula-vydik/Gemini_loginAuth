import { useEffect, useRef } from 'react';

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
  return `${Math.floor(hrs / 24)}d ago`;
}

export interface DropdownItem {
  _id: string;
  person: { _id: string; displayName: string } | null;
  text: string;
  read: boolean;
  createdAt: string;
  onClick: () => void;
}

export function NotificationDropdown({ title, badge, items, onMarkAllRead, onClose }: {
  title: string;
  icon: React.ReactNode;
  badge: number;
  items: DropdownItem[];
  onMarkAllRead: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  return (
    <div className="nd-container" ref={ref}>
      <div className="nd-dropdown">
        <div className="nd-header">
          <span className="nd-title">{title}</span>
          {badge > 0 && (
            <button className="nd-mark-all" onClick={onMarkAllRead}>Mark all read</button>
          )}
        </div>
        <div className="nd-list">
          {items.length === 0 ? (
            <div className="nd-empty">No {title.toLowerCase()} yet</div>
          ) : (
            items.map((item) => (
              <div
                key={item._id}
                className={`nd-item ${!item.read ? 'nd-item--unread' : ''}`}
                onClick={item.onClick}
                role="button"
                tabIndex={0}
              >
                {item.person && (
                  <div className="nd-avatar" style={{ background: colorFor(item.person._id) }}>
                    {initials(item.person.displayName || 'FE')}
                  </div>
                )}
                <div className="nd-item-body">
                  <span className="nd-item-text">{item.text}</span>
                  <span className="nd-item-time">{timeAgo(item.createdAt)}</span>
                </div>
                {!item.read && <span className="nd-unread-dot" />}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
