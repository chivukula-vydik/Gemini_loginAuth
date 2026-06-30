import { getAccessToken, refresh, setAccessToken } from './api';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000';

function authHeader(): Record<string, string> {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function doFetch(path: string, method: string, body?: unknown): Promise<Response> {
  return fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    credentials: 'include',
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

async function doRawFetch(path: string, method: string, body?: BodyInit): Promise<Response> {
  return fetch(`${API}${path}`, {
    method,
    headers: authHeader(),
    credentials: 'include',
    ...(body !== undefined ? { body } : {}),
  });
}

async function retryOn401<T>(initial: Promise<Response>, retry: () => Promise<Response>, handle: (r: Response) => Promise<T>): Promise<T> {
  let r = await initial;
  if (r.status === 401) {
    const newToken = await refresh();
    if (newToken) {
      setAccessToken(newToken);
      r = await retry();
    }
  }
  return handle(r);
}

export async function authed(path: string, method = 'GET', body?: unknown) {
  return retryOn401(
    doFetch(path, method, body),
    () => doFetch(path, method, body),
    async (r) => {
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (r.status === 403 && data?.error === 'feature_disabled') {
          window.dispatchEvent(new CustomEvent('feature-disabled'));
        }
        throw new Error((data && data.error) || `request failed (${r.status})`);
      }
      return data;
    },
  );
}

export async function authedRaw(path: string, method = 'GET', body?: BodyInit): Promise<Response> {
  return retryOn401(
    doRawFetch(path, method, body),
    () => doRawFetch(path, method, body),
    async (r) => r,
  );
}
