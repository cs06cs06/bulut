// Ana iş: sıradaki konudan baştan sona bir video üretir.
// Konu seç → araştır → senaryo → başlık/kapak metni → ses → ekran görüntüleri → video → kapak → (yükle)

import { AnthropicAiClient } from '../ai/client.ts';
import { loadBacklog, pickTopic, saveBacklog } from '../lib/backlog.ts';
import { loadAffiliates, loadAiConfig, loadChannel, type Weekday } from '../lib/config.ts';
import { Episode } from '../lib/episode.ts';
import { fail, log, setOutput, summary, warn } from '../lib/log.ts';
import { scriptWords, type Script } from '../lib/script.ts';
import { UsageLedger } from '../lib/usage.ts';
import { launchBrowser } from '../media/browser.ts';
import { formatTimestamp } from '../media/timeline.ts';
import { ttsFromConfig } from '../media/tts.ts';
import { credsFromEnv, uploadVideo } from '../media/youtube.ts';
import { generateIdeas } from '../stages/ideas.ts';
import { buildVideo } from '../stages/video.ts';
import { research, writeMetadata, writeScript, type Metadata } from '../stages/write.ts';
import { collectSuggestions } from '../media/suggest.ts';

const DAYS: Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MAX_FAILURES = 3;

async function main(): Promise<void> {
  const channel = loadChannel();
  const aiCfg = loadAiConfig();
  const links = loadAffiliates();
  const ledger = new UsageLedger();
  const ai = new AnthropicAiClient();

  // Zamanlanmış çalıştırmada yalnızca yayın günlerinde üret (Türkiye saatine göre gün).
  if (process.env.GITHUB_EVENT_NAME === 'schedule' && !process.env.FORCE) {
    const today = DAYS[new Date(Date.now() + 3 * 3600_000).getUTCDay()];
    if (!channel.schedule.days.includes(today)) {
      log(`Bugün (${today}) yayın günü değil (${channel.schedule.days.join(', ')}); üretim yok.`);
      return;
    }
  }
  if (ledger.spentThisMonth() >= aiCfg.budget.monthly_usd) {
    warn(`Aylık bütçe tavanına ulaşıldı (${ledger.spentThisMonth().toFixed(2)} / ${aiCfg.budget.monthly_usd} $). config/ai.yaml → budget.monthly_usd`);
    return;
  }

  // Seslendirme anahtarını en başta denetle: eksikse yapay zekâ harcaması yapmadan dur.
  const tts = ttsFromConfig(channel);

  let backlog = loadBacklog();
  let topic = pickTopic(backlog, channel.topics.auto_approve, process.env.TOPIC_ID || undefined);
  if (!topic && !process.env.TOPIC_ID && channel.topics.auto_approve) {
    log('Sırada konu yok; önce yeni fikirler üretiliyor…');
    const ideas = await generateIdeas({ ai, channel, aiCfg, existing: backlog, suggestions: await collectSuggestions(channel.seeds) });
    ledger.add(ideas.cost);
    backlog = [...backlog, ...ideas.topics];
    saveBacklog(backlog);
    topic = pickTopic(backlog, true);
  }
  if (!topic) {
    warn(
      process.env.TOPIC_ID
        ? `"${process.env.TOPIC_ID}" kimlikli üretilebilir konu bulunamadı`
        : 'Üretilecek konu yok: data/backlog.yaml dosyasında bir konuyu "onaylı" yapın',
    );
    return;
  }

  const ep = Episode.open(topic);
  topic.status = 'üretiliyor';
  topic.episode = ep.id;
  saveBacklog(backlog);
  setOutput('episode', ep.id);
  log(`\n▶️  ${topic.title}\n   bölüm: episodes/${ep.id}\n`);

  let spent = 0;
  const charge = (usd: number) => {
    spent += usd;
    ep.addCost(usd);
    ledger.add(usd);
  };

  try {
    // 1) Araştırma
    if (!ep.has('research.md')) {
      log('📚 Araştırma (web)');
      const r = await research(ai, channel, aiCfg, topic);
      charge(r.cost);
      ep.write('research.md', r.value);
      ep.finish('research');
    }

    // 2) Senaryo
    let script: Script;
    if (ep.has('script.json')) script = ep.readJson<Script>('script.json');
    else {
      log('✍️  Senaryo');
      const r = await writeScript(ai, channel, aiCfg, topic, ep.read('research.md'), links);
      charge(r.cost);
      script = r.value;
      ep.writeJson('script.json', script);
      ep.write('script.md', scriptMarkdown(script));
      ep.finish('script');
    }
    log(`   ${script.scenes.length} sahne, ${scriptWords(script)} kelime`);

    // 3) Başlık, açıklama girişi, etiketler, kapak metni
    let meta: Metadata;
    if (ep.has('metadata.json')) meta = ep.readJson<Metadata>('metadata.json');
    else {
      log('🏷️  Başlık ve kapak metni');
      const r = await writeMetadata(ai, channel, aiCfg, topic, script);
      charge(r.cost);
      meta = r.value;
      ep.writeJson('metadata.json', meta);
      ep.finish('metadata');
    }

    // 4–7) Ses, ekran görüntüleri, video, kapak
    const browser = await launchBrowser();
    let out;
    try {
      out = await buildVideo({ ep, browser, channel, script, meta, links, tts, log });
    } finally {
      await browser.close();
    }
    ledger.add(0, { ttsChars: out.ttsChars });

    // 8) İsteğe bağlı YouTube yüklemesi
    if (channel.youtube.upload && !ep.meta.youtube_id) {
      log('⬆️  YouTube\'a yükleniyor');
      const res = await uploadVideo(credsFromEnv(), {
        videoFile: out.video,
        thumbnailFile: out.thumbnail,
        srtFile: out.srt,
        title: meta.titles[0],
        description: ep.read('description.txt'),
        tags: meta.tags,
        categoryId: channel.youtube.category_id,
        privacy: channel.youtube.privacy,
        madeForKids: channel.youtube.made_for_kids,
        containsSyntheticMedia: channel.youtube.contains_synthetic_media,
        language: channel.language,
      });
      for (const w of res.warnings) warn(w);
      ep.meta.youtube_id = res.id;
      ep.finish('upload');
      log(`   https://studio.youtube.com/video/${res.id}/edit`);
    }

    topic.status = 'üretildi';
    delete topic.failures;
    delete topic.error;
    saveBacklog(backlog);
    ledger.add(0, { video: true });

    setOutput('out_dir', out.dir);
    setOutput('title', meta.titles[0]);
    log(`\n✅ Hazır: ${meta.titles[0]} (${formatTimestamp(out.duration)}, bu çalıştırmada ${spent.toFixed(2)} $, bölüm toplamı ${ep.meta.cost_usd.toFixed(2)} $)`);
    summary(
      [
        `### ✅ ${meta.titles[0]}`,
        '',
        `- Süre: ${formatTimestamp(out.duration)} · ${script.scenes.length} sahne · ${scriptWords(script)} kelime`,
        `- Maliyet: ${ep.meta.cost_usd.toFixed(2)} $ (yapay zekâ) · ${out.ttsChars} karakter seslendirme`,
        ep.meta.youtube_id ? `- YouTube Studio: https://studio.youtube.com/video/${ep.meta.youtube_id}/edit` : '- Video, bu çalıştırmadan sonra **Releases** bölümünde indirilmeye hazır olur.',
        `- Diğer başlık seçenekleri: ${meta.titles.slice(1).join(' · ') || '—'}`,
      ].join('\n'),
    );
  } catch (e) {
    const msg = (e as Error).message;
    const t = topic;
    t.failures = (t.failures ?? 0) + 1;
    t.error = msg.split('\n')[0].slice(0, 300);
    if (t.failures >= MAX_FAILURES) {
      t.status = 'reddedildi';
      warn(`"${t.title}" ${MAX_FAILURES} kez başarısız oldu; reddedildi olarak işaretlendi`);
    }
    saveBacklog(backlog);
    throw e;
  }
}

function scriptMarkdown(s: Script): string {
  const lines = [`# ${s.title}`, '', `Biçim: ${s.format} · Araçlar: ${s.tools.join(', ')}`, ''];
  for (const sc of s.scenes) {
    if (sc.chapter) lines.push(`## ${sc.chapter}`, '');
    lines.push(`**${sc.id} · ${sc.visual.type}**`, '', sc.narration, '');
  }
  return lines.join('\n');
}

main().catch((e) => {
  fail(`Üretim başarısız: ${(e as Error).message}`);
  console.error(e);
  process.exit(1);
});
