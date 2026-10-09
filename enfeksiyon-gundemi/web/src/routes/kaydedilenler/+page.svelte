<script lang="ts">
  import Icon from '$lib/components/Icon.svelte';
  import ReviewRow from '$lib/components/ReviewRow.svelte';
  import { showToast } from '$lib/toast.svelte';

  let { data } = $props();
</script>

<h1 class="title">Kaydedilenler</h1>

{#each data.cards as card (card.id)}
  <ReviewRow {card} ontoast={showToast} />
{:else}
  <div class="empty">
    <Icon name="bookmark" size={36} />
    <p>Henüz kaydettiğiniz yazı yok.</p>
    <p class="hint">Bir yazıyı daha sonra okumak için kartındaki yer imi simgesine dokunun.</p>
  </div>
{/each}

<style>
  .title {
    font-size: 1.6rem;
    margin: 8px 0 16px;
    letter-spacing: -0.01em;
  }
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: 48px 16px;
    color: var(--muted);
  }
  .empty p {
    margin: 10px 0 0;
  }
  .hint {
    font-size: 0.88rem;
  }
</style>
