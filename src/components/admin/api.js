'use client';

export async function api(url, { method = 'GET', body } = {}) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const json = await res.json().catch(() => ({}));
  if (res.status === 403 && !url.includes('/login')) {
    // session expired
    if (typeof window !== 'undefined') window.location.href = '/admin/login';
  }
  if (!res.ok) throw new Error(json.error || 'Something went wrong.');
  return json;
}

export const rs = (n) => `Rs. ${Math.round(Number(n) || 0).toLocaleString('en-PK')}`;
export const when = (d) => new Date(d).toLocaleString('en-PK', { timeZone: 'Asia/Karachi', dateStyle: 'medium', timeStyle: 'short' });
export const ago = (d) => {
  const m = Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 60000));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
};
