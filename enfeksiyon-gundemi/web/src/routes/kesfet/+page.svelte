<script lang="ts">
  import Chips from '$lib/components/Chips.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import { fmtDay, sourceLink } from '$lib/format';
  import { TOPICS } from '$lib/topics';

  let { data } = $props();

  const chips = [
    { value: null, label: 'Tümü' },
    { value: 'onbaski', label: 'Ön baskılar' },
    ...TOPICS.map((t) => ({ value: `konu:${t.kod}`, label: t.ad })),
  ];
</script>

<h1 class="title">Keşfet</h1>

<form class="search" method="GET" action="/kesfet" role="search">
  <Icon name="search" size={20} />
  <input name="q" type="search" value={data.q} placeholder="Kısa notlarda ara: karbapenem, kandida, aşı…" enterkeyhint="search" autocomplete="off" />
  {#if data.f}<input type="hidden" name="f" value={data.f} />{/if}
</form>

<Chips items={chips} current={data.f} base="/kesfet" />

<h2 class="section-title">{data.q ? 'Kısa notlar ve diğer yayınlar' : 'Kısa notlar'}</h2>
{#each data.notes as n (n.id)}
  <div class="note">
    <div class="nhead">
      <span class="imp" title="Önem puanı">{'●'.repeat(Math.max(1, Math.min(5, n.importance)))}</span>
      {#if n.is_preprint}<span class="pre">ön baskı</span>{/if}
    </div>
    <strong>{n.title_tr ?? n.title}</strong>
    {#if n.summary_tr}<p>{n.summary_tr}</p>{/if}
    <span class="meta">
      {n.journal ?? ''}{n.pub_date ? ` · ${fmtDay(n.pub_date)}` : ''}
      {#if sourceLink(n)}· <a href={sourceLink(n)} target="_blank" rel="noopener noreferrer">kaynak</a>{/if}
    </span>
  </div>
{:else}
  <p class="empty">Kayıt bulunamadı.</p>
{/each}

<a class="all" href="/kayitlar">Toplanan tüm kayıtlar (triyajda elenenler dahil) →</a>

<style>
  .title {
    font-size: 1.6rem;
    margin: 8px 0 12px;
    letter-spacing: -0.01em;
  }
  .search {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 14px;
    border-radius: 14px;
    background: var(--surface);
    border: 1px solid var(--line-strong);
    color: var(--muted);
  }
  .search:focus-within {
    border-color: var(--gold-line);
    box-shadow: 0 0 0 3px var(--gold-soft);
  }
  .search input {
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    color: var(--text);
    font: inherit;
    font-size: 1rem;
    padding: 13px 0;
  }
  .empty {
    color: var(--muted);
  }
  .note {
    padding: 14px 0;
    border-bottom: 1px solid var(--line);
  }
  .nhead {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-bottom: 4px;
  }
  .imp {
    color: var(--gold);
    font-size: 0.55rem;
    letter-spacing: 2px;
  }
  .pre {
    font-size: 0.72rem;
    color: var(--muted);
  }
  .note strong {
    line-height: 1.35;
  }
  .note p {
    margin: 6px 0;
    color: var(--text-2);
    line-height: 1.5;
    font-size: 0.93rem;
  }
  .meta {
    font-size: 0.8rem;
    color: var(--muted);
  }
  .meta a,
  .all {
    color: var(--gold);
  }
  .all {
    display: block;
    margin: 24px 0 8px;
    font-size: 0.9rem;
    text-decoration: none;
  }
</style>
