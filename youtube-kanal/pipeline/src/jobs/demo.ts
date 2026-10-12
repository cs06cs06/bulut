// Deneme videosu: yapay zekâ ve API anahtarı gerektirmeden bütün görsel türlerini içeren kısa bir video
// üretir (örnek web sitesi + sessiz seslendirme). Görünümü kontrol etmek ve hattı sınamak içindir.
//   npm run demo                 → sessiz
//   DEMO_TTS=1 npm run demo      → config/channel.yaml'daki seslendirme sağlayıcısıyla

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';
import { channelFormat, loadAffiliates, loadChannel, ROOT } from '../lib/config.ts';
import { Episode } from '../lib/episode.ts';
import type { Script } from '../lib/script.ts';
import { launchBrowser } from '../media/browser.ts';
import { silent, ttsFromConfig } from '../media/tts.ts';
import { imagesFromConfig, placeholderImages } from '../media/images.ts';
import { buildVideo } from '../stages/video.ts';
import type { Metadata } from '../stages/write.ts';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'test', 'fixtures', 'site');

export function demoScript(base: string): Script {
  return {
    title: 'How to Get AI Meeting Notes in 2 Minutes',
    format: 'tutorial',
    tools: ['Acme Notes', 'Notion'],
    scenes: [
      { id: 's01', chapter: 'Intro', narration: 'Stop writing meeting notes by hand. In the next two minutes you will set up AI notes that write themselves.', visual: { type: 'title', heading: 'AI Meeting Notes in 2 Minutes', sub: 'Free, fast and accurate' } },
      { id: 's02', chapter: '', narration: 'Here is the tool we will use. The homepage tells you exactly what it does: summaries, action items and a follow-up email.', visual: { type: 'browser', url: `${base}/index.html`, steps: [{ action: 'show', target: '', caption: 'The Acme Notes homepage' }, { action: 'highlight', target: 'Meeting notes that write themselves', caption: 'The core promise' }] } },
      { id: 's03', chapter: 'Pricing', narration: 'Before you sign up, check the pricing. Click Pricing in the top menu. The free plan covers ten meetings a month, which is plenty to test it.', visual: { type: 'browser', url: `${base}/index.html`, steps: [{ action: 'click', target: 'Pricing', caption: 'Open the pricing page' }] } },
      { id: 's04', chapter: '', narration: 'Here is what you get on each plan, side by side.', visual: { type: 'compare', heading: 'Which plan?', columns: ['Free', 'Pro', 'Team'], rows: [{ label: 'Price', values: ['$0', '$12/mo', '$20/mo'] }, { label: 'Meetings', values: ['10 / month', 'Unlimited', 'Unlimited'] }, { label: 'Action items', values: ['No', 'Yes', 'Yes'] }] } },
      { id: 's05', chapter: 'Setup', narration: 'Setup takes three steps. Create an account, connect your calendar, and turn on auto record.', visual: { type: 'steps', heading: 'Setup in 3 steps', steps: [{ text: 'Create a free account', detail: '' }, { text: 'Connect your calendar', detail: 'Settings → Integrations' }, { text: 'Turn on auto record', detail: 'Recording → Auto' }] } },
      { id: 's06', chapter: '', narration: 'Use this prompt to get a follow-up email from your notes.', visual: { type: 'code', heading: 'Follow-up prompt', language: 'prompt', code: 'Write a short follow-up email from these notes.\nList each action item with its owner and due date.\nKeep it under 120 words.' } },
      { id: 's07', chapter: 'Tips', narration: 'Three things make the summaries much better.', visual: { type: 'bullets', heading: 'Better summaries', items: ['Name speakers at the start', 'Share the agenda first', 'Review action items weekly'] } },
      { id: 's08', chapter: '', narration: 'Pro tip: send the summary to Notion automatically, so every meeting lands in one searchable place.', visual: { type: 'callout', kind: 'tip', text: 'Send every summary to Notion automatically.' } },
      { id: 's09', chapter: '', narration: 'That is it. The links are in the description. Subscribe for a new AI tool tutorial every week.', visual: { type: 'outro', heading: 'You are all set', cta: 'Links are in the description' } },
    ],
  };
}

/** Listicle kanalları için kısa deneme senaryosu (giriş + 3 madde + kapanış). */
export function demoListicle(): Script {
  const photos = (number: number, heading: string, prompts: string[]) => ({ type: 'photos' as const, number, heading, prompts });
  return {
    title: '25 Things Every Kid Did in the 1960s',
    format: 'listicle',
    tools: [],
    scenes: [
      { id: 's01', chapter: 'Intro', narration: 'Remember the sound of the screen door slamming on a summer afternoon? Back then, nobody called us inside until the streetlights came on.', visual: photos(0, '', ['Children running out of a white wooden house through a screen door on a sunny summer afternoon, Ohio, 1964', 'A quiet suburban street lined with maple trees and parked station wagons, 1965']) },
      { id: 's02', chapter: '1. Riding in the Back of the Station Wagon', narration: 'We piled into the very back of the station wagon, no seatbelts, facing the cars behind us and waving at strangers the whole way to Grandma\'s house.', visual: photos(1, 'Riding in the Back of the Station Wagon', ['Three kids sitting in the rear cargo area of a wood-paneled station wagon waving out the back window, 1966', 'A family station wagon on a two-lane country highway in summer, 1967']) },
      { id: 's03', chapter: '2. Drinking From the Garden Hose', narration: 'When we got thirsty, we drank straight from the garden hose, warm at first, then ice cold, and we never thought twice about it.', visual: photos(2, 'Drinking From the Garden Hose', ['A boy in shorts drinking water from a green garden hose in a sunny backyard, 1963', 'Close-up of a garden hose spraying water over a lawn with a sprinkler, 1960s']) },
      { id: 's04', chapter: '3. Saturday Morning Cartoons', narration: 'Saturday mornings belonged to cartoons. We sat cross-legged on the shag carpet with a bowl of cereal, inches from the television set.', visual: photos(3, 'Saturday Morning Cartoons', ['Two children sitting on an orange shag carpet in pajamas watching a wooden console television, 1969', 'A bowl of cereal and a glass of milk on a living room floor, morning light, 1968']) },
      { id: 's05', chapter: '', narration: 'Tell me in the comments which one you remember most, and where you grew up. And if this brought back a smile, subscribe for more.', visual: photos(0, '', ['A family photo album open on a kitchen table with old snapshots, warm lamp light, 1970']) },
    ],
  };
}

const DEMO_META: Metadata = {
  titles: ['How to Get AI Meeting Notes in 2 Minutes (Free)'],
  description_intro: 'Get AI meeting notes in two minutes: set up automatic summaries, action items and follow-up emails.',
  tags: ['ai meeting notes', 'meeting notes app'],
  thumbnail_text: 'Notes on Autopilot',
  thumbnail_badge: 'FREE',
  hashtags: ['#ai', '#productivity'],
};

async function main(): Promise<void> {
  const server = createServer((req, res) => {
    const name = (req.url ?? '/').split('?')[0].replace(/^\/+/, '') || 'index.html';
    try {
      const body = readFileSync(join(SITE, name.replace(/\.\./g, '')));
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const channel = loadChannel();
  const listicle = channelFormat(channel) === 'listicle';
  const tts = process.env.DEMO_TTS ? ttsFromConfig(channel) : silent(channel.video.words_per_minute);
  // Görseller: varsayılan yer tutucu; DEMO_IMAGES=1 ile config'deki gerçek sağlayıcı (ücretli)
  const images = listicle ? (process.env.DEMO_IMAGES ? imagesFromConfig(channel) : placeholderImages()) : undefined;
  const ep = Episode.open({ id: 'demo', title: 'Demo', status: 'üretiliyor', episode: 'demo' }, join(ROOT, 'work', 'demo-root'));
  const browser = await launchBrowser();
  const started = Date.now();
  try {
    const script = listicle ? demoListicle() : demoScript(base);
    const meta: Metadata = listicle
      ? { ...DEMO_META, titles: ['25 Things Every Kid Did in the 1960s – Unthinkable Today'], thumbnail_text: 'TOTALLY NORMAL', thumbnail_badge: '', thumbnail_prompt: 'A grinning boy in a striped shirt riding a bicycle down a quiet suburban street, arms raised, summer 1966' }
      : DEMO_META;
    const out = await buildVideo({ ep, browser, channel, script, meta, links: loadAffiliates(), tts, images });
    console.log(`\n✅ ${out.video}\n   ${out.thumbnail}\n   süre ${out.duration.toFixed(1)} sn, oluşturma ${((Date.now() - started) / 1000).toFixed(0)} sn`);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
