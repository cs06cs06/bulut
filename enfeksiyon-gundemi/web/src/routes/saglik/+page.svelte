<script lang="ts">
  import { invalidate } from '$app/navigation';
  import Icon from '$lib/components/Icon.svelte';
  import { fmtTime } from '$lib/format';

  let { data } = $props();
  const h = $derived(data.health);

  const KIND: Record<string, string> = { collect: 'Toplama', process: 'Değerlendirme' };
  const STATUS: Record<string, { label: string; light: string }> = {
    ok: { label: 'başarılı', light: 'green' },
    partial: { label: 'kısmen başarılı', light: 'yellow' },
    failed: { label: 'başarısız', light: 'red' },
    running: { label: 'sürüyor', light: 'grey' },
    interrupted: { label: 'yarıda kesildi', light: 'red' },
  };
  const COST_KIND: Record<string, string> = { triage: 'Triyaj', review: 'Editör yazıları', qa: 'Soru-cevap' };

  const usd = (v: number) => `$${v.toFixed(2)}`;
  const pct = (a: number, b: number) => (b > 0 ? Math.min(100, Math.round((a / b) * 100)) : 0);
  const mb = (b: number) => `${(b / 1024 / 1024).toFixed(b > 100 * 1024 * 1024 ? 0 : 1)} MB`;
  const minutes = (a: string, b: string | null) => (b ? Math.max(1, Math.round((Date.parse(b) - Date.parse(a)) / 60000)) : null);
  const summary = $derived(
    h.level === 'ok' ? 'Her şey yolunda.' : h.level === 'warn' ? 'Dikkat gerektiren durumlar var.' : 'Müdahale gerektiren bir sorun var.',
  );
  const spark = (series: number[]) => {
    const max = Math.max(1, ...series);
    return series.map((v) => Math.round((v / max) * 100));
  };
  let refreshing = $state(false);
  async function refresh() {
    refreshing = true;
    await invalidate('app:durum');
    refreshing = false;
  }
</script>

<svelte:head>
  <title>Sistem sağlığı · Enfeksiyon Gündemi</title>
</svelte:head>

<div class="head">
  <a href="/ayarlar" class="icon-btn" aria-label="Ayarlara dön"><Icon name="back" /></a>
  <h1 class="title">Sistem sağlığı</h1>
  <button class="refresh" onclick={refresh} disabled={refreshing}>{refreshing ? 'Yenileniyor…' : 'Yenile'}</button>
</div>

<section class="overall {h.level}">
  <span class="light big {h.level === 'ok' ? 'green' : h.level === 'warn' ? 'yellow' : 'red'}"></span>
  <div>
    <strong>{summary}</strong>
    {#each h.issues as i}<p>{i.text}</p>{/each}
    <p class="muted">Son toplama: {fmtTime(h.lastCollect)}</p>
  </div>
</section>

{#if h.issues.some((i) => i.text.startsWith('Otomatik toplama'))}
  <section class="card help">
    <h2>Ne yapmalı?</h2>
    <p>
      GitHub uzun süre etkinlik olmayan depolarda zamanlanmış işleri durdurabilir. GitHub'da depo → <strong>Actions</strong> →
      "Enfeksiyon Gündemi · Günlük toplama" → <strong>Enable workflow</strong> (varsa) ve ardından <strong>Run workflow</strong>.
      Düzelmezse bana yazın.
    </p>
  </section>
{/if}

<section class="card">
  <h2>Kaynaklar</h2>
  <p class="hint">Çubuklar son 14 günde her gün okunan kayıt sayısını gösterir.</p>
  {#each h.sources.filter((s) => s.light !== 'grey') as s (s.id)}
    <div class="src">
      <span class="light {s.light}"></span>
      <div class="src-main">
        <div class="src-top">
          <span class="name">{s.name}</span>
          <span class="spark" aria-hidden="true">{#each spark(s.series) as v}<i style="height:{Math.max(6, v)}%" class:zero={v === 0}></i>{/each}</span>
        </div>
        <span class="val">{s.lastSuccess ? `son başarılı çekim: ${fmtTime(s.lastSuccess)}` : 'henüz başarılı çekim yok'}</span>
        {#if s.problem}<span class="prob">{s.problem}</span>{/if}
        {#if s.deviation}<span class="prob">{s.deviation}</span>{/if}
        {#if s.detail}
          <details><summary>Teknik ayrıntı</summary><code>{s.detail}</code></details>
        {/if}
      </div>
    </div>
  {/each}
  {#if h.sources.some((s) => s.light === 'grey')}
    <div class="src">
      <span class="light grey"></span>
      <div class="src-main">
        <span class="name">Henüz çalıştırılmamış</span>
        <span class="prob">{h.sources.filter((s) => s.light === 'grey').map((s) => s.name).join(', ')}</span>
      </div>
    </div>
  {/if}
</section>

<section class="card">
  <h2>Yapay zekâ</h2>
  <div class="meter">
    <div class="meter-top"><span>Bu ayki maliyet</span><strong>{usd(h.budget.spent)} / {usd(h.budget.limit)}</strong></div>
    <div class="bar"><i style="width:{pct(h.budget.spent, h.budget.limit)}%" class:warn={h.budget.spent >= h.budget.limit * 0.8}></i></div>
    <span class="muted">Bu hızla ay sonu tahmini: {usd(h.budget.projected)}</span>
  </div>
  <div class="kv">
    {#each Object.entries(h.budget.byKind) as [k, v]}
      <div><span>{COST_KIND[k] ?? k}</span><strong>{usd(v.usd)}</strong></div>
    {/each}
  </div>
  <div class="stats">
    <div><strong>{h.ai.triageWaiting.toLocaleString('tr-TR')}</strong><span>triyaj bekleyen kayıt</span></div>
    <div><strong>{h.ai.reviewsToday} / {h.ai.reviewsPerDay}</strong><span>bugünkü editör yazısı</span></div>
    <div><strong>{h.ai.batches}</strong><span>süren toplu iş</span></div>
    <div><strong>{h.ai.questionsMonth}</strong><span>bu ay sorulan soru</span></div>
  </div>
</section>

<section class="card">
  <h2>Veri ve kotalar</h2>
  <div class="meter">
    <div class="meter-top"><span>Bugünkü veritabanı yazma</span><strong>{h.data.writesToday.toLocaleString('tr-TR')} / {h.data.writesLimit.toLocaleString('tr-TR')}</strong></div>
    <div class="bar"><i style="width:{pct(h.data.writesToday, h.data.writesLimit)}%" class:warn={h.data.writesToday > h.data.writesLimit * 0.85}></i></div>
    <span class="muted">Cloudflare ücretsiz kotası her gece 03:00'te (TR) sıfırlanır; dolarsa işler ertesi güne kalır.</span>
  </div>
  {#if h.data.dbBytes}
    <div class="meter">
      <div class="meter-top"><span>Veritabanı boyutu</span><strong>{mb(h.data.dbBytes)} / {mb(h.data.dbLimit)}</strong></div>
      <div class="bar"><i style="width:{pct(h.data.dbBytes, h.data.dbLimit)}%"></i></div>
    </div>
  {/if}
  <div class="meter">
    <div class="meter-top"><span>Soru-cevap arama dizini</span><strong>%{Math.round(h.data.indexProgress * 100)}</strong></div>
    <div class="bar"><i style="width:{Math.round(h.data.indexProgress * 100)}%"></i></div>
  </div>
  <div class="stats">
    <div><strong>{h.data.works.toLocaleString('tr-TR')}</strong><span>toplanan kayıt</span></div>
    <div><strong>{h.data.reviews}</strong><span>editör yazısı</span></div>
  </div>
</section>

<section class="card">
  <h2>Son çalıştırmalar</h2>
  {#each h.runs as r (r.id)}
    <details class="run">
      <summary>
        <span class="light {STATUS[r.status]?.light ?? 'grey'}"></span>
        <span class="name">{KIND[r.kind] ?? r.kind}</span>
        <span class="val">{fmtTime(r.started_at)} · {STATUS[r.status]?.label ?? r.status}{minutes(r.started_at, r.finished_at) ? ` · ${minutes(r.started_at, r.finished_at)} dk` : ''}</span>
      </summary>
      {#each r.events as e}<p class="ev {e.level}">{e.message}</p>{:else}<p class="ev">Kayıtlı ayrıntı yok.</p>{/each}
    </details>
  {:else}
    <p class="muted">Henüz çalıştırma yok.</p>
  {/each}
</section>

{#if h.events.length}
  <section class="card">
    <h2>Son 3 günün uyarıları</h2>
    {#each h.events as e}
      <div class="event {e.level}">
        <span class="when">{fmtTime(e.last_at)}{e.n > 1 ? ` · ${e.n} kez` : ''}</span>
        <p>{e.message}</p>
        {#if e.detail}<details><summary>Teknik ayrıntı</summary><code>{e.detail}</code></details>{/if}
      </div>
    {/each}
  </section>
{/if}

<p class="disclaimer">Bu uygulama klinik karar destek aracı değil, kişisel bir literatür takip aracıdır.</p>

<style>
  .head {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 6px 0 14px -8px;
  }
  .head .icon-btn {
    color: var(--text);
  }
  .title {
    flex: 1;
    font-size: 1.5rem;
    margin: 0;
    letter-spacing: -0.01em;
  }
  .refresh {
    border: 1px solid var(--line-strong);
    background: var(--surface);
    color: var(--text-2);
    border-radius: 999px;
    padding: 6px 12px;
    font-size: 0.82rem;
  }
  .overall {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    padding: 14px 16px;
    border-radius: 16px;
    margin-bottom: 14px;
    background: var(--surface);
    border: 1px solid var(--line);
  }
  .overall.warn {
    background: var(--warn-bg);
    color: var(--warn-text);
  }
  .overall.error {
    background: var(--err-bg);
    color: var(--err-text);
  }
  .overall strong {
    display: block;
    font-size: 1.05rem;
    margin-bottom: 2px;
  }
  .overall p {
    margin: 4px 0 0;
    line-height: 1.45;
    font-size: 0.92rem;
  }
  .card {
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 16px;
    padding: 14px 16px;
    margin-bottom: 14px;
  }
  .card h2 {
    font-size: 0.8rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
    margin: 0 0 10px;
  }
  .help p {
    margin: 0;
    line-height: 1.5;
    font-size: 0.92rem;
  }
  .hint,
  .muted {
    color: var(--muted);
    font-size: 0.8rem;
    margin: 0 0 8px;
  }
  .light {
    flex: none;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    margin-top: 5px;
    background: var(--muted);
  }
  .light.big {
    width: 14px;
    height: 14px;
    margin-top: 4px;
  }
  .light.green {
    background: #3aa76d;
  }
  .light.yellow {
    background: #e0a526;
  }
  .light.red {
    background: #d9534f;
  }
  .light.grey {
    background: var(--line-strong);
  }
  .src {
    display: flex;
    gap: 10px;
    padding: 9px 0;
    border-top: 1px solid var(--line);
  }
  .src-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .src-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
  }
  .name {
    font-weight: 600;
  }
  .val {
    color: var(--muted);
    font-size: 0.8rem;
  }
  .prob {
    font-size: 0.85rem;
    color: var(--text-2);
    line-height: 1.4;
  }
  .spark {
    flex: none;
    display: flex;
    align-items: flex-end;
    gap: 2px;
    height: 20px;
    width: 84px;
  }
  .spark i {
    flex: 1;
    background: var(--gold);
    opacity: 0.75;
    border-radius: 1px;
  }
  .spark i.zero {
    background: var(--line-strong);
    opacity: 1;
  }
  details summary {
    cursor: pointer;
    color: var(--muted);
    font-size: 0.78rem;
  }
  code {
    display: block;
    margin-top: 4px;
    font-size: 0.75rem;
    color: var(--muted);
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }
  .meter {
    margin-bottom: 12px;
  }
  .meter-top {
    display: flex;
    justify-content: space-between;
    font-size: 0.9rem;
    margin-bottom: 5px;
  }
  .bar {
    height: 8px;
    border-radius: 4px;
    background: var(--surface-2);
    overflow: hidden;
    margin-bottom: 4px;
  }
  .bar i {
    display: block;
    height: 100%;
    background: var(--gold);
    border-radius: 4px;
  }
  .bar i.warn {
    background: #d9534f;
  }
  .kv {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 16px;
    margin-bottom: 12px;
    font-size: 0.85rem;
  }
  .kv div {
    display: flex;
    gap: 6px;
  }
  .kv span {
    color: var(--muted);
  }
  .stats {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .stats div {
    display: flex;
    flex-direction: column;
    padding: 10px 12px;
    border-radius: 12px;
    background: var(--surface-2);
  }
  .stats strong {
    font-size: 1.15rem;
  }
  .stats span {
    color: var(--muted);
    font-size: 0.78rem;
  }
  .run {
    border-top: 1px solid var(--line);
    padding: 8px 0;
  }
  .run summary {
    display: flex;
    align-items: baseline;
    gap: 8px;
    color: var(--text);
    font-size: 0.92rem;
    list-style: none;
  }
  .run summary::-webkit-details-marker {
    display: none;
  }
  .run summary .light {
    align-self: center;
    margin-top: 0;
  }
  .ev {
    margin: 6px 0 0 18px;
    font-size: 0.85rem;
    line-height: 1.45;
    color: var(--text-2);
  }
  .ev.warn {
    color: var(--warn-text);
  }
  .ev.error {
    color: var(--err-text);
  }
  .event {
    border-top: 1px solid var(--line);
    padding: 8px 0;
  }
  .event p {
    margin: 2px 0 0;
    font-size: 0.9rem;
    line-height: 1.45;
  }
  .event.error p {
    color: var(--err-text);
  }
  .when {
    color: var(--muted);
    font-size: 0.75rem;
  }
  .disclaimer {
    color: var(--muted);
    font-size: 0.75rem;
    text-align: center;
    margin: 18px 0 0;
  }
</style>
