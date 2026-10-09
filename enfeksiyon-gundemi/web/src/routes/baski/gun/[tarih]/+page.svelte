<script lang="ts">
  import Icon from '$lib/components/Icon.svelte';
  import ReviewRow from '$lib/components/ReviewRow.svelte';
  import { showToast } from '$lib/toast.svelte';

  let { data } = $props();
  const longDay = $derived(
    new Date(`${data.day}T12:00:00Z`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long', timeZone: 'UTC' }),
  );
</script>

<svelte:head>
  <title>Sayı {data.number} · Enfeksiyon Gündemi</title>
</svelte:head>

<div class="head">
  <a href="/baski" class="icon-btn" aria-label="Baskılara dön"><Icon name="back" /></a>
  <span class="kicker">Günlük baskı · Sayı {data.number}</span>
</div>
<h1 class="title">{longDay}</h1>

{#each data.cards as card (card.id)}
  <ReviewRow {card} ontoast={showToast} />
{/each}

<style>
  .head {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 6px 0 2px -8px;
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
  .title {
    font-size: 1.4rem;
    margin: 0 0 12px;
  }
</style>
