'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const ig = require('../lib/instagram');

test('kullanıcı adı ve bağlantılar çözümlenir', () => {
  assert.equal(ig.normalizeUsername('@NASA'), 'nasa');
  assert.equal(ig.normalizeUsername('https://www.instagram.com/natgeo/?hl=tr'), 'natgeo');
  assert.equal(ig.normalizeUsername(' bbc.news_1 '), 'bbc.news_1');
  assert.throws(() => ig.normalizeUsername('kötü isim!'), (e) => e.code === 'bad_request');
  assert.throws(() => ig.normalizeUsername(''), (e) => e.code === 'bad_request');
});

test('embed sayfasındaki contextJSON çıkarılır', () => {
  const ctx = { context: { username: 'a"b', posts_count: 3 }, gql_data: null };
  const html = `<script>x({"contextJSON":${JSON.stringify(JSON.stringify(ctx))},"other":1})</script>`;
  assert.deepEqual(ig.extractContextJson(html), ctx);
  assert.equal(ig.extractContextJson('{"contextJSON":null}'), null);
  assert.equal(ig.extractContextJson('<html></html>'), null);
});

test('GraphQL gönderisi normalleştirilir (carousel + video)', () => {
  const p = ig.normalizeGraphPost({
    __typename: 'GraphSidecar',
    id: '1',
    shortcode: 'ABCDE',
    dimensions: { width: 1080, height: 1350 },
    display_url: 'https://x.cdninstagram.com/full.jpg',
    display_resources: [
      { config_width: 640, src: 'https://x.cdninstagram.com/640.jpg' },
      { config_width: 1080, src: 'https://x.cdninstagram.com/1080.jpg' },
    ],
    edge_media_to_caption: { edges: [{ node: { text: 'merhaba' } }] },
    edge_liked_by: { count: 5 },
    taken_at_timestamp: 100,
    edge_sidecar_to_children: {
      edges: [
        { node: { id: '2', is_video: false, display_url: 'https://x.cdninstagram.com/a.jpg' } },
        { node: { id: '3', is_video: true, display_url: 'https://x.cdninstagram.com/b.jpg' } },
      ],
    },
  });
  assert.equal(p.type, 'carousel');
  assert.equal(p.thumb, 'https://x.cdninstagram.com/640.jpg');
  assert.equal(p.caption, 'merhaba');
  assert.equal(p.likes, 5);
  assert.equal(p.items.length, 2);
  assert.equal(p.items[1].type, 'video');
  assert.equal(p.complete, false, 'video adresi olmayan carousel detay ister');

  const v = ig.normalizeGraphPost({ __typename: 'GraphVideo', id: '9', shortcode: 'VVVVV', is_video: true, video_url: 'https://x.cdninstagram.com/v.mp4', product_type: 'clips' });
  assert.equal(v.type, 'video');
  assert.equal(v.isReel, true);
  assert.equal(v.items[0].videoUrl, 'https://x.cdninstagram.com/v.mp4');
  assert.equal(v.complete, true);
});

test('mobil API öğesi normalleştirilir', () => {
  const p = ig.normalizeApiPost({
    pk: '42',
    code: 'CODE1',
    taken_at: 200,
    like_count: 7,
    caption: { text: 'selam' },
    carousel_media: [
      { pk: '43', media_type: 1, image_versions2: { candidates: [{ width: 1080, url: 'big' }, { width: 480, url: 'small' }] } },
      { pk: '44', media_type: 2, image_versions2: { candidates: [{ width: 720, url: 'poster' }] }, video_versions: [{ width: 720, url: 'vid' }] },
    ],
  });
  assert.equal(p.type, 'carousel');
  assert.equal(p.thumb, 'small');
  assert.equal(p.items[0].url, 'big');
  assert.equal(p.items[1].videoUrl, 'vid');
  assert.equal(p.timestamp, 200);
  assert.equal(p.complete, true);
});

test('medya vekili yalnızca Instagram CDN adreslerine izin verir', async () => {
  const server = require('../server');
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const bad = await fetch(`${base}/media?u=${encodeURIComponent('https://evil.example.com/x.jpg')}`);
    assert.equal(bad.status, 403);
    const tricky = await fetch(`${base}/media?u=${encodeURIComponent('https://cdninstagram.com.evil.com/x.jpg')}`);
    assert.equal(tricky.status, 403);
    const http = await fetch(`${base}/media?u=${encodeURIComponent('http://scontent.cdninstagram.com/x.jpg')}`);
    assert.equal(http.status, 403);
    const badUser = await fetch(`${base}/api/profile/${encodeURIComponent('bad name!')}`);
    assert.equal(badUser.status, 400);
    const index = await fetch(`${base}/u/whatever`);
    assert.equal(index.status, 200);
    const trav = await fetch(`${base}/..%2fserver.js`);
    assert.notEqual(trav.status, 200);
  } finally {
    server.close();
  }
});
