import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AiClient, AskOptions } from '../src/ai/client.ts';
import { loadAiConfig, loadChannel, type AffiliateLink } from '../src/lib/config.ts';
import type { Script } from '../src/lib/script.ts';
import { buildDescription, matchAffiliates } from '../src/stages/describe.ts';
import { limitTags, writeMetadata, writeScript } from '../src/stages/write.ts';

class FakeAi implements AiClient {
  calls: AskOptions[] = [];
  constructor(private replies: string[]) {}
  async ask(opts: AskOptions) {
    this.calls.push(opts);
    const text = this.replies.shift() ?? '{}';
    return { text, usage: { input_tokens: 1000, output_tokens: 1000 }, model: 'claude-opus-5-5' };
  }
}

const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ') + '.';

function rawScript(wordsPerScene: number) {
  const blank = { heading: '', sub: '', items: [], url: '', steps: [], columns: [], rows: [], language: '', code: '', kind: '', text: '', cta: '' };
  return JSON.stringify({
    title: 'How to use Notion AI',
    format: 'tutorial',
    tools: ['Notion'],
    scenes: [
      { chapter: 'Intro', narration: words(wordsPerScene), visual: { ...blank, type: 'title', heading: 'Notion AI' } },
      { chapter: 'Setup', narration: words(wordsPerScene), visual: { ...blank, type: 'bullets', heading: 'Setup', items: ['One', 'Two'] } },
      { chapter: '', narration: words(wordsPerScene), visual: { ...blank, type: 'outro', heading: 'Done', cta: 'Links below' } },
    ],
  });
}

test('writeScript: kısa taslakta bir kez geri bildirimle yeniden yazdırır', async () => {
  const channel = loadChannel();
  const aiCfg = loadAiConfig();
  const min = Math.round(channel.video.min_minutes * channel.video.words_per_minute);
  const ai = new FakeAi([rawScript(10), rawScript(Math.ceil(min / 3) + 5)]);
  const res = await writeScript(ai, channel, aiCfg, { id: 't', title: 'Notion AI', status: 'onaylı' }, '# notes', []);
  assert.equal(ai.calls.length, 2);
  assert.match(ai.calls[1].user, /Revision needed/);
  assert.ok(ai.calls[0].schema, 'senaryo yapılandırılmış çıktıyla istenir');
  assert.ok(!ai.calls[0].web);
  assert.equal(res.value.scenes.length, 3);
  assert.ok(res.cost > 0);
  assert.match(ai.calls[0].system, new RegExp(`${Math.round(channel.video.target_minutes * channel.video.words_per_minute)} kelime`));
});

test('writeMetadata: başlık yoksa senaryo başlığını kullanır, hashtagleri süzer', async () => {
  const ai = new FakeAi([
    JSON.stringify({ titles: [], description_intro: ' Intro ', tags: ['notion ai', 'Notion AI', 'x'], thumbnail_text: '', thumbnail_badge: 'NEW', hashtags: ['#notion', 'bad tag', '#ai'] }),
  ]);
  const script: Script = { title: 'Script title', format: 'tutorial', tools: ['Notion'], scenes: [] };
  const res = await writeMetadata(ai, loadChannel(), loadAiConfig(), { id: 't', title: 'Topic', status: 'onaylı' }, script);
  assert.deepEqual(res.value.titles, ['Script title']);
  assert.equal(res.value.thumbnail_text, 'Notion');
  assert.deepEqual(res.value.hashtags, ['#notion', '#ai']);
  assert.equal(res.value.tags.filter((t) => t.toLowerCase() === 'notion ai').length, 1);
});

test('limitTags: tekrarları atar, karakter sınırına uyar', () => {
  const tags = limitTags(['a b', 'A B', 'c<d>', ...Array.from({ length: 100 }, (_, i) => `tag number ${i}`)]);
  assert.equal(tags[0], 'a b');
  assert.equal(tags[1], 'cd');
  assert.ok(tags.join(',').length <= 500);
});

const LINKS: AffiliateLink[] = [
  { name: 'Notion', aliases: ['Notion AI'], url: 'https://notion.example/ref', affiliate: true },
  { name: 'Make', aliases: ['Make.com'], url: 'https://make.example', affiliate: false },
  { name: 'Canva', url: 'https://canva.example' },
];

const SCRIPT: Script = {
  title: 't',
  format: 'tutorial',
  tools: [],
  scenes: [{ id: 's01', chapter: 'Intro', narration: 'Open Notion AI and make a page. Then try Make.com.', visual: { type: 'title', heading: 'h', sub: '' } }],
};

test('matchAffiliates: kelime sınırına göre eşleşir ("make a page" Make değildir, Make.com eşleşir)', () => {
  assert.deepEqual(matchAffiliates(SCRIPT, LINKS).map((l) => l.name), ['Notion', 'Make']);
  const noMake: Script = { ...SCRIPT, scenes: [{ ...SCRIPT.scenes[0], narration: 'Open Notion and make a page.' }] };
  assert.deepEqual(matchAffiliates(noMake, LINKS).map((l) => l.name), ['Notion']);
});

test('buildDescription: bağlantılar, bölümler ve affiliate beyanı', () => {
  const channel = loadChannel();
  const meta = { titles: ['T'], description_intro: 'Intro text <b>', tags: [], thumbnail_text: '', thumbnail_badge: '', hashtags: ['#ai'] };
  const d = buildDescription({ channel, meta, script: SCRIPT, links: LINKS, chapters: [{ time: '0:00', title: 'Intro' }, { time: '1:10', title: 'Setup' }, { time: '2:30', title: 'Tips' }] });
  assert.match(d, /^Intro text b/);
  assert.match(d, /• Notion: https:\/\/notion\.example\/ref/);
  assert.match(d, /0:00 Intro\n1:10 Setup/);
  assert.ok(d.includes(channel.description.affiliate_disclosure.trim()));
  assert.ok(d.endsWith('#ai'));
  // affiliate olmayan bağlantılarda beyan yok
  const d2 = buildDescription({ channel, meta, script: SCRIPT, links: [LINKS[1]], chapters: [] });
  assert.ok(!d2.includes(channel.description.affiliate_disclosure.trim()));
});
