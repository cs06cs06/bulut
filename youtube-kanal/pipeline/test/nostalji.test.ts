// KANAL=nostalji ile çalışır (package.json → test).
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { AiClient, AskOptions } from '../src/ai/client.ts';
import { channelFormat, loadAiConfig, loadChannel } from '../src/lib/config.ts';
import { fitPrompts, normalizeListicle, type Script } from '../src/lib/script.ts';
import { findImageData, generateSceneImages, ImageRefusedError, styledPrompt, type ImageProvider } from '../src/media/images.ts';
import { clipFrames, overlayTimings } from '../src/media/photoscene.ts';
import { chapters, buildTimeline } from '../src/media/timeline.ts';
import { writeScript } from '../src/stages/write.ts';

const shape = { items: 25, images_per_item: 3, intro_images: 3, outro_images: 2 };

function rawListicle(items: number, wordsPerItem: number) {
  const w = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ') + '.';
  return {
    title: '25 Things Every Kid Did in the 1960s',
    intro: { narration: w(120), image_prompts: ['a', 'b', 'c', 'd'] },
    items: Array.from({ length: items }, (_, i) => ({
      title: i === 0 ? '#1. Riding in the Station Wagon' : `Item ${i + 1}`,
      narration: w(wordsPerItem),
      image_prompts: i === 1 ? [] : ['p1', 'p2'],
    })),
    outro: { narration: w(80), image_prompts: ['o1', 'o2', 'o3'] },
  };
}

test('kanal ayarı: nostalji listicle biçiminde ve görsel ayarları var', () => {
  const ch = loadChannel();
  assert.equal(channelFormat(ch), 'listicle');
  assert.ok(ch.images?.style.length);
  assert.equal(ch.thumbnail?.style, 'bar');
  assert.equal(ch.youtube.contains_synthetic_media, true);
});

test('fitPrompts: fazlasını atar, eksikse tekrarlar, boşsa yedeği kullanır', () => {
  assert.deepEqual(fitPrompts(['a', 'b', 'c', 'd'], 3, 'x'), ['a', 'b', 'c']);
  assert.deepEqual(fitPrompts(['a', 'b'], 3, 'x'), ['a', 'b', 'a']);
  assert.deepEqual(fitPrompts([], 2, 'x'), ['x', 'x']);
});

test('normalizeListicle: giriş + maddeler + kapanış, numaralar ve bölümler', () => {
  const s = normalizeListicle(rawListicle(25, 150), shape);
  assert.equal(s.format, 'listicle');
  assert.equal(s.scenes.length, 27);
  assert.equal(s.scenes[0].chapter, 'Intro');
  const first = s.scenes[1].visual;
  assert.equal(first.type, 'photos');
  if (first.type === 'photos') {
    assert.equal(first.number, 1);
    assert.equal(first.heading, 'Riding in the Station Wagon'); // "#1." öneki temizlenir
    assert.equal(first.prompts.length, 3);
  }
  assert.equal(s.scenes[1].chapter, '1. Riding in the Station Wagon');
  const second = s.scenes[2].visual;
  if (second.type === 'photos') assert.deepEqual(second.prompts, ['Item 2', 'Item 2', 'Item 2']); // tarif yoksa başlık
  const outro = s.scenes[26].visual;
  if (outro.type === 'photos') assert.equal(outro.number, 0);
  assert.equal(s.scenes[26].chapter, '');
  assert.throws(() => normalizeListicle(rawListicle(3, 100), shape), /çok kısa/);
});

test('bölümler: her madde ayrı bölüm (YouTube kurallarıyla)', () => {
  const s = normalizeListicle(rawListicle(25, 150), shape);
  const durations = Object.fromEntries(s.scenes.map((sc) => [sc.id, 60]));
  const tl = buildTimeline(s.scenes, durations, { fps: 25, lead: 0.4, tail: 0.8 });
  const ch = chapters(s.scenes, tl);
  assert.equal(ch.length, 26);
  assert.equal(ch[0].time, '0:00');
  assert.equal(ch[1].title, '1. Riding in the Station Wagon');
});

class FakeAi implements AiClient {
  calls: AskOptions[] = [];
  constructor(private replies: string[]) {}
  async ask(opts: AskOptions) {
    this.calls.push(opts);
    return { text: this.replies.shift() ?? '{}', usage: { input_tokens: 10, output_tokens: 10 }, model: 'claude-opus-5-5' };
  }
}

test('writeScript (listicle): listicle şemasıyla ister, madde ve görsel sayısını talimata yazar', async () => {
  const ai = new FakeAi([JSON.stringify(rawListicle(25, 170))]);
  const ch = loadChannel();
  const res = await writeScript(ai, ch, loadAiConfig(), { id: 't', title: 'T', status: 'onaylı' }, '# notes', []);
  assert.equal(ai.calls.length, 1);
  const schema = ai.calls[0].schema as { required: string[] };
  assert.deepEqual(schema.required, ['title', 'intro', 'items', 'outro']);
  assert.match(ai.calls[0].system, /Tam olarak 25 madde/);
  assert.match(ai.calls[0].system, /Giriş için 3, her madde için 3, kapanış için 2 tarif/);
  assert.equal(res.value.scenes.length, 27);
});

test('findImageData: Interactions ve generateContent yanıt biçimleri', () => {
  const b64 = 'A'.repeat(200);
  assert.equal(findImageData({ output_image: { type: 'image', mime_type: 'image/jpeg', data: b64 } }), b64);
  assert.equal(findImageData({ steps: [{ type: 'model_output', content: [{ type: 'text', text: 'hi' }, { type: 'image', data: b64 }] }] }), b64);
  assert.equal(findImageData({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: b64 } }] } }] }), b64);
  assert.equal(findImageData({ candidates: [{ content: { parts: [{ text: 'refused' }] } }] }), null);
});

test('generateSceneImages: reddedilen görselin yerine aynı sahnenin görseli; önbellek', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'img-'));
  const calls: string[] = [];
  const provider: ImageProvider = {
    name: 'fake',
    async generate(prompt, out) {
      calls.push(prompt);
      if (prompt.startsWith('bad')) throw new ImageRefusedError('blocked');
      writeFileSync(out, 'jpg');
    },
  };
  const photos = (number: number, prompts: string[]) => ({ type: 'photos' as const, number, heading: 'h', prompts });
  const script: Script = {
    title: 't',
    format: 'listicle',
    tools: [],
    scenes: [
      { id: 's01', chapter: 'Intro', narration: 'n', visual: photos(0, ['good one', 'bad two']) },
      { id: 's02', chapter: '1. x', narration: 'n', visual: photos(1, ['bad only']) },
    ],
  };
  const res = await generateSceneImages(script, provider, { style: 'STYLE', concurrency: 2 }, dir);
  assert.equal(res.generated, 1);
  assert.equal(res.failed, 2);
  assert.equal(res.files.s01[0], res.files.s01[1]); // reddedilen yerine iyi olan
  assert.equal(res.files.s02[0], res.files.s01[1]); // sahnede hiç yoksa önceki sahnenin son görseli
  assert.ok(calls.every((c) => c.endsWith('STYLE')));
  assert.equal(styledPrompt('A kitchen', 'Film look.'), 'A kitchen. Film look.');
  // ikinci çalıştırmada üretilmiş görsel yeniden istenmez
  calls.length = 0;
  await generateSceneImages(script, provider, { style: 'STYLE', concurrency: 2 }, dir);
  assert.ok(!calls.some((c) => c.startsWith('good')));
  assert.ok(JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')).s01);
});

test('generateSceneImages: hiç görsel üretilemezse anlaşılır hata', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'img-'));
  const provider: ImageProvider = { name: 'x', generate: async () => { throw new Error('HTTP 403 API key invalid'); } };
  const script: Script = {
    title: 't', format: 'listicle', tools: [],
    scenes: [{ id: 's01', chapter: '', narration: 'n', visual: { type: 'photos', number: 0, heading: '', prompts: ['a', 'b', 'c', 'd', 'e'] } }],
  };
  await assert.rejects(generateSceneImages(script, provider, { style: '', concurrency: 1 }, dir), /Hiç görsel üretilemedi: HTTP 403/);
});

test('clipFrames: geçiş örtüşmesi düşülünce toplam kare sayısı korunur', () => {
  for (const [frames, n, fade] of [[1500, 3, 25], [301, 4, 7], [100, 1, 0], [999, 5, 20]]) {
    const c = clipFrames(frames, n, fade);
    assert.equal(c.length, n);
    assert.equal(c.reduce((a, b) => a + b, 0) - (n - 1) * fade, frames);
  }
});

test('overlayTimings: madde şeridi, köşe numarası, açılış başlığı, abone çağrısı', () => {
  const base = { videoTitle: 'T', duration: 60 };
  const item = overlayTimings({ ...base, visual: { type: 'photos', number: 3, heading: 'x' }, first: false, last: false });
  assert.deepEqual(item.map((o) => o.kind), ['lt', 'chip']);
  assert.equal(item[0].out, 7);
  assert.equal(item[1].in, 7);
  const intro = overlayTimings({ ...base, visual: { type: 'photos', number: 0, heading: '' }, first: true, last: false });
  assert.deepEqual(intro.map((o) => o.kind), ['title']);
  const outro = overlayTimings({ ...base, visual: { type: 'photos', number: 0, heading: '' }, first: false, last: true });
  assert.deepEqual(outro.map((o) => o.kind), ['sub']);
  assert.equal(outro[0].in, 53);
});
