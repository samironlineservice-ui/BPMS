import type { ProblemDetails } from '@ads/contracts';

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly problem: ProblemDetails) {
    super(problem.title);
  }
  get code() { return this.problem.code; }
  get fieldErrors() { return this.problem.errors ?? {}; }
}

type Query = Record<string, string | number | boolean | null | undefined>;
const qs = (q?: Query) => {
  if (!q) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};

let onUnauthenticated: (() => void) | null = null;
export const setUnauthenticatedHandler = (fn: () => void) => { onUnauthenticated = fn; };

async function request<T>(method: string, path: string, body?: unknown, query?: Query): Promise<T> {
  const isForm = body instanceof FormData;
  const res = await fetch(`/api/v1${path}${qs(query)}`, {
    method,
    credentials: 'same-origin',
    headers: {
      'x-ads-csrf': '1',
      ...(body !== undefined && !isForm ? { 'content-type': 'application/json' } : {}),
    },
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get('content-type') ?? '';
  const data = ct.includes('json') ? await res.json() : await res.text();
  if (!res.ok) {
    const problem: ProblemDetails = typeof data === 'object' && data
      ? (data as ProblemDetails)
      : { type: 'about:blank', title: String(data || res.statusText), status: res.status };
    if (res.status === 401 && problem.code === 'UNAUTHENTICATED') onUnauthenticated?.();
    throw new ApiError(res.status, problem);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, query?: Query) => request<T>('GET', path, undefined, query),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body ?? {}),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body ?? {}),
  delete: <T>(path: string) => request<T>('DELETE', path),
  upload: <T>(path: string, form: FormData) => request<T>('POST', path, form),
};

/** Yuklash progressi bilan (fetch upload progressini bermaydi → XHR). FormData'da maydonlar fayldan OLDIN bo'lishi kerak. */
export function uploadWithProgress<T>(path: string, form: FormData, onProgress?: (pct: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/v1${path}`);
    xhr.withCredentials = true;
    xhr.setRequestHeader('x-ads-csrf', '1');
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => {
      let data: unknown = xhr.responseText;
      try { data = JSON.parse(xhr.responseText); } catch { /* matn */ }
      if (xhr.status >= 200 && xhr.status < 300) return resolve(data as T);
      const problem = (typeof data === 'object' && data ? data : { type: 'about:blank', title: String(data || xhr.statusText), status: xhr.status }) as ProblemDetails;
      if (xhr.status === 401 && problem.code === 'UNAUTHENTICATED') onUnauthenticated?.();
      reject(new ApiError(xhr.status, problem));
    };
    xhr.onerror = () => reject(new ApiError(0, { type: 'about:blank', title: "Tarmoq xatosi", status: 0 }));
    xhr.send(form);
  });
}
