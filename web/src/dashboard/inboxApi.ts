import { authed } from '../fetchHelper';

export interface InboxSender {
  _id: string;
  displayName: string;
  email: string;
}

export interface InboxItem {
  _id: string;
  sender: InboxSender;
  type: 'birthday_wish' | 'praise' | 'comment';
  body: string;
  refItem: string | null;
  read: boolean;
  createdAt: string;
}

export interface NotificationActor {
  _id: string;
  displayName: string;
  email: string;
}

export interface NotificationItem {
  _id: string;
  actor: NotificationActor;
  type: 'like' | 'leave_approved' | 'leave_rejected' | 'timesheet_approved' | 'claim_approved' | 'claim_denied' | 'mention';
  refItem: string | null;
  refModel: string | null;
  read: boolean;
  createdAt: string;
}

export interface ListResponse<T> {
  items: T[];
  cursor: string | null;
}

export async function getInbox(cursor?: string): Promise<ListResponse<InboxItem>> {
  const q = cursor ? `?cursor=${cursor}` : '';
  return authed(`/inbox${q}`);
}

export async function getInboxUnreadCount(): Promise<{ count: number }> {
  return authed('/inbox/unread-count');
}

export async function markInboxRead(id: string): Promise<void> {
  return authed(`/inbox/${id}/read`, 'POST');
}

export async function markAllInboxRead(): Promise<void> {
  return authed('/inbox/read-all', 'POST');
}

export async function sendWish(recipientId: string, body: string): Promise<InboxItem> {
  return authed('/inbox/wish', 'POST', { recipientId, body });
}

export async function getNotifications(cursor?: string): Promise<ListResponse<NotificationItem>> {
  const q = cursor ? `?cursor=${cursor}` : '';
  return authed(`/notifications${q}`);
}

export async function getNotificationsUnreadCount(): Promise<{ count: number }> {
  return authed('/notifications/unread-count');
}

export async function markNotificationRead(id: string): Promise<void> {
  return authed(`/notifications/${id}/read`, 'POST');
}

export async function markAllNotificationsRead(): Promise<void> {
  return authed('/notifications/read-all', 'POST');
}
