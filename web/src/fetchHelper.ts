import { getAccessToken, refresh, setAccessToken } from './api';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000';

async function doFetch(path: string, method: string, body?: unknown): Promise<Response> {
  return fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAccessToken()}` },
    credentials: 'include',
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

export async function authed(path: string, method = 'GET', body?: unknown) {
  let r = await doFetch(path, method, body);

  if (r.status === 401) {
    const newToken = await refresh();
    if (newToken) {
      setAccessToken(newToken);
      r = await doFetch(path, method, body);
    }
  }

  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((data && data.error) || `request failed (${r.status})`);
  return data;
}
