import { authed } from '../fetchHelper';

export type FeedItemType = 'post' | 'poll' | 'praise' | 'announcement';

export interface FeedAuthor {
  _id: string;
  displayName: string;
  email: string;
}

export interface FeedComment {
  _id: string;
  author: FeedAuthor;
  body: string;
  createdAt: string;
}

export interface PollOption {
  text: string;
  _id: string;
}

export interface FeedItem {
  _id: string;
  type: FeedItemType;
  author: FeedAuthor;
  body: string;
  status: string;
  createdAt: string;

  pollOptions?: PollOption[];
  pollMultiChoice?: boolean;
  pollAnonymous?: boolean;
  voteTally?: Record<string, number>;
  myVote?: number[] | null;

  praiseTarget?: FeedAuthor;
  praiseCategory?: string;

  pinnedUntil?: string;

  likes: string[];
  likeCount: number;
  liked: boolean;
  comments: FeedComment[];
  commentCount: number;
}

export interface FeedResponse {
  items: FeedItem[];
  cursor: string | null;
}

export async function getFeed(cursor?: string): Promise<FeedResponse> {
  const q = cursor ? `?cursor=${cursor}` : '';
  return authed(`/feed${q}`);
}

export async function createFeedItem(data: {
  type: FeedItemType;
  body: string;
  pollOptions?: { text: string }[];
  pollMultiChoice?: boolean;
  pollAnonymous?: boolean;
  praiseTarget?: string;
  praiseCategory?: string;
}): Promise<FeedItem> {
  return authed('/feed', 'POST', data);
}

export async function deleteFeedItem(id: string): Promise<void> {
  return authed(`/feed/${id}`, 'DELETE');
}

export async function toggleLike(id: string): Promise<{ liked: boolean; likeCount: number }> {
  return authed(`/feed/${id}/like`, 'POST');
}

export async function addComment(id: string, body: string): Promise<FeedItem> {
  return authed(`/feed/${id}/comment`, 'POST', { body });
}

export async function deleteComment(itemId: string, commentId: string): Promise<void> {
  return authed(`/feed/${itemId}/comment/${commentId}`, 'DELETE');
}

export async function votePoll(id: string, optionIndices: number[]): Promise<{ voteTally: Record<string, number>; myVote: number[] }> {
  return authed(`/feed/${id}/vote`, 'POST', { optionIndices });
}
