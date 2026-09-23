import { env } from '@/lib/env';
import { signRequest } from './sign';

export class ValrApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
    message: string
  ) {
    super(message);
    this.name = 'ValrApiError';
  }
}

type Verb = 'GET' | 'POST' | 'PUT' | 'DELETE';

/**
 * Low-level authenticated call to the VALR REST API.
 * Never call fetch() to api.valr.com directly anywhere else in the
 * codebase — always go through this so every request is signed
 * identically and every error is shaped the same way.
 */
async function valrRequest<T>(
  verb: Verb,
  path: string, // must include query string, e.g. /v1/simple/USDCZAR/quote
  body?: unknown
): Promise<T> {
  const apiKey = env.VALR_API_KEY();
  const apiSecret = env.VALR_API_SECRET();
  const baseUrl = env.VALR_API_BASE_URL;

  const timestamp = Date.now().toString();
  const bodyStr = body !== undefined ? JSON.stringify(body) : '';
  const signature = signRequest(apiSecret, timestamp, verb, path, bodyStr);

  const res = await fetch(`${baseUrl}${path}`, {
    method: verb,
    headers: {
      'Content-Type': 'application/json',
      'X-VALR-API-KEY': apiKey,
      'X-VALR-SIGNATURE': signature,
      'X-VALR-TIMESTAMP': timestamp,
    },
    body: bodyStr === '' ? undefined : bodyStr,
    // Never cache authenticated responses (balances, quotes, orders).
    cache: 'no-store',
  });

  const text = await res.text();
  const parsed = text ? safeJsonParse(text) : null;

  if (!res.ok) {
    throw new ValrApiError(
      res.status,
      parsed,
      `VALR API error ${res.status} on ${verb} ${path}: ${text.slice(0, 500)}`
    );
  }

  return parsed as T;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

export const valr = {
  get: <T>(path: string) => valrRequest<T>('GET', path),
  post: <T>(path: string, body?: unknown) => valrRequest<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => valrRequest<T>('PUT', path, body),
  del: <T>(path: string, body?: unknown) => valrRequest<T>('DELETE', path, body),
};

/**
 * Public (unauthenticated) VALR endpoints — no signing needed, but routed
 * through the same base URL config for consistency.
 */
export async function valrPublic<T>(path: string): Promise<T> {
  const baseUrl = env.VALR_API_BASE_URL;
  const res = await fetch(`${baseUrl}${path}`, { cache: 'no-store' });
  const text = await res.text();
  const parsed = text ? safeJsonParse(text) : null;
  if (!res.ok) {
    throw new ValrApiError(res.status, parsed, `VALR public API error ${res.status} on GET ${path}`);
  }
  return parsed as T;
}
