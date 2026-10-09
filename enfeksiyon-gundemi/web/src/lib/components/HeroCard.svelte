<script lang="ts">
  import { IMPACT_LABEL, fmtDay } from '$lib/format';
  import type { ReviewCard } from '$lib/server/reviews';
  import { visualFor } from '$lib/topics';
  import CardActions from './CardActions.svelte';
  import TopicArt from './TopicArt.svelte';

  let { card, ontoast }: { card: ReviewCard; ontoast?: (msg: string) => void } = $props();
  const v = $derived(visualFor(card.topics));
</script>

<article class="hero {card.impact} card-link">
  <TopicArt motif={v.motif} hue={v.hue} size="hero" />
  <div class="shade"></div>
  <div class="content">
    <div class="top">
      <span class="badge {card.impact}">{IMPACT_LABEL[card.impact] ?? card.impact}</span>
      {#if !card.read}<span class="new">Yeni</span>{/if}
      {#if card.is_preprint}<span class="pre">Ön baskı</span>{/if}
    </div>
    <h3><a class="stretch" href="/yazi/{card.id}">{card.title_tr}</a></h3>
    <p class="hook">{card.hook}</p>
    <div class="bottom">
      <span class="meta">{card.journal ?? ''}{card.pub_date ? ` · ${fmtDay(card.pub_date)}` : ''}</span>
      <CardActions {card} {ontoast} />
    </div>
  </div>
</article>

<style>
  .hero {
    position: relative;
    display: block;
    flex-shrink: 0;
    min-height: 268px;
    border-radius: 22px;
    overflow: hidden;
    text-decoration: none;
    color: #f3efe6;
    border: 1px solid var(--line-strong);
    box-shadow: var(--shadow);
    scroll-snap-align: start;
    flex: 0 0 86%;
    max-width: 420px;
  }
  .hero::before {
    content: '';
    position: absolute;
    left: 0;
    top: 18px;
    bottom: 18px;
    width: 4px;
    border-radius: 0 4px 4px 0;
    background: #e2b45c;
    z-index: 2;
  }
  .hero.practice_changing::before {
    background: #ff9a7a;
  }
  .hero.informational::before {
    background: #a3a9b6;
  }
  .shade {
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, rgba(8, 10, 14, 0.15) 0%, rgba(8, 10, 14, 0.55) 45%, rgba(8, 10, 14, 0.88) 100%);
  }
  .content {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 268px;
    padding: 20px 20px 12px 24px;
  }
  .top {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }
  /* Kart her temada koyu zeminli olduğu için rozetleri koyu tema renkleriyle sabitliyoruz */
  .top :global(.badge.important) {
    color: #e2b45c;
    background: rgba(226, 180, 92, 0.16);
    border-color: rgba(226, 180, 92, 0.5);
  }
  .top :global(.badge.practice_changing) {
    color: #ff9a7a;
    background: rgba(255, 154, 122, 0.15);
    border-color: rgba(255, 154, 122, 0.5);
  }
  .top :global(.badge.informational) {
    color: #c3c8d2;
    background: rgba(195, 200, 210, 0.12);
    border-color: rgba(195, 200, 210, 0.35);
  }
  .new,
  .pre {
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: #0d1016;
    background: #e2b45c;
    padding: 3px 8px;
    border-radius: 999px;
  }
  .pre {
    background: rgba(255, 255, 255, 0.85);
  }
  h3 {
    margin: auto 0 0;
    font-size: 1.42rem;
    line-height: 1.22;
    font-weight: 700;
    letter-spacing: -0.01em;
    text-wrap: balance;
  }
  .hook {
    margin: 0;
    font-size: 0.95rem;
    line-height: 1.45;
    color: rgba(243, 239, 230, 0.82);
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .bottom {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .meta {
    font-size: 0.82rem;
    color: rgba(243, 239, 230, 0.65);
  }
  .bottom :global(.icon-btn) {
    color: rgba(243, 239, 230, 0.75);
  }
  .bottom :global(.icon-btn.on) {
    color: #e2b45c;
  }
  .hero:has(.stretch:active) {
    transform: scale(0.99);
  }
  .stretch {
    color: inherit;
    text-decoration: none;
  }
  .stretch::after {
    content: '';
    position: absolute;
    inset: 0;
    z-index: 0;
  }
  .top,
  .bottom :global(.actions) {
    position: relative;
    z-index: 1;
  }
</style>
