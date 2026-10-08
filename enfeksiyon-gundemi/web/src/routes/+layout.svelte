<script lang="ts">
  let { children } = $props();
</script>

<svelte:head>
  <title>Enfeksiyon Gündemi</title>
</svelte:head>

<div class="shell">
  <header>
    <a href="/" class="brand">Enfeksiyon Gündemi</a>
  </header>
  <main>
    {@render children()}
  </main>
  <footer>
    Bu uygulama klinik karar destek aracı değil, kişisel bir literatür takip aracıdır.
  </footer>
</div>

<style>
  :global(:root) {
    --bg: #fbfaf7;
    --surface: #ffffff;
    --text: #1d1d1b;
    --muted: #6b6a66;
    --line: #e7e4dd;
    --accent: #9b2c2c;
    --tier1: #9b2c2c;
    --tier2: #8a6d1f;
    --warn-bg: #fff6e0;
    --warn-text: #6d4c00;
    --err-bg: #fdecec;
    --err-text: #8a1c1c;
    color-scheme: light dark;
  }
  @media (prefers-color-scheme: dark) {
    :global(:root) {
      --bg: #151514;
      --surface: #1e1e1c;
      --text: #ecebe6;
      --muted: #a4a39d;
      --line: #33322f;
      --accent: #e38b8b;
      --tier1: #e38b8b;
      --tier2: #d8b65e;
      --warn-bg: #3a2f12;
      --warn-text: #f2d58a;
      --err-bg: #3d1a1a;
      --err-text: #f3b0b0;
    }
  }
  :global(html, body) {
    margin: 0;
    background: var(--bg);
    color: var(--text);
    font-family: Charter, 'Iowan Old Style', Georgia, serif;
    -webkit-text-size-adjust: 100%;
  }
  :global(a) {
    color: inherit;
  }
  .shell {
    max-width: 44rem;
    margin: 0 auto;
    padding: 0 16px;
  }
  header {
    padding: 20px 0 12px;
    border-bottom: 1px solid var(--line);
  }
  .brand {
    font-size: 1.5rem;
    font-weight: 700;
    letter-spacing: -0.01em;
    text-decoration: none;
  }
  main {
    padding: 16px 0 32px;
  }
  footer {
    border-top: 1px solid var(--line);
    padding: 16px 0 32px;
    color: var(--muted);
    font-size: 0.85rem;
    font-family: system-ui, sans-serif;
  }
</style>
