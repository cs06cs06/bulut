<script lang="ts">
  import Chips from '$lib/components/Chips.svelte';
  import HeroCard from '$lib/components/HeroCard.svelte';
  import ReviewRow from '$lib/components/ReviewRow.svelte';
  import { TOPIC_NAME } from '$lib/topics';
  import { showToast } from '$lib/toast.svelte';

  let { data } = $props();
  const status = $derived(data.status);

  const chips = $derived([
    { value: null, label: 'Tümü' },
    { value: 'yeni', label: status.unread ? `Yeni · ${status.unread}` : 'Yeni' },
    { value: 'pratik', label: 'Pratiği değiştirebilir' },
    { value: 'onemli', label: 'Önemli' },
    ...data.topicChips.map((k) => ({ value: `konu:${k}`, label: TOPIC_NAME[k] ?? k })),
    { value: 'bilgi', label: 'Bilgi için' },
    { value: 'onbaski', label: 'Ön baskılar' },
  ]);
  const currentLabel = $derived(chips.find((c) => c.value === data.f)?.label ?? '');
</script>

<Chips items={chips} current={data.f} />

{#if data.hero.length}
  <h2 class="section-title">Günün Önemli Gelişmeleri</h2>
  <div class="carousel">
    {#each data.hero as card (card.id)}
      <HeroCard {card} ontoast={showToast} />
    {/each}
  </div>
{/if}

<h2 class="section-title">{data.f ? currentLabel : data.hero.length ? 'Sizin İçin Seçilenler' : 'Editör yazıları'}</h2>
{#each data.list as card (card.id)}
  <ReviewRow {card} ontoast={showToast} />
{:else}
  <p class="empty">
    {#if data.f === 'yeni'}Tüm yazıları okudunuz. Yeni yazılar her sabah gelir.{:else if data.f}Bu filtrede yazı yok.{:else}Henüz editör yazısı yok. İlk değerlendirmeler tamamlandığında burada görünecek.{/if}
  </p>
{/each}

<p class="disclaimer">Bu uygulama klinik karar destek aracı değil, kişisel bir literatür takip aracıdır.</p>

<style>
  .carousel {
    display: flex;
    gap: 14px;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    scrollbar-width: none;
    margin: 0 -16px;
    padding: 2px 16px 8px;
    scroll-padding: 16px;
  }
  .carousel::-webkit-scrollbar {
    display: none;
  }
  .empty {
    color: var(--muted);
    padding: 24px 4px;
  }
  .disclaimer {
    margin: 32px 0 8px;
    text-align: center;
    font-size: 0.75rem;
    color: var(--muted);
  }
</style>
