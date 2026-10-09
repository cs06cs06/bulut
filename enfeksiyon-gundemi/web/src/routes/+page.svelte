<script lang="ts">
  import Chips from '$lib/components/Chips.svelte';
  import HeroCard from '$lib/components/HeroCard.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import ReviewRow from '$lib/components/ReviewRow.svelte';
  import { fmtTime } from '$lib/format';
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

{#if status.warnings.length}
  <a class="banner warn" href="/ayarlar#durum">
    <span class="banner-icon"><Icon name="alert" size={20} /></span>
    <span class="banner-text">
      <strong>{status.warnings.length} sistem uyarısı</strong>
      <span>{status.warnings[0].message}</span>
    </span>
  </a>
{:else if status.lastCollect}
  <p class="updated">
    Son güncelleme {fmtTime(status.lastCollect)}{status.newRecords ? ` · ${status.newRecords.toLocaleString('tr-TR')} yeni kayıt tarandı` : ''}
  </p>
{/if}

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
  .banner {
    display: flex;
    gap: 12px;
    align-items: center;
    padding: 12px 14px;
    margin: 6px 0 4px;
    border-radius: 16px;
    text-decoration: none;
    background: linear-gradient(135deg, var(--warn-bg), var(--surface));
    border: 1px solid var(--gold-line);
    color: var(--warn-text);
    box-shadow: var(--shadow);
  }
  .banner-icon {
    display: grid;
    place-items: center;
    width: 38px;
    height: 38px;
    border-radius: 10px;
    background: var(--gold-soft);
    color: var(--gold);
    flex: none;
  }
  .banner-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 0.85rem;
    line-height: 1.35;
    min-width: 0;
  }
  .banner-text strong {
    color: var(--gold);
  }
  .banner-text span {
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  .updated {
    margin: 4px 0 2px;
    font-size: 0.78rem;
    color: var(--muted);
  }
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
