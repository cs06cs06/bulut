<script lang="ts">
  // Yatay kaydırmalı filtre çipleri. Seçim URL'deki ?f= parametresiyle tutulur.
  let { items, current, base = '/', param = 'f' }: { items: { value: string | null; label: string }[]; current: string | null; base?: string; param?: string } = $props();

  const href = (v: string | null) => (v ? `${base}?${param}=${encodeURIComponent(v)}` : base);
</script>

<nav class="chips" aria-label="Filtre">
  {#each items as it}
    <a class="chip" class:active={current === it.value} href={href(it.value)} data-sveltekit-noscroll data-sveltekit-replacestate>{it.label}</a>
  {/each}
</nav>

<style>
  .chips {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    scrollbar-width: none;
    margin: 6px -16px 4px;
    padding: 4px 16px;
    scroll-padding: 16px;
  }
  .chips::-webkit-scrollbar {
    display: none;
  }
  .chip {
    flex: none;
    padding: 8px 15px;
    border-radius: 999px;
    border: 1px solid var(--line-strong);
    background: var(--surface);
    color: var(--text-2);
    font-size: 0.88rem;
    text-decoration: none;
    white-space: nowrap;
  }
  .chip.active {
    color: var(--gold);
    border-color: var(--gold-line);
    background: var(--gold-soft);
    box-shadow: 0 0 18px var(--gold-soft);
    font-weight: 600;
  }
</style>
