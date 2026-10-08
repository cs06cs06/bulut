import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { fetchWithRetry, HttpError } from '../src/lib/http.ts';

async function serve(responses: [number, string][]) {
  let i = 0;
  const server = createServer((_req, res) => {
    const [status, body] = responses[Math.min(i++, responses.length - 1)];
    res.writeHead(status).end(body);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as { port: number };
  return { url: `http://127.0.0.1:${port}/`, calls: () => i, close: () => server.close() };
}

test('geçici hatada yeniden dener', async () => {
  const s = await serve([[503, 'busy'], [200, 'ok']]);
  const res = await fetchWithRetry(s.url, {}, { baseDelayMs: 1 });
  assert.equal(await res.text(), 'ok');
  assert.equal(s.calls(), 2);
  s.close();
});

test('kalıcı hatada (404) hemen vazgeçer', async () => {
  const s = await serve([[404, 'nope']]);
  await assert.rejects(fetchWithRetry(s.url, {}, { baseDelayMs: 1 }), HttpError);
  assert.equal(s.calls(), 1);
  s.close();
});

test('retryIf ile NCBI zaman aşımı (400) yeniden denenir', async () => {
  const s = await serve([[400, '<ERROR>Empty Response. Status: Timeout</ERROR>'], [200, 'ok']]);
  const res = await fetchWithRetry(s.url, {}, { baseDelayMs: 1, retryIf: (st, b) => st === 400 && /timeout/i.test(b) });
  assert.equal(await res.text(), 'ok');
  s.close();
});
