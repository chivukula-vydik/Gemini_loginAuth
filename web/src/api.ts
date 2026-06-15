const API = 'http://localhost:4000';

let accessToken: string | null = null;
export const setAccessToken = (t: string | null) => { accessToken = t; };
export const getAccessToken = () => accessToken;

export type Provider = {
  id: string;
  displayName: string;
  kind: 'password' | 'oauth-redirect' | 'saml-redirect';
  startUrl: string | null;
};

export async function fetchProviders(): Promise<Provider[]> {
  const r = await fetch(`${API}/auth/providers`);
  return r.json();
}

export async function apiPost(path: string, body: unknown) {
  const r = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `request failed (${r.status})`);
  return data;
}

export async function refresh(): Promise<string | null> {
  const r = await fetch(`${API}/auth/refresh`, { method: 'POST', credentials: 'include' });
  if (!r.ok) return null;
  const data = await r.json();
  return data.accessToken;
}

export async function fetchMe() {
  const r = await fetch(`${API}/auth/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    credentials: 'include',
  });
  if (!r.ok) return null;
  return r.json();
}

export async function logout() {
  await fetch(`${API}/auth/logout`, { method: 'POST', credentials: 'include' });
  setAccessToken(null);
}

export const oauthUrl = (startUrl: string) => `${API}${startUrl}`;
