<script lang="ts">
  import Icon from '$lib/components/Icon.svelte';
  import ReviewRow from '$lib/components/ReviewRow.svelte';
  import { IMPACT_SHORT } from '$lib/format';
  import { showToast } from '$lib/toast.svelte';

  let { data } = $props();
  const paragraphs = $derived(data.issue.intro.split(/\n\s*\n/).filter((p) => p.trim()));
</script>

<svelte:head>
  <title>{data.issue.title} · Enfeksiyon Gündemi</title>
</svelte:head>

<div class="head">
  <a href="/baski" class="icon-btn" aria-label="Baskılara dön"><Icon name="back" /></a>
  <span class="kicker">Haftanın öne çıkanları · {data.issue.range}</span>
</div>

<h1 class="brand-font">{data.issue.title}</h1>

<section class="intro">
  <span class="label">Editörden</span>
  {#each paragraphs as p}<p>{p}</p>{/each}
</section>

<h2 class="section-title">{data.top.length === 1 ? 'Bu haftanın en önemli gelişmesi' : `Bu haftanın en önemli ${['', '', 'iki', 'üç'][data.top.length]} gelişmesi`}</h2>
<ol class="top">
  {#each data.top as t}
    <li>
      <span class="rank">{t.rank}</span>
      <div>
        <span class="badge {t.card!.impact}">{IMPACT_SHORT[t.card!.impact] ?? t.card!.impact}</span>
        {#if t.card!.is_preprint}<span class="pre">ön baskı</span>{/if}
        <a href="/yazi/{t.card!.id}">{t.card!.title_tr}</a>
        <p>{t.why}</p>
      </div>
    </li>
  {/each}
</ol>

{#if data.others.length}
  <h2 class="section-title">Haftanın diğer yazıları</h2>
  {#each data.others as card (card!.id)}
    <ReviewRow card={card!} ontoast={showToast} />
  {/each}
{/if}

<p class="disclaimer">Yapay zekâ ile hazırlanmıştır. Bu uygulama klinik karar destek aracı değil, kişisel bir literatür takip aracıdır.</p>

<style>
  .head {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 6px 0 6px -8px;
  }
  .head .icon-btn {
    color: var(--text);
  }
  .kicker {
    color: var(--gold);
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  h1 {
    font-size: 1.7rem;
    line-height: 1.2;
    margin: 4px 0 16px;
  }
  .intro {
    padding: 16px;
    border-radius: 16px;
    background: var(--gold-soft);
    border: 1px solid var(--gold-line);
    line-height: 1.65;
  }
  .intro .label {
    display: block;
    color: var(--gold);
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin-bottom: 6px;
  }
  .intro p {
    margin: 0 0 10px;
  }
  .intro p:last-child {
    margin-bottom: 0;
  }
  .top {
    list-style: none;
    margin: 0 0 8px;
    padding: 0;
  }
  .top li {
    display: flex;
    gap: 14px;
    padding: 14px 0;
    border-bottom: 1px solid var(--line);
  }
  .rank {
    flex: none;
    font-family: 'Playfair Display', Georgia, serif;
    font-size: 2rem;
    line-height: 1;
    color: var(--gold);
    width: 28px;
  }
  .top a {
    display: block;
    margin: 6px 0 4px;
    color: var(--text);
    font-weight: 600;
    font-size: 1.02rem;
    line-height: 1.35;
    text-decoration: none;
  }
  .top p {
    margin: 0;
    color: var(--text-2);
    font-size: 0.9rem;
    line-height: 1.5;
  }
  .pre {
    margin-left: 6px;
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .disclaimer {
    margin: 28px 0 8px;
    text-align: center;
    font-size: 0.75rem;
    color: var(--muted);
  }
</style>
