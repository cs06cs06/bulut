import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { loadBacklog, normalizeTopics, pickTopic, saveBacklog, slugify, titleKey, type Topic } from '../src/lib/backlog.ts';
import { normalizeScript, normalizeVisual, isPublicHttpUrl } from '../src/lib/script.ts';
import { costUsd } from '../src/lib/usage.ts';
import { buildSrt, buildTimeline, captionChunks, chapters, formatTimestamp, revealTimes } from '../src/media/timeline.ts';
import { parseSuggestions } from '../src/media/suggest.ts';
import { speakable } from '../src/media/tts.ts';
import { effectiveVisual } from '../src/media/render.ts';
import { mergeIdeas } from '../src/stages/ideas.ts';

const topic = (over: Partial<Topic>): Topic => ({ id: 'x', title: 'X', status: 'bekliyor', ...over });

test('slugify: Türkçe ve özel karakterler', () => {
  assert.equal(slugify('How to Use Notion AI (2026)!'), 'how-to-use-notion-ai-2026');
  assert.equal(slugify('Işık ve Gölge'), 'isik-ve-golge');
  assert.equal(slugify('!!!'), 'konu');
  const long = slugify("How to Use ChatGPT's New Interactive Answers (GPT-6 Intelligent UI Tutorial)");
  assert.ok(long.length <= 60 && !long.endsWith('intellige'), long);
  assert.equal(long, 'how-to-use-chatgpt-s-new-interactive-answers-gpt-6');
});

test('normalizeTopics: elle eklenen konuya kimlik ve durum verir, tekrarları ayırır', () => {
  const t = normalizeTopics([{ title: 'Canva AI tutorial', status: 'onaylı' }, { title: 'Canva AI tutorial' }, { foo: 1 }]);
  assert.equal(t.length, 2);
  assert.equal(t[0].id, 'canva-ai-tutorial');
  assert.equal(t[0].status, 'onaylı');
  assert.equal(t[1].id, 'canva-ai-tutorial-2');
  assert.equal(t[1].status, 'bekliyor');
});

test('pickTopic: yarıda kalan > onaylı > en yüksek puanlı bekleyen', () => {
  const list = [
    topic({ id: 'a', status: 'bekliyor', score: 5 }),
    topic({ id: 'b', status: 'bekliyor', score: 9 }),
    topic({ id: 'c', status: 'onaylı', score: 1 }),
  ];
  assert.equal(pickTopic(list, true)?.id, 'c');
  assert.equal(pickTopic([list[0], list[1]], true)?.id, 'b');
  assert.equal(pickTopic([list[0], list[1]], false), undefined);
  assert.equal(pickTopic([...list, topic({ id: 'd', status: 'üretiliyor' })], true)?.id, 'd');
  assert.equal(pickTopic(list, true, 'a')?.id, 'a');
  assert.equal(pickTopic([topic({ id: 'z', status: 'üretildi' })], true, 'z'), undefined);
});

test('backlog: kaydet/yükle açıklama başlığını korur', () => {
  const p = join(mkdtempSync(join(tmpdir(), 'yt-')), 'backlog.yaml');
  saveBacklog([topic({ id: 'a', title: 'A title', score: 7 })], p);
  assert.match(readFileSync(p, 'utf8'), /^# Konu listesi/);
  assert.equal(loadBacklog(p)[0].score, 7);
  saveBacklog([], p);
  assert.deepEqual(loadBacklog(p), []);
});

test('titleKey ve mergeIdeas: benzer başlıkları eler', () => {
  assert.equal(titleKey('How to Use Notion AI in 2026'), titleKey('Using Notion AI'));
  const existing = [topic({ id: 'notion-ai', title: 'How to use Notion AI' })];
  const merged = mergeIdeas(
    existing,
    [
      { title: 'Notion AI — how to use', query: 'q', tools: [], format: 'tutorial', angle: '', why: '', score: 9 },
      { title: 'Canva vs Adobe Express', query: 'q', tools: ['Canva'], format: 'comparison', angle: '', why: '', score: 14 },
      { title: 'Gamma app tutorial', query: 'q', tools: ['Gamma'], format: 'tutorial', angle: '', why: '', score: 6 },
    ],
    '2026-10-11',
  );
  assert.deepEqual(merged.map((m) => m.id), ['canva-vs-adobe-express', 'gamma-app-tutorial']);
  assert.equal(merged[0].score, 10); // 1–10 aralığına kırpılır
  assert.equal(merged[0].status, 'bekliyor');
});

test('isPublicHttpUrl: yerel ve geçersiz adresleri reddeder', () => {
  assert.ok(isPublicHttpUrl('https://www.notion.so/pricing'));
  assert.ok(!isPublicHttpUrl('http://localhost:3000'));
  assert.ok(!isPublicHttpUrl('http://192.168.1.2'));
  assert.ok(!isPublicHttpUrl('file:///etc/passwd'));
  assert.ok(!isPublicHttpUrl('not a url'));
});

test('normalizeVisual: kullanılamayan görseli karta çevirir', () => {
  assert.deepEqual(normalizeVisual({ type: 'browser', url: 'http://localhost' }, 'Fallback'), { type: 'title', heading: 'Fallback', sub: '' });
  assert.deepEqual(normalizeVisual({ type: 'bullets', items: [] , heading: 'H' }, 'F'), { type: 'title', heading: 'H', sub: '' });
  const b = normalizeVisual(
    { type: 'browser', url: 'https://gamma.app', steps: [{ action: 'click', target: '', caption: 'c' }, { action: 'zoom', target: 'Pricing', caption: '' }] },
    'F',
  );
  assert.equal(b.type, 'browser');
  if (b.type === 'browser') assert.deepEqual(b.steps.map((s) => s.action), ['show', 'show']);
  const c = normalizeVisual({ type: 'compare', heading: 'H', columns: ['A', 'B'], rows: [{ label: 'Price', values: ['1'] }] }, 'F');
  assert.deepEqual(c, { type: 'compare', heading: 'H', columns: ['A', 'B'], rows: [{ label: 'Price', values: ['1', ''] }] });
  const st = normalizeVisual({ type: 'steps', heading: 'H', steps: [{ action: 'none', text: 'Open settings', detail: 'Settings → API', target: '', caption: '' }] }, 'F');
  assert.deepEqual(st, { type: 'steps', heading: 'H', steps: [{ text: 'Open settings', detail: 'Settings → API' }] });
});

test('normalizeScript: kimlik verir, ilk bölümü ve kapanışı garanti eder', () => {
  const s = normalizeScript({
    title: 'T',
    format: 'tutorial',
    tools: ['Notion', ''],
    scenes: [
      { chapter: '', narration: 'Hook here.', visual: { type: 'title', heading: 'Hi' } },
      { chapter: 'Setup', narration: '  ', visual: { type: 'title' } },
      { chapter: 'Setup', narration: 'Step one.', visual: { type: 'callout', kind: 'odd', text: 'Tip' } },
      { chapter: '', narration: 'Bye.', visual: { type: 'bullets', heading: 'x', items: ['a'] } },
    ],
  });
  assert.deepEqual(s.scenes.map((x) => x.id), ['s01', 's02', 's03']);
  assert.equal(s.scenes[0].chapter, 'Intro');
  assert.deepEqual(s.scenes[1].visual, { type: 'callout', kind: 'tip', text: 'Tip' });
  assert.equal(s.scenes[2].visual.type, 'outro');
  assert.deepEqual(s.tools, ['Notion']);
  assert.throws(() => normalizeScript({ scenes: [] }), /çok kısa/);
});

test('buildTimeline: kareye hizalı, ardışık sahneler', () => {
  const tl = buildTimeline([{ id: 's01' }, { id: 's02' }], { s01: 2.0, s02: 3.01 }, { fps: 30, lead: 0.25, tail: 0.45 });
  assert.equal(tl[0].frames, 81); // ceil(2.7*30)
  assert.equal(tl[1].start, 81 / 30);
  assert.equal(tl[1].frames, Math.ceil(3.71 * 30));
  assert.throws(() => buildTimeline([{ id: 'x' }], {}, { fps: 30, lead: 0, tail: 0 }), /eksik/);
});

test('formatTimestamp', () => {
  assert.equal(formatTimestamp(0), '0:00');
  assert.equal(formatTimestamp(75.9), '1:15');
  assert.equal(formatTimestamp(3725), '1:02:05');
});

test('chapters: YouTube kurallarına uyar', () => {
  const scenes = [
    { id: 'a', chapter: 'Intro' },
    { id: 'b', chapter: 'Setup' },
    { id: 'c', chapter: 'Too soon' },
    { id: 'd', chapter: 'Pricing' },
    { id: 'e', chapter: '' },
  ];
  const tl = buildTimeline(scenes, { a: 20, b: 5, c: 30, d: 30, e: 20 }, { fps: 30, lead: 0, tail: 0 });
  const ch = chapters(scenes, tl);
  assert.deepEqual(ch.map((c) => c.title), ['Intro', 'Setup', 'Pricing']);
  assert.equal(ch[0].time, '0:00');
  assert.equal(ch[2].time, '0:55');
  // 3'ten az bölüm → boş
  assert.deepEqual(chapters(scenes.slice(0, 2), tl.slice(0, 2)), []);
});

test('captionChunks ve buildSrt', () => {
  const long = 'This is a long sentence that keeps going, and going, well past the usual caption width so it must be split up.';
  const chunks = captionChunks(`Short one. ${long}`);
  assert.equal(chunks[0], 'Short one.');
  assert.ok(chunks.slice(1).every((c) => c.length <= 84));
  assert.equal(chunks.slice(1).join(' '), long);

  const scenes = [{ id: 's01', narration: 'Hello there. General Kenobi.' }];
  const tl = buildTimeline(scenes, { s01: 2 }, { fps: 30, lead: 0.5, tail: 0.5 });
  const srt = buildSrt(scenes, tl);
  assert.match(srt, /^1\n00:00:00,500 --> 00:00:01,\d{3}\nHello there\.\n/);
  assert.match(srt, /2\n00:00:01,\d{3} --> 00:00:02,500\nGeneral Kenobi\./);
});

test('revealTimes: sesin içine eşit dağılır', () => {
  assert.deepEqual(revealTimes(0, { audioOffset: 0, audioDuration: 10 }), []);
  assert.deepEqual(revealTimes(1, { audioOffset: 1, audioDuration: 10 }), [2]);
  const r = revealTimes(3, { audioOffset: 0, audioDuration: 10 });
  assert.deepEqual(r.map((x) => Math.round(x * 100) / 100), [1, 4.75, 8.5]);
});

test('effectiveVisual: yakalanamayan sayfa metin kartına döner', () => {
  const scene = {
    id: 's01',
    chapter: '',
    narration: 'n',
    visual: { type: 'browser' as const, url: 'https://www.canva.com/pricing', steps: [{ action: 'show' as const, target: '', caption: 'Plans' }, { action: 'highlight' as const, target: 'Pro', caption: 'Pro plan' }] },
  };
  assert.deepEqual(effectiveVisual(scene, { sceneId: 's01', url: '', ok: false, shots: [] }), { type: 'bullets', heading: 'canva.com', items: ['Plans', 'Pro plan'] });
  assert.equal(effectiveVisual(scene, { sceneId: 's01', url: '', ok: true, shots: [] }).type, 'browser');
});

test('parseSuggestions ve speakable', () => {
  assert.deepEqual(parseSuggestions('["notion",["notion ai","notion tutorial"]]'), ['notion ai', 'notion tutorial']);
  assert.deepEqual(parseSuggestions('<html>'), []);
  assert.equal(speakable('Go to **Settings → API** & see https://x.com now'), 'Go to Settings , then API and see now');
});

test('costUsd: token ve web araması ücreti', () => {
  const prices = { m: { input: 4, output: 20, cache_write: 5, cache_read: 0.2 }, web_search_per_1000: 10 };
  const c = costUsd(prices as never, 'm', {
    input_tokens: 1_000_000,
    output_tokens: 100_000,
    cache_read_input_tokens: 0,
    server_tool_use: { web_search_requests: 10 },
  });
  assert.equal(Math.round(c * 1000) / 1000, 6.1);
});
