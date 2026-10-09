<script lang="ts">
  import { onMount } from 'svelte';
  import { fmtTime } from '$lib/format';

  let { data } = $props();

  type Theme = 'sistem' | 'acik' | 'koyu';
  let theme = $state<Theme>('sistem');

  onMount(() => {
    try {
      theme = (localStorage.getItem('tema') as Theme) ?? 'sistem';
    } catch {
      /* tarayıcı depolaması kapalı */
    }
  });

  function setTheme(t: Theme) {
    theme = t;
    const root = document.documentElement;
    if (t === 'koyu') root.dataset.theme = 'dark';
    else if (t === 'acik') root.dataset.theme = 'light';
    else delete root.dataset.theme;
    try {
      if (t === 'sistem') localStorage.removeItem('tema');
      else localStorage.setItem('tema', t);
    } catch {
      /* depolama yoksa yalnızca bu oturumda geçerli */
    }
  }

  const SOURCE_NAME: Record<string, string> = { pubmed: 'PubMed' };
  const KIND_NAME: Record<string, string> = { collect: 'Toplama', process: 'Değerlendirme' };
  const STATUS: Record<string, { label: string; cls: string }> = {
    ok: { label: 'başarılı', cls: 'green' },
    partial: { label: 'kısmen', cls: 'yellow' },
    failed: { label: 'başarısız', cls: 'red' },
    running: { label: 'sürüyor', cls: 'yellow' },
  };

  function sourceHealth(s: { last_success_at: string | null; last_error: string | null }) {
    if (!s.last_success_at) return 'red';
    const hours = (Date.now() - new Date(s.last_success_at).getTime()) / 3600e3;
    if (hours > 48) return 'red';
    if (hours > 30 || s.last_error) return 'yellow';
    return 'green';
  }
</script>

<h1 class="title">Ayarlar</h1>

<section class="card">
  <h2>Görünüm</h2>
  <div class="seg" role="radiogroup" aria-label="Tema">
    {#each [['sistem', 'Cihaz ayarı'], ['acik', 'Açık'], ['koyu', 'Koyu']] as [v, label]}
      <button role="radio" aria-checked={theme === v} class:on={theme === v} onclick={() => setTheme(v as Theme)}>{label}</button>
    {/each}
  </div>
  <p class="hint">Uygulamayı ana ekrana eklemek için tarayıcı menüsünden <strong>"Ana ekrana ekle"</strong> seçeneğini kullanın.</p>
</section>

<section class="card" id="durum">
  <h2>Sistem durumu</h2>
  {#each data.sources as s}
    <div class="line">
      <span class="light {sourceHealth(s)}"></span>
      <span class="name">{SOURCE_NAME[s.source] ?? s.source}</span>
      <span class="val">son başarılı çekim: {fmtTime(s.last_success_at)}</span>
    </div>
    {#if s.backfill_cursor}<p class="sub">Geriye dönük tarama sürüyor.</p>{/if}
  {/each}
  <div class="stats">
    <div><strong>{Number(data.counts.works ?? 0).toLocaleString('tr-TR')}</strong><span>toplanan kayıt</span></div>
    <div><strong>{data.counts.reviews}</strong><span>editör yazısı</span></div>
    <div><strong>{Number(data.counts.pending ?? 0).toLocaleString('tr-TR')}</strong><span>değerlendirme bekleyen</span></div>
    <div><strong>${data.monthCost.toFixed(2)}</strong><span>bu ayki yapay zekâ maliyeti</span></div>
  </div>

  <h3>Son çalıştırmalar</h3>
  {#each data.runs as r}
    <div class="line">
      <span class="light {STATUS[r.status]?.cls ?? 'yellow'}"></span>
      <span class="name">{KIND_NAME[r.kind] ?? r.kind}</span>
      <span class="val">{fmtTime(r.finished_at ?? r.started_at)} · {STATUS[r.status]?.label ?? r.status}</span>
    </div>
  {/each}

  {#if data.events.length}
    <h3>Son uyarılar</h3>
    {#each data.events as e}
      <p class="event {e.level}"><span>{fmtTime(e.created_at)}</span> {e.message}</p>
    {/each}
  {/if}
</section>

<section class="card">
  <h2>Diğer</h2>
  <a class="link" href="/kayitlar">Toplanan tüm kayıtlar</a>
  <a class="link" href="/cdn-cgi/access/logout" data-sveltekit-reload>Çıkış yap</a>
</section>

<p class="disclaimer">Bu uygulama klinik karar destek aracı değil, kişisel bir literatür takip aracıdır.</p>

<style>
  .title {
    font-size: 1.6rem;
    margin: 8px 0 16px;
    letter-spacing: -0.01em;
  }
  .card {
    padding: 16px;
    margin-bottom: 14px;
    border-radius: 18px;
    background: var(--surface);
    border: 1px solid var(--line);
    box-shadow: var(--shadow);
  }
  h2 {
    margin: 0 0 12px;
    font-size: 0.8rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--gold);
  }
  h3 {
    margin: 18px 0 8px;
    font-size: 0.9rem;
  }
  .seg {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    padding: 4px;
    border-radius: 12px;
    background: var(--surface-2);
  }
  .seg button {
    border: none;
    background: transparent;
    padding: 9px 4px;
    border-radius: 9px;
    color: var(--muted);
    font-size: 0.9rem;
    cursor: pointer;
  }
  .seg button.on {
    background: var(--surface);
    color: var(--gold);
    font-weight: 600;
    box-shadow: var(--shadow);
  }
  .hint {
    margin: 12px 0 0;
    font-size: 0.85rem;
    color: var(--muted);
    line-height: 1.45;
  }
  .line {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 0;
    font-size: 0.9rem;
  }
  .name {
    font-weight: 600;
  }
  .val {
    margin-left: auto;
    color: var(--muted);
    font-size: 0.8rem;
    text-align: right;
  }
  .sub {
    margin: 0 0 6px 20px;
    font-size: 0.8rem;
    color: var(--muted);
  }
  .light {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex: none;
  }
  .light.green {
    background: #3fb27f;
    box-shadow: 0 0 0 3px rgba(63, 178, 127, 0.18);
  }
  .light.yellow {
    background: #e2b45c;
    box-shadow: 0 0 0 3px rgba(226, 180, 92, 0.18);
  }
  .light.red {
    background: #e5534b;
    box-shadow: 0 0 0 3px rgba(229, 83, 75, 0.18);
  }
  .stats {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-top: 12px;
  }
  .stats div {
    padding: 12px;
    border-radius: 12px;
    background: var(--surface-2);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .stats strong {
    font-size: 1.15rem;
  }
  .stats span {
    font-size: 0.75rem;
    color: var(--muted);
  }
  .event {
    margin: 0 0 8px;
    padding: 8px 10px;
    border-radius: 10px;
    font-size: 0.82rem;
    line-height: 1.4;
    background: var(--warn-bg);
    color: var(--warn-text);
  }
  .event.error {
    background: var(--err-bg);
    color: var(--err-text);
  }
  .event span {
    opacity: 0.7;
    margin-right: 4px;
  }
  .link {
    display: block;
    padding: 12px 0;
    border-bottom: 1px solid var(--line);
    text-decoration: none;
  }
  .link:last-child {
    border-bottom: none;
  }
  .disclaimer {
    margin: 24px 0 8px;
    text-align: center;
    font-size: 0.75rem;
    color: var(--muted);
  }
</style>
