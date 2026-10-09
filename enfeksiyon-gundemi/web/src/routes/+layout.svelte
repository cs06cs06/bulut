<script lang="ts">
  import '@fontsource/playfair-display/latin-700.css';
  import '@fontsource/playfair-display/latin-ext-700.css';
  import '../app.css';
  import { page } from '$app/state';
  import Icon from '$lib/components/Icon.svelte';
  import { toast } from '$lib/toast.svelte';

  let { children, data } = $props();

  const tabs = [
    { href: '/', label: 'Ana Sayfa', icon: 'home' },
    { href: '/kesfet', label: 'Keşfet', icon: 'compass' },
    { href: '/kaydedilenler', label: 'Kaydedilenler', icon: 'bookmark' },
    { href: '/ayarlar', label: 'Ayarlar', icon: 'settings' },
  ] as const;

  const active = (href: string) => (href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href));
  const reading = $derived(page.url.pathname.startsWith('/yazi/'));
</script>

<svelte:head>
  <title>Enfeksiyon Gündemi</title>
</svelte:head>

<div class="app">
  {#if !reading}
    <header>
      <a href="/" class="brand brand-font">Enfeksiyon Gündemi</a>
    </header>
  {/if}

  <main class:reading>
    {@render children()}
  </main>

  {#if toast.msg}
    <div class="toast" role="status">{toast.msg}</div>
  {/if}

  <nav class="tabbar" aria-label="Ana menü">
    {#each tabs as t}
      <a href={t.href} class:active={active(t.href)} aria-current={active(t.href) ? 'page' : undefined}>
        <Icon name={t.icon} filled={t.icon === 'bookmark' && active(t.href)} />
        <span>{t.label}</span>
        {#if t.href === '/' && data.status.unread}<span class="count">{data.status.unread > 99 ? '99+' : data.status.unread}</span>{/if}
      </a>
    {/each}
  </nav>
</div>

<style>
  .app {
    max-width: 640px;
    margin: 0 auto;
    min-height: 100dvh;
  }
  header {
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: calc(14px + env(safe-area-inset-top)) 16px 12px;
    background: var(--glass);
    backdrop-filter: saturate(160%) blur(16px);
    -webkit-backdrop-filter: saturate(160%) blur(16px);
  }
  .brand {
    font-size: 1.32rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    text-decoration: none;
    color: var(--text);
    text-align: center;
  }
  main {
    padding: 4px 16px calc(96px + env(safe-area-inset-bottom));
  }
  main.reading {
    padding-top: 0;
  }
  .tabbar {
    position: fixed;
    left: 50%;
    transform: translateX(-50%);
    bottom: calc(10px + env(safe-area-inset-bottom));
    z-index: 20;
    width: min(calc(100% - 24px), 520px);
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    padding: 6px;
    border-radius: 24px;
    background: var(--glass);
    border: 1px solid var(--line-strong);
    box-shadow: var(--shadow);
    backdrop-filter: saturate(160%) blur(18px);
    -webkit-backdrop-filter: saturate(160%) blur(18px);
  }
  .tabbar a {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    padding: 8px 0 6px;
    border-radius: 18px;
    text-decoration: none;
    font-size: 0.7rem;
    color: var(--muted);
  }
  .tabbar a.active {
    color: var(--gold);
    background: var(--gold-soft);
  }
  .count {
    position: absolute;
    top: 3px;
    left: calc(50% + 6px);
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: 9px;
    background: var(--gold);
    color: var(--bg);
    font-size: 0.65rem;
    font-weight: 700;
    display: grid;
    place-items: center;
  }
  .toast {
    position: fixed;
    left: 50%;
    transform: translateX(-50%);
    bottom: calc(92px + env(safe-area-inset-bottom));
    z-index: 30;
    padding: 10px 16px;
    border-radius: 12px;
    background: var(--text);
    color: var(--bg);
    font-size: 0.88rem;
    box-shadow: var(--shadow);
    max-width: calc(100% - 32px);
  }
</style>
