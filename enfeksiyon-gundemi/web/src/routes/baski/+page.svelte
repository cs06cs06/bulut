<script lang="ts">
  import Icon from '$lib/components/Icon.svelte';

  let { data } = $props();
  const longDay = (d: string) =>
    new Date(`${d}T12:00:00Z`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long', timeZone: 'UTC' });
</script>

<svelte:head>
  <title>Baskılar · Enfeksiyon Gündemi</title>
</svelte:head>

<div class="head">
  <a href="/" class="icon-btn" aria-label="Ana sayfaya dön"><Icon name="back" /></a>
  <h1 class="title">Baskılar</h1>
</div>

<h2 class="section-title">Haftanın öne çıkanları</h2>
{#each data.weekly as w (w.id)}
  <a class="weekly" href="/baski/{w.id}">
    <span class="kicker">{w.range} · {w.count} yazı</span>
    <strong class="brand-font">{w.title}</strong>
    {#if w.excerpt}<span class="excerpt">{w.excerpt}</span>{/if}
  </a>
{:else}
  <p class="empty">İlk haftalık baskı pazar sabahı hazırlanacak.</p>
{/each}

<h2 class="section-title">Günlük baskılar</h2>
<ul class="days">
  {#each data.days as d (d.day)}
    <li>
      <a href="/baski/gun/{d.day}">
        <span class="num">Sayı {d.number}</span>
        <span class="main">
          <strong>{longDay(d.day)}</strong>
          <span>{d.n} yazı{d.pc ? ` · ${d.pc} pratiği değiştirebilir` : ''}</span>
          {#if d.lead}<span class="lead">{d.lead}</span>{/if}
        </span>
      </a>
    </li>
  {:else}
    <li class="empty">Henüz baskı yok.</li>
  {/each}
</ul>

<style>
  .head {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 6px 0 4px -8px;
  }
  .head .icon-btn {
    color: var(--text);
  }
  .title {
    font-size: 1.6rem;
    margin: 0;
  }
  .weekly {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 16px;
    margin-bottom: 12px;
    border-radius: 18px;
    background: var(--surface);
    border: 1px solid var(--gold-line);
    text-decoration: none;
    color: var(--text);
  }
  .kicker {
    color: var(--gold);
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .weekly strong {
    font-size: 1.25rem;
    line-height: 1.25;
  }
  .excerpt {
    color: var(--text-2);
    font-size: 0.9rem;
    line-height: 1.5;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .days {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .days a {
    display: flex;
    gap: 14px;
    padding: 12px 0;
    border-bottom: 1px solid var(--line);
    text-decoration: none;
    color: var(--text);
  }
  .num {
    flex: none;
    width: 64px;
    color: var(--gold);
    font-weight: 700;
    font-size: 0.85rem;
    padding-top: 2px;
  }
  .main {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 0.85rem;
    color: var(--muted);
  }
  .main strong {
    color: var(--text);
    font-size: 0.98rem;
    font-weight: 600;
  }
  .lead {
    color: var(--text-2);
    line-height: 1.4;
  }
  .empty {
    color: var(--muted);
    padding: 8px 0 16px;
  }
</style>
