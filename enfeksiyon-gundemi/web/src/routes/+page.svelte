<script lang="ts">
  let { data } = $props();

  const fmt = (iso: string | null | undefined) =>
    iso
      ? new Date(iso).toLocaleString('tr-TR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' })
      : '—';
  const fmtDay = (d: string | null) =>
    d ? new Date(`${d}T00:00:00Z`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '';
  const types = (json: string | null) => {
    try {
      return (JSON.parse(json ?? '[]') as string[]).filter((t) => t !== 'Journal Article');
    } catch {
      return [];
    }
  };
  const link = (w: { pmid: string | null; doi: string | null }) =>
    w.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${w.pmid}/` : w.doi ? `https://doi.org/${w.doi}` : null;
  const qs = (tier: number | null, page = 0) => {
    const p = new URLSearchParams();
    if (tier) p.set('katman', String(tier));
    if (page) p.set('sayfa', String(page));
    const s = p.toString();
    return s ? `?${s}` : '/';
  };
  const statusText: Record<string, string> = {
    ok: 'başarılı',
    partial: 'kısmen başarılı',
    failed: 'başarısız',
    running: 'sürüyor',
  };
</script>

{#if data.issues.length}
  <section class="issues" aria-label="Uyarılar">
    {#each data.issues as i}
      <p class={i.level}>{i.message}</p>
    {/each}
  </section>
{/if}

<section class="status">
  <p>
    <strong>Kurulum aşaması 1</strong> — Şimdilik yalnızca PubMed'den toplanan kayıtlar listeleniyor. Editör yazıları
    2. aşamada gelecek.
  </p>
  <dl>
    <div><dt>Toplam kayıt</dt><dd>{data.total.toLocaleString('tr-TR')}</dd></div>
    <div>
      <dt>Son toplama</dt>
      <dd>
        {#if data.lastRun}
          {fmt(data.lastRun.finished_at ?? data.lastRun.started_at)} · {statusText[data.lastRun.status] ?? data.lastRun.status}
        {:else}
          henüz yok
        {/if}
      </dd>
    </div>
    {#each data.sources as s}
      {#if s.backfill_cursor}
        <div><dt>Geriye dönük tarama</dt><dd>sürüyor ({fmtDay(s.backfill_cursor)} gününe kadar geldi)</dd></div>
      {/if}
    {/each}
  </dl>
</section>

<nav class="filters" aria-label="Filtre">
  <a href={qs(null)} class:active={!data.tier}>Tümü</a>
  <a href={qs(1)} class:active={data.tier === 1}>1. katman dergiler</a>
  <a href={qs(2)} class:active={data.tier === 2}>2. katman</a>
</nav>

<ol class="list">
  {#each data.works as w (w.id)}
    <li>
      <div class="meta">
        {#if w.journal_tier}<span class="tier t{w.journal_tier}">{w.journal_tier}. katman</span>{/if}
        {#if w.is_preprint}<span class="tag">ön baskı</span>{/if}
        {#each types(w.pub_types) as t}<span class="tag">{t}</span>{/each}
      </div>
      {#if link(w)}
        <a class="title" href={link(w)} target="_blank" rel="noopener noreferrer">{w.title}</a>
      {:else}
        <span class="title">{w.title}</span>
      {/if}
      <div class="src">{w.journal_abbr ?? w.journal ?? ''}{w.pub_date ? ` · ${fmtDay(w.pub_date)}` : ''}</div>
    </li>
  {:else}
    <li class="empty">Henüz kayıt yok. İlk toplama çalıştıktan sonra burada görünecek.</li>
  {/each}
</ol>

<nav class="pager">
  {#if data.page > 0}<a href={qs(data.tier, data.page - 1)}>← Daha yeni</a>{/if}
  {#if data.hasMore}<a href={qs(data.tier, data.page + 1)}>Daha eski →</a>{/if}
</nav>

<style>
  .issues p {
    margin: 0 0 8px;
    padding: 10px 12px;
    border-radius: 8px;
    font: 0.9rem/1.4 system-ui, sans-serif;
  }
  .issues .warn {
    background: var(--warn-bg);
    color: var(--warn-text);
  }
  .issues .error {
    background: var(--err-bg);
    color: var(--err-text);
  }
  .status {
    font: 0.9rem/1.5 system-ui, sans-serif;
    color: var(--muted);
  }
  .status p {
    margin: 0 0 8px;
  }
  dl {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 20px;
    margin: 0;
  }
  dl div {
    display: flex;
    gap: 6px;
  }
  dt::after {
    content: ':';
  }
  dd {
    margin: 0;
    color: var(--text);
  }
  .filters {
    display: flex;
    gap: 8px;
    margin: 16px 0 4px;
    overflow-x: auto;
    font: 0.9rem system-ui, sans-serif;
  }
  .filters a {
    padding: 6px 12px;
    border: 1px solid var(--line);
    border-radius: 999px;
    text-decoration: none;
    white-space: nowrap;
  }
  .filters a.active {
    background: var(--text);
    color: var(--bg);
    border-color: var(--text);
  }
  .list {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .list li {
    padding: 14px 0;
    border-bottom: 1px solid var(--line);
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 4px;
    font: 0.75rem system-ui, sans-serif;
  }
  .tier {
    font-weight: 600;
  }
  .t1 {
    color: var(--tier1);
  }
  .t2 {
    color: var(--tier2);
  }
  .tag {
    color: var(--muted);
  }
  .title {
    display: block;
    font-size: 1.05rem;
    line-height: 1.35;
    text-decoration: none;
  }
  .src {
    margin-top: 4px;
    color: var(--muted);
    font: 0.8rem system-ui, sans-serif;
  }
  .empty {
    color: var(--muted);
  }
  .pager {
    display: flex;
    justify-content: space-between;
    padding: 16px 0;
    font-family: system-ui, sans-serif;
  }
</style>
