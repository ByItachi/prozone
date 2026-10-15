export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  code: string;
  status: number;
  issues?: unknown[];

  constructor(message: string, code = 'ERROR', status = 500, issues?: unknown[]) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.issues = issues;
  }
}

export interface ApiEnvelope<T = unknown> {
  success: boolean;
  message: string;
  code?: string;
  data: T;
  issues?: unknown[];
}

async function parseError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as ApiEnvelope;
    return new ApiError(body.message ?? 'Request failed', body.code ?? 'ERROR', res.status, body.issues);
  } catch {
    return new ApiError(`Request failed (HTTP ${res.status})`, 'ERROR', res.status);
  }
}

export async function api<T = unknown>(
  path: string,
  options: RequestInit = {},
  retryOnRefresh = true,
): Promise<T> {
  const url = path.startsWith('http') ? path : `${API_URL}${path}`;
  const headers: Record<string, string> = {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers as Record<string, string> | undefined),
  };

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
    cache: 'no-store',
  });

  if (res.status === 401 && retryOnRefresh && !path.endsWith('/auth/refresh')) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      return api<T>(path, options, false);
    }
  }

  if (!res.ok) {
    throw await parseError(res);
  }

  const body = (await res.json()) as ApiEnvelope<T>;
  if (!body.success) {
    throw new ApiError(body.message ?? 'Request failed', body.code ?? 'ERROR', res.status, body.issues);
  }
  return body.data;
}

export async function tryRefresh(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: '{}',
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function getErrorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'An unexpected error occurred';
}