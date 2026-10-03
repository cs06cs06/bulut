// episode.js → SENARYO.md (okunabilir senaryo metni)
import fs from 'node:fs';
import { BUILD, EP, loadEpisode } from './ep.mjs';

const episode = await loadEpisode();

const { meta, cast, scenes } = episode;
let tl = null;
try { tl = JSON.parse(fs.readFileSync(`${BUILD}/timeline.json`, 'utf8')); } catch { /* süreler opsiyonel */ }
const fmt = (s) => `${Math.floor(s / 60)} dk ${String(Math.round(s % 60)).padStart(2, '0')} sn`;

const L = [];
L.push(`# ${meta.series} — "${meta.title}"`, '');
L.push(`*${meta.tag} · tam bölüm senaryosu*`, '');
L.push(`> ${meta.logline}`, '');
if (tl) L.push(`**Süre:** ${fmt(tl.duration)} · **Sahne:** ${scenes.filter((s) => s.set).length} · **Replik:** ${tl.lines.length}`, '');
L.push('## Karakterler', '');
const desc = {
  yil: 'Kuralları kendisi koyan, her kuralı sonuna kadar uygulayan adam. Komşuluğa inanır, "hayır" diyemez.',
  ilk: 'Yılmaz\'ın en yakın arkadaşı. Mantığın sesi olmaya çalışır; çoğu zaman Yılmaz\'ın mantığına yenilir.',
  nec: 'Sekiz numaradaki emekli komşu. Her sabah kapı dürbününden bakar, her sabah "bir şey isteyecektir".',
  rem: 'Huzur Apartmanı\'nın kapıcısı. Bütün dairelerin anahtarı ondadır — biri hariç.',
  hus: 'Mahallenin çilingiri. Kapıyı iki buçuk saniyede açar, muhabbeti ayrıca ücretlendirir.',
  suk: 'Mahallenin bakkalı. Ekmeği biter, yumurtası bitmez; veresiye defteri mahallenin hafızasıdır.',
  sev: 'Huzur Apartmanı\'nın yöneticisi. Dosyası, masa zili ve yönetmeliğiyle düzenin son savunucusu.',
};
for (const [id, c] of Object.entries(cast)) L.push(`- **${c.name}** — ${desc[id]}`);
L.push('', '---', '');

scenes.forEach((sc, si) => {
  const ts = tl && tl.scenes[si];
  L.push(`## ${sc.label}`, '');
  if (sc.title) {
    L.push('*Jenerik müziği girer. Ekranda harfler tek tek düşer:* **GİBİ** — *altında:* **${meta.title}**', '', '---', '');
    return;
  }
  if (sc.credits) {
    L.push('*Kapanış müziği. Jenerik akar.*', '', '**SON**', '');
    return;
  }
  L.push(`**${sc.heading}**${ts ? `  ·  *(${fmt(ts.end - ts.start)})*` : ''}`, '');
  for (const b of sc.beats) {
    if (b.type === 'act') L.push(`*${b.text}*`, '');
    else if (b.type === 'card') L.push(`> **EKRANDA:** ${b.text}`, '');
    else if (b.type === 'insert') {
      if (b.kind === 'wifi') L.push(`> **ARA GÖRÜNTÜ — ${b.text}** ${b.rows.map((r) => '`' + r[0] + '`').join(' · ')}`, '');
      else if (b.kind === 'notice') L.push(`> **ARA GÖRÜNTÜ — ilan:** **${b.title}** — ${b.lines.filter(Boolean).join(' · ')} — *${b.sign}*`, '');
      else if (b.kind === 'pass') L.push(`> **ARA GÖRÜNTÜ — telefon:** \`${b.input}\` → *${b.ok ? b.okText || 'Bağlandı' : 'Yanlış şifre'}*`, '');
      else L.push(`> **ARA GÖRÜNTÜ — ${b.text}**  `, `> ${b.title}: ${b.lines.filter(Boolean).join(' · ')} **${b.last}**`, '');
    }
    else if (b.type === 'say') {
      const who = Array.isArray(b.who) ? b.who.map((w) => cast[w].name).join(' VE ') : cast[b.who].name;
      const paren = b.p || (b.os ? (sc.id === 'tag' ? 'kapının arkasından' : 'içeriden') : null);
      L.push(`**${who}**${paren ? ` *(${paren})*` : ''}  `, b.text, '');
    }
  }
  L.push('---', '');
});
L.push('*Bu senaryo, Gibi dizisine duyulan sevgiyle yazılmış resmi olmayan bir hayran bölümüdür.*', '');
fs.mkdirSync('senaryolar', { recursive: true });
fs.writeFileSync(`senaryolar/${EP}.md`, L.join('\n'));
console.log(`senaryolar/${EP}.md yazıldı`);
