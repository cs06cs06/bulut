// Meshy AI REST API istemcisi (https://docs.meshy.ai). Node 18+ yerleşik fetch kullanır.

const RETRYABLE = new Set([429, 500, 502, 503, 504]);

export class MeshyError extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export class Meshy {
  constructor({ apiKey, baseUrl = 'https://api.meshy.ai', log = () => {} }) {
    if (!apiKey) throw new Error('MESHY_API_KEY tanımlı değil');
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.log = log;
  }

  async request(method, path, body) {
    for (let attempt = 0; ; attempt++) {
      let res;
      try {
        res = await fetch(this.baseUrl + path, {
          method,
          headers: { Authorization: `Bearer ${this.apiKey}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
          body: body ? JSON.stringify(body) : undefined,
        });
      } catch (err) {
        if (attempt < 5) {
          await sleep(backoff(attempt));
          continue;
        }
        throw err;
      }
      const text = await res.text();
      let data;
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { raw: text };
      }
      if (res.ok) return data;
      if (RETRYABLE.has(res.status) && attempt < 6) {
        const wait = backoff(attempt, res.headers.get('retry-after'));
        this.log(`  API ${res.status}, ${Math.round(wait / 1000)} sn sonra tekrar denenecek`);
        await sleep(wait);
        continue;
      }
      const msg = data?.message || data?.error || text || res.statusText;
      throw new MeshyError(`${method} ${path} → ${res.status}: ${msg}`, res.status, data);
    }
  }

  balance() {
    return this.request('GET', '/openapi/v1/balance');
  }

  createPreview(params) {
    return this.request('POST', '/openapi/v2/text-to-3d', { mode: 'preview', ...params });
  }

  createRefine(params) {
    return this.request('POST', '/openapi/v2/text-to-3d', { mode: 'refine', ...params });
  }

  getTextTo3d(id) {
    return this.request('GET', `/openapi/v2/text-to-3d/${id}`);
  }

  createRig(params) {
    return this.request('POST', '/openapi/v1/rigging', params);
  }

  getRig(id) {
    return this.request('GET', `/openapi/v1/rigging/${id}`);
  }

  createAnimation(params) {
    return this.request('POST', '/openapi/v1/animations', params);
  }

  getAnimation(id) {
    return this.request('GET', `/openapi/v1/animations/${id}`);
  }

  // Görev bitene kadar bekle; bitmiş görev nesnesini döndürür
  async wait(getter, id, { label, pollSeconds = 5, timeoutMinutes = 30 } = {}) {
    const started = Date.now();
    let lastProgress = -1;
    for (;;) {
      const task = await getter.call(this, id);
      const status = task.status;
      if (status === 'SUCCEEDED') return task;
      if (status === 'FAILED' || status === 'CANCELED' || status === 'EXPIRED') {
        const reason = task.task_error?.message || JSON.stringify(task.task_error || {});
        throw new MeshyError(`${label}: görev ${status} (${reason})`, 0, task);
      }
      const p = Math.floor((task.progress ?? 0) / 25) * 25;
      if (p !== lastProgress) {
        this.log(`  ${label}: ${status.toLowerCase()} %${task.progress ?? 0}`);
        lastProgress = p;
      }
      if (Date.now() - started > timeoutMinutes * 60000) throw new MeshyError(`${label}: zaman aşımı`, 0, task);
      await sleep(pollSeconds * 1000);
    }
  }
}

export async function download(url, retries = 4) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      if (attempt >= retries) throw new Error(`İndirilemedi (${url.split('?')[0]}): ${err.message}`);
      await sleep(backoff(attempt));
    }
  }
}

function backoff(attempt, retryAfter) {
  const ra = Number(retryAfter);
  if (ra > 0) return ra * 1000;
  return Math.min(60000, 2000 * 2 ** attempt);
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
