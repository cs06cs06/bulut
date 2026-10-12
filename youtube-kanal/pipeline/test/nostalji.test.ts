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
import { overlayTimings, planShots, splitEven } from '../src/media/photoscene.ts';
import { buildJcutTimeline, chapters } from '../src/media/timeline.ts';
import { alignSentences, assColor, buildAss, captionEvents, chunkSentence, highlight, parseSilences, phraseTime, windowEvents } from '../src/media/align.ts';
import { findAudioData, ttsFromConfig } from '../src/media/tts.ts';
import { writeScript } from '../src/stages/write.ts';

const shape = { items: 15, images_per_item: 3, intro_images: 4, outro_images: 2 };

function rawListicle(items: number, wordsPerItem: number) {
  const w = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ') + '.';
  return {
    title: '15 Things Every Kid Did in the 1960s',
    hook: { narration: 'Number one would never fly today. ' + w(30), image_prompts: ['a', 'b', 'c', 'd', 'e'] },
    items: Array.from({ length: items }, (_, i) => ({
      title: i === 0 ? '#15. Riding in the Station Wagon' : `Item ${i + 1}`,
      narration: `There were no seatbelts at all. ${w(wordsPerItem)}`,
      image_prompts: i === 1 ? [] : ['p1', 'p2'],
      keywords: ['seatbelts', 'wagon'],
      punch: i === 0 ? 'no seatbelts at all' : 'not in the narration',
    })),
    subscribe: { after_number: 8, line: 'If this brought back a smile, subscribe for another trip back every week.' },
    outro: { narration: w(60), image_prompts: ['o1', 'o2', 'o3'], next_video: 'Summer in the 60s' },
    shorts: [
      { title: 'Short one', hook_text: 'Did you do this?', narration: w(70), number: 3 },
      { title: 'Bad short', hook_text: 'x', narration: w(70), number: 99 },
    ],
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

test('normalizeListicle v2: kanca, geri sayım, abone anı, kapanış, Shorts', () => {
  const s = normalizeListicle(rawListicle(15, 90), shape);
  assert.equal(s.format, 'listicle');
  assert.equal(s.scenes.length, 17);
  assert.equal(s.scenes[0].chapter, 'Intro');
  assert.equal(s.scenes[0].cadence, 2);
  const first = s.scenes[1];
  assert.equal(first.visual.type, 'photos');
  if (first.visual.type === 'photos') {
    assert.equal(first.visual.number, 15); // geri sayım
    assert.equal(first.visual.heading, 'Riding in the Station Wagon');
    assert.equal(first.visual.prompts.length, 3);
  }
  assert.equal(first.chapter, '#15 Riding in the Station Wagon');
  assert.equal(first.punch, 'no seatbelts at all');
  assert.equal(s.scenes[2].punch, undefined); // anlatımda geçmeyen vurgu atılır
  assert.deepEqual(first.keywords, ['seatbelts', 'wagon']);
  const last = s.scenes[15].visual;
  if (last.type === 'photos') assert.equal(last.number, 1);
  // abone çağrısı #8'in sonuna eklenir
  const sub = s.scenes.filter((x) => x.subscribe);
  assert.equal(sub.length, 1);
  assert.ok(sub[0].narration.endsWith('every week.'));
  assert.equal(sub[0].visual.type === 'photos' && sub[0].visual.number, 8);
  assert.equal(s.scenes[16].chapter, 'Up next');
  assert.equal(s.next_video, 'Summer in the 60s');
  assert.equal(s.shorts?.length, 1); // geçersiz madde numaralı Shorts atılır
  assert.throws(() => normalizeListicle(rawListicle(3, 100), shape), /çok kısa/);
});

test('abone çağrısı: geçersiz numarada videonun ~%45\'ine, en erken 3. maddeye', () => {
  const raw = rawListicle(15, 80);
  raw.subscribe.after_number = 15; // ilk madde → en erken 3. sıraya kayar
  const s = normalizeListicle(raw, shape);
  const idx = s.scenes.findIndex((x) => x.subscribe);
  assert.equal(idx, 3); // 0: kanca, 1-2: ilk iki madde
  raw.subscribe.after_number = 0;
  const s2 = normalizeListicle(raw, shape);
  assert.equal(s2.scenes.findIndex((x) => x.subscribe), 7);
});

test('J-cut zaman çizelgesi: ses görüntüden önce başlar, kesmeler kareye hizalı', () => {
  const scenes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const tl = buildJcutTimeline(scenes, { a: 10, b: 20, c: 5 }, { fps: 25, lead: 0.4, gap: 0.5, jcut: 0.6, tail: 1 });
  assert.equal(tl[0].start, 0);
  assert.equal(tl[0].audioStart, 0.4);
  assert.equal(tl[1].audioStart, 10.9);
  assert.ok(Math.abs(tl[1].start - 11.5) <= 0.04); // görüntü sesten ~0,6 sn sonra geçer (kareye yuvarlı)
  assert.ok(Math.abs(tl[1].audioOffset - (tl[1].audioStart - tl[1].start)) < 1e-9 && tl[1].audioOffset < -0.55);
  assert.equal(tl[2].audioStart, 31.4);
  const end = tl[2].start + tl[2].duration;
  assert.ok(end >= 31.4 + 5 + 1 - 1e-9 && end < 31.4 + 5 + 1 + 0.05);
  tl.forEach((t) => assert.equal(t.frames, Math.round(t.duration * 25)));
});

test('bölümler: her madde ayrı bölüm', () => {
  const s = normalizeListicle(rawListicle(15, 90), shape);
  const durations = Object.fromEntries(s.scenes.map((sc) => [sc.id, 40]));
  const tl = buildJcutTimeline(s.scenes, durations, { fps: 25, lead: 0.4, gap: 0.5, jcut: 0.6, tail: 1 });
  const ch = chapters(s.scenes, tl);
  assert.equal(ch[0].time, '0:00');
  assert.equal(ch[1].title, '#15 Riding in the Station Wagon');
  assert.equal(ch.length, 17);
});

test('cümle hizalama: duraklamalara oturur, bulunamazsa orana göre', () => {
  const sentences = ['First short one.', 'A much longer second sentence goes here.', 'Third.'];
  const sil = [{ start: 0, end: 0.3 }, { start: 1.9, end: 2.2 }, { start: 6.1, end: 6.4 }, { start: 8, end: 8.4 }];
  const st = alignSentences(sentences, sil, 8.4);
  assert.deepEqual(st, [0.3, 2.2, 6.4]);
  // duraklama yoksa karakter oranı
  const st2 = alignSentences(sentences, [], 10);
  assert.equal(st2[0], 0);
  assert.ok(st2[1] > 2 && st2[1] < 3.5);
  // sessiz deneme sesi: duraklamalara güvenilmez
  const st3 = alignSentences(sentences, [{ start: 0, end: 10 }], 10);
  assert.equal(st3[0], 0);
  assert.deepEqual(parseSilences('[silencedetect] silence_start: 1.5\n[silencedetect] silence_end: 1.9 | silence_duration: 0.4'), [{ start: 1.5, end: 1.9 }]);
});

test('altyazı: kısa parçalar, mutlak zamanlar, vurgu ifadesinin zamanı', () => {
  assert.deepEqual(chunkSentence('We piled into the very back of the station wagon.'), ['We piled into the very back', 'of the station wagon.']);
  assert.deepEqual(chunkSentence('Warm at first, then ice cold.'), ['Warm at first,', 'then ice cold.']);
  const ev = captionEvents('One two three. Four five six seven.', 10, 4, [0, 1.5]);
  assert.equal(ev[0].start, 10);
  assert.ok(ev[1].start >= 11.5 - 1e-9);
  assert.ok(ev.every((e) => e.end > e.start));
  const t = phraseTime('One two three. Four five six seven.', 'six seven', [0, 1.5], 4);
  assert.ok(t !== null && t > 1.5 && t < 4);
  assert.equal(phraseTime('abc.', 'zzz', [0], 1), null);
});

test('ASS: renk dönüşümü, anahtar kelime vurgusu, pencereleme', () => {
  assert.equal(assColor('#FFB703'), '&H03B7FF&');
  assert.equal(highlight('We loved the station wagon', ['station wagon'], '&H03B7FF&'), 'We loved the {\\c&H03B7FF&}station wagon{\\c&HFFFFFF&}');
  assert.equal(highlight('Wagons rolled', ['wagon'], '&H0&'), 'Wagons rolled'); // kelime sınırı
  const w = windowEvents([{ start: 9, end: 11, text: 'a' }, { start: 12, end: 13, text: 'b' }, { start: 30, end: 31, text: 'c' }], 10, 20);
  assert.deepEqual(w, [{ start: 0, end: 1, text: 'a' }, { start: 2, end: 3, text: 'b' }]);
  const ass = buildAss([{ start: 0, end: 1.5, text: 'Hi' }], { width: 1920, height: 1080, fontSize: 66, marginV: 60, alignment: 2 });
  assert.match(ass, /PlayResX: 1920/);
  assert.match(ass, /Dialogue: 0,0:00:00\.00,0:00:01\.50,Main,/);
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
  const ai = new FakeAi([JSON.stringify(rawListicle(15, 100))]);
  const ch = loadChannel();
  const res = await writeScript(ai, ch, loadAiConfig(), { id: 't', title: 'T', status: 'onaylı' }, '# notes', []);
  assert.equal(ai.calls.length, 1);
  const schema = ai.calls[0].schema as { required: string[] };
  assert.deepEqual(schema.required, ['title', 'hook', 'items', 'subscribe', 'outro', 'shorts']);
  assert.match(ai.calls[0].system, /Tam olarak 15 madde/);
  assert.match(ai.calls[0].system, new RegExp(`Her madde için ${ch.listicle!.images_per_item}, kapanış için 2 tarif`));
  assert.match(ai.calls[0].system, /Kanca görselleri \(4 tarif\)/);
  assert.equal(res.value.scenes.length, 17);
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

test('çekim planı: ~5 sn\'de bir kadraj, toplam kare korunur, her görsel geniş kadrajla başlar', () => {
  const shots = planShots({ frames: 1000, fps: 25, images: 3, cadence: 5, seed: 1 });
  assert.equal(shots.reduce((a, s) => a + s.frames, 0), 1000);
  assert.equal(shots.length, 8); // 40 sn / 5
  assert.deepEqual(shots.map((s) => s.image), [0, 0, 0, 1, 1, 1, 2, 2]);
  assert.equal(shots[0].framing.z0, 1.03);
  assert.equal(shots[3].framing.z0, 1.03);
  assert.ok(shots[1].framing.z0 > 1.3); // yakın kadraj
  assert.deepEqual(splitEven(10, 3), [4, 3, 3]);
  // kanca: 2 sn'de bir
  assert.equal(planShots({ frames: 300, fps: 25, images: 4, cadence: 2, seed: 2 }).length, 6);
});

test('punch-in: vurgu anında aynı kadraj ani yakınlaşır', () => {
  const plain = planShots({ frames: 1000, fps: 25, images: 3, cadence: 5, seed: 1 });
  const shots = planShots({ frames: 1000, fps: 25, images: 3, cadence: 5, seed: 1, punchAt: 7.5, punchZoom: 1.2 });
  assert.equal(shots.reduce((a, s) => a + s.frames, 0), 1000);
  assert.equal(shots.length, plain.length + 1); // kadraj ikiye bölündü
  const i = shots.findIndex((s) => s.punch);
  assert.equal(shots[i].image, shots[i - 1].image);
  assert.ok(Math.abs(shots[i].framing.z0 / shots[i - 1].framing.z1 - 1.2) < 1e-6);
  assert.equal(shots.slice(0, i).reduce((a, s) => a + s.frames, 0), Math.round(7.5 * 25));
});

test('katmanlar: rozet, köşe numarası, başlık, abone animasyonu, bitiş ekranı', () => {
  const base = { videoTitle: 'T', duration: 40 };
  const item = overlayTimings({ ...base, visual: { type: 'photos', number: 3, heading: 'x' }, first: false, last: false, subscribeAt: 30 });
  assert.deepEqual(item.map((o) => o.kind), ['badge', 'chip', 'sub1', 'sub2']);
  assert.equal(item[0].out, 4.5);
  assert.equal(item[2].in, 30);
  assert.equal(item[3].in, 31.4);
  const intro = overlayTimings({ ...base, duration: 12, visual: { type: 'photos', number: 0, heading: '' }, first: true, last: false });
  assert.deepEqual(intro.map((o) => o.kind), ['title']);
  assert.equal(intro[0].in, 8);
  const outro = overlayTimings({ ...base, visual: { type: 'photos', number: 0, heading: '' }, first: false, last: true, endScreen: 20 });
  assert.deepEqual(outro.map((o) => o.kind), ['end']);
  assert.equal(outro[0].in, 20);
});

test('Google seslendirme: ayar ve yanıttan ses verisini okuma', () => {
  const ch = loadChannel();
  assert.equal(ch.voice.provider, 'google');
  assert.throws(() => ttsFromConfig(ch, {}), /GEMINI_API_KEY/);
  assert.equal(ttsFromConfig(ch, { GEMINI_API_KEY: 'x' }).name, 'google');
  const b64 = 'U'.repeat(300);
  assert.equal(findAudioData({ steps: [{ type: 'thought', signature: 'z'.repeat(500) }, { type: 'model_output', content: [{ type: 'audio', mime_type: 'audio/wav', data: b64 }] }] }), b64);
  assert.equal(findAudioData({ steps: [{ content: [{ type: 'text', text: 'no' }] }] }), null);
});
