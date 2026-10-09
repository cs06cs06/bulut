<script lang="ts">
  import { IMPACT_SHORT, fmtDay } from '$lib/format';
  import type { ReviewCard } from '$lib/server/reviews';
  import { visualFor } from '$lib/topics';
  import CardActions from './CardActions.svelte';
  import TopicArt from './TopicArt.svelte';

  let { card, ontoast }: { card: ReviewCard; ontoast?: (msg: string) => void } = $props();
  const v = $derived(visualFor(card.topics));
</script>

<article class="row card-link {card.impact}" class:read={card.read}>
  <div class="body">
    <div class="tags">
      {#if !card.read}<span class="unread-dot" title="Okunmadı"></span>{/if}
      <span class="badge {card.impact}">{IMPACT_SHORT[card.impact] ?? card.impact}</span>
      {#if card.is_preprint}<span class="pre">ön baskı</span>{/if}
    </div>
    <h3><a class="stretch" href="/yazi/{card.id}">{card.title_tr}</a></h3>
    <div class="foot">
      <span class="meta">{card.journal ?? ''}{card.pub_date ? ` · ${fmtDay(card.pub_date)}` : ''}</span>
      <CardActions {card} {ontoast} />
    </div>
  </div>
  <TopicArt motif={v.motif} hue={v.hue} />
</article>

<style>
  .row {
    position: relative;
    display: flex;
    gap: 14px;
    align-items: stretch;
    padding: 14px 14px 8px 16px;
    margin-bottom: 12px;
    border-radius: 18px;
    background: var(--surface);
    border: 1px solid var(--line);
    text-decoration: none;
    box-shadow: var(--shadow);
  }
  .row:has(.stretch:active) {
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
  }
  .foot :global(.actions) {
    position: relative;
    z-index: 1;
  }
  .body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .tags {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .pre {
    font-size: 0.7rem;
    color: var(--muted);
  }
  h3 {
    margin: 0;
    font-size: 1.02rem;
    line-height: 1.3;
    font-weight: 650;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .row.read h3 {
    font-weight: 500;
    color: var(--text-2);
  }
  .row.informational h3 {
    font-size: 0.97rem;
  }
  .foot {
    margin-top: auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }
  .meta {
    font-size: 0.8rem;
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .row > :global(.art) {
    align-self: flex-start;
  }
</style>
