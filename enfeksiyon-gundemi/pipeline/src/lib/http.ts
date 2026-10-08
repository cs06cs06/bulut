// Yeniden denemeli HTTP istekleri ve basit hız sınırlayıcı.

export class HttpError extends Error {
  constructor(
    public status: number,
    public url: string,
    public body: string,
  ) {
    super(`HTTP ${status} - ${url.split('?')[0]}`);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Saniyede en fazla `perSecond` istek başlatır. */
export class RateLimiter {
  private next = 0;
  constructor(private perSecond: number) {}
  async wait(): Promise<void> {
    const gap = 1000 / this.perSecond;
    const now = Date.now();
    const at = Math.max(now, this.next);
    this.next = at + gap;
    if (at > now) await sleep(at - now);
  }
}

export interface RetryOptions {
  retries?: number;
  baseDelayMs?: number;
  limiter?: RateLimiter;
  timeoutMs?: number;
}

function isRetryable(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

/**
 * fetch + üstel geri çekilmeli yeniden deneme (2s, 4s, 8s, ...).
 * 429 yanıtında Retry-After başlığına uyar. Kalıcı hatalarda (400, 404) hemen vazgeçer.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  opts: RetryOptions = {},
): Promise<Response> {
  const retries = opts.retries ?? 4;
  const base = opts.baseDelayMs ?? 2000;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (opts.limiter) await opts.limiter.wait();
    try {
      const res = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
      });
      if (res.ok) return res;
      const body = await res.text().catch(() => '');
      const err = new HttpError(res.status, url, body.slice(0, 500));
      if (!isRetryable(res.status) || attempt === retries) throw err;
      lastErr = err;
      const retryAfter = Number(res.headers.get('retry-after'));
      await sleep(retryAfter > 0 ? retryAfter * 1000 : base * 2 ** attempt);
    } catch (e) {
      if (e instanceof HttpError && !isRetryable(e.status)) throw e;
      lastErr = e;
      if (attempt === retries) break;
      await sleep(base * 2 ** attempt);
    }
  }
  throw lastErr;
}
