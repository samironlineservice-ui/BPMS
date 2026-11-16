import type { ProblemDetails } from '@ads/contracts';

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly problem: ProblemDetails) {
    super(problem.title);
  }
}

let onUnauthenticated: (() => void) | null = null;
export const setUnauthenticatedHandler = (fn: () => void) => { onUnauthenticated = fn; };

type Query = Record<string, string | number | boolean | undefined | null>;
const qs = (q?: Query) => {
  if (!q) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};

async function request<T>(method: string, path: string, body?: unknown, query?: Query): Promise<T> {
  const res = await fetch(`/api/v1/portal${path}${qs(query)}`, {
    method, credentials: 'same-origin',
    headers: { 'x-ads-csrf': '1', ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const ct = res.headers.get('content-type') ?? '';
  const data = ct.includes('json') ? await res.json() : await res.text();
  if (!res.ok) {
    const problem = (typeof data === 'object' && data ? data : { type: 'about:blank', title: String(data || res.statusText), status: res.status }) as ProblemDetails;
    if (res.status === 401 && problem.code === 'UNAUTHENTICATED') onUnauthenticated?.();
    throw new ApiError(res.status, problem);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, query?: Query) => request<T>('GET', path, undefined, query),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
};
export const errorText = (e: unknown) => (e instanceof ApiError ? e.problem.title : 'Xatolik yuz berdi');
