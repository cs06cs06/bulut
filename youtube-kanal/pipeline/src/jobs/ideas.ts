// Haftalık iş: yeni konu fikirleri üretip data/backlog.yaml'a ekler.

import { AnthropicAiClient, type AiClient } from '../ai/client.ts';
import { loadBacklog, saveBacklog } from '../lib/backlog.ts';
import { loadAiConfig, loadChannel } from '../lib/config.ts';
import { fail, log, summary, warn } from '../lib/log.ts';
import { UsageLedger } from '../lib/usage.ts';
import { collectSuggestions } from '../media/suggest.ts';
import { generateIdeas } from '../stages/ideas.ts';

export async function runIdeas(ai: AiClient = new AnthropicAiClient()): Promise<number> {
  if (!process.env.ANTHROPIC_API_KEY) {
    warn('ANTHROPIC_API_KEY eklenmemiş (GitHub → Settings → Secrets and variables → Actions); fikir üretimi atlandı');
    return 0;
  }
  const channel = loadChannel();
  const aiCfg = loadAiConfig();
  const ledger = new UsageLedger();
  if (ledger.spentThisMonth() >= aiCfg.budget.monthly_usd) {
    warn(`Aylık bütçe tavanına ulaşıldı (${ledger.spentThisMonth().toFixed(2)} $); fikir üretimi atlandı`);
    return 0;
  }
  const backlog = loadBacklog();

  log('🔎 YouTube arama önerileri toplanıyor…');
  const suggestions = await collectSuggestions(channel.seeds);
  if (!suggestions.length) warn('Arama önerileri alınamadı; fikirler yalnızca web araştırmasına dayanacak');
  else log(`   ${suggestions.length} arama ifadesi`);

  log('💡 Fikirler üretiliyor…');
  const { topics, cost } = await generateIdeas({ ai, channel, aiCfg, existing: backlog, suggestions });
  ledger.add(cost);
  saveBacklog([...backlog, ...topics]);

  log(`✅ ${topics.length} yeni konu eklendi (maliyet ${cost.toFixed(2)} $)`);
  for (const t of topics) log(`   [${t.score}] ${t.title}`);
  summary(
    `### ${topics.length} yeni konu\n\n| Puan | Başlık | Biçim |\n|---|---|---|\n` +
      topics.map((t) => `| ${t.score} | ${t.title} | ${t.format ?? ''} |`).join('\n'),
  );
  return topics.length;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runIdeas().catch((e) => {
    fail(`Fikir üretimi başarısız: ${(e as Error).message}`);
    process.exit(1);
  });
}
