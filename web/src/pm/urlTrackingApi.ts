import { authed } from '../fetchHelper';

export type UrlActivityEntry = {
  _id: string;
  userId: { _id: string; displayName: string; email: string } | string;
  url: string;
  title: string;
  category: 'productive' | 'neutral' | 'non-productive';
  startedAt: string;
  endedAt: string | null;
  durationMs: number;
};

export type UrlSummary = {
  byCategory: Record<string, number>;
  topUrls: { url: string; category: string; totalMs: number }[];
  byUser: { userId: string; displayName: string; totalMs: number }[];
};

export type UrlCategoryRule = {
  _id: string;
  pattern: string;
  category: 'productive' | 'neutral' | 'non-productive';
  label: string;
};

export const getUrlActivities = (startDate: string, endDate: string) =>
  authed(`/url-tracking/activities?startDate=${startDate}&endDate=${endDate}`) as Promise<UrlActivityEntry[]>;

export const getUrlSummary = (startDate: string, endDate: string) =>
  authed(`/url-tracking/summary?startDate=${startDate}&endDate=${endDate}`) as Promise<UrlSummary>;

export const listUrlCategories = () =>
  authed('/url-tracking/categories') as Promise<UrlCategoryRule[]>;

export const createUrlCategory = (body: { pattern: string; category: string; label: string }) =>
  authed('/url-tracking/categories', 'POST', body) as Promise<UrlCategoryRule>;

export const updateUrlCategory = (id: string, body: Partial<UrlCategoryRule>) =>
  authed(`/url-tracking/categories/${id}`, 'PATCH', body) as Promise<UrlCategoryRule>;

export const deleteUrlCategory = (id: string) =>
  authed(`/url-tracking/categories/${id}`, 'DELETE');
