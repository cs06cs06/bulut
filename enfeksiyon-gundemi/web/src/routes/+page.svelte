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

{#if !data.f && data.edition}
  <div class="edition">
    <span>Sayı {data.edition.number} · {new Date(`${data.edition.day}T12:00:00Z`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long', timeZone: 'UTC' })}</span>
    <a href="/baski">Geçmiş baskılar →</a>
  </div>
{/if}

{#if data.weekly}
  <a class="weekly" href="/baski/{data.weekly.id}">
    <span class="kicker">Haftanın öne çıkanları · {data.weekly.range}</span>
    <strong class="brand-font">{data.weekly.title}</strong>
    {#if data.weekly.excerpt}<span class="excerpt">{data.weekly.excerpt}</span>{/if}
    <span class="go">Baskıyı oku →</span>
  </a>
{/if}

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
  .edition {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 10px;
    margin: 10px 2px 0;
    font-size: 0.8rem;
    color: var(--muted);
  }
  .edition a {
    flex: none;
    color: var(--gold);
    text-decoration: none;
    font-weight: 600;
  }
  .weekly {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 14px;
    padding: 16px;
    border-radius: 18px;
    background: linear-gradient(135deg, var(--gold-soft), transparent 70%), var(--surface);
    border: 1px solid var(--gold-line);
    text-decoration: none;
    color: var(--text);
    box-shadow: var(--shadow);
  }
  .weekly .kicker {
    color: var(--gold);
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
  }
  .weekly strong {
    font-size: 1.22rem;
    line-height: 1.25;
  }
  .weekly .excerpt {
    color: var(--text-2);
    font-size: 0.9rem;
    line-height: 1.5;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .weekly .go {
    color: var(--gold);
    font-weight: 600;
    font-size: 0.85rem;
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
