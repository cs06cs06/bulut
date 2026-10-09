<script lang="ts">
  import { setState, shareWork } from '$lib/actions';
  import type { ReviewCard } from '$lib/server/reviews';
  import Icon from './Icon.svelte';

  let { card, ontoast }: { card: ReviewCard; ontoast?: (msg: string) => void } = $props();
  let saved = $state(false);
  $effect.pre(() => {
    saved = card.saved;
  });

  async function toggleSave(e: Event) {
    e.preventDefault();
    e.stopPropagation();
    saved = !saved;
    const ok = await setState(card.id, { saved });
    if (!ok) {
      saved = !saved;
      ontoast?.('Kaydedilemedi, bağlantıyı kontrol edin');
    } else ontoast?.(saved ? 'Kaydedilenlere eklendi' : 'Kaydedilenlerden çıkarıldı');
  }

  async function share(e: Event) {
    e.preventDefault();
    e.stopPropagation();
    const msg = await shareWork(card);
    if (msg) ontoast?.(msg);
  }
</script>

<div class="actions">
  <button class="icon-btn" class:on={saved} onclick={toggleSave} aria-pressed={saved} aria-label={saved ? 'Kaydedilenlerden çıkar' : 'Kaydet'}>
    <Icon name="bookmark" filled={saved} size={20} />
  </button>
  <button class="icon-btn" onclick={share} aria-label="Orijinal yayını paylaş">
    <Icon name="share" size={20} />
  </button>
</div>

<style>
  .actions {
    display: flex;
    gap: 2px;
    margin-right: -8px;
  }
</style>
