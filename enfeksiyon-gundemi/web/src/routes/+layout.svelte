<script lang="ts">
  import '@fontsource/playfair-display/latin-700.css';
  import '@fontsource/playfair-display/latin-ext-700.css';
  import '../app.css';
  import { page } from '$app/state';
  import Icon from '$lib/components/Icon.svelte';
  import { toast } from '$lib/toast.svelte';
  import { fmtTime } from '$lib/format';

  let { children, data } = $props();

  const tabs = [
    { href: '/', label: 'Ana Sayfa', icon: 'home' },
    { href: '/kesfet', label: 'Keşfet', icon: 'compass' },
    { href: '/sor', label: 'Sor', icon: 'chat' },
    { href: '/kaydedilenler', label: 'Kaydedilenler', icon: 'bookmark' },
    { href: '/ayarlar', label: 'Ayarlar', icon: 'settings' },
  ] as const;

  const active = (href: string) => (href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href));
  const reading = $derived(page.url.pathname.startsWith('/yazi/'));
  let updOpen = $state(false);
  $effect(() => {
    page.url.pathname; // sayfa değişince balonu kapat
    updOpen = false;
  });
</script>

<svelte:head>
  <title>Enfeksiyon Gündemi</title>
</svelte:head>

<svelte:window onclick={() => (updOpen = false)} />

<div class="app">
  {#if !reading}
    <header>
      <a href="/" class="brand brand-font">Enfeksiyon Gündemi</a>
      <button
        class="upd icon-btn"
        onclick={(e) => {
          e.stopPropagation();
          updOpen = !updOpen;
        }}
        aria-label={data.status.health === 'ok' ? 'Son güncelleme' : 'Son güncelleme — sistemde dikkat gerektiren durum var'}
        aria-expanded={updOpen}
      >
        <Icon name="history" size={21} />
        {#if data.status.health !== 'ok'}<span class="dot {data.status.health}"></span>{/if}
      </button>
      {#if updOpen}
        <div class="upd-pop" role="status">
          {#if data.status.lastCollect}
            <strong>Son güncelleme</strong>
            <span>{fmtTime(data.status.lastCollect)}</span>
            {#if data.status.newRecords}<span class="muted">{data.status.newRecords.toLocaleString('tr-TR')} yeni kayıt tarandı</span>{/if}
          {:else}
            <span>Henüz güncelleme yapılmadı.</span>
          {/if}
          {#each data.status.issues.slice(0, 3) as i}
            <span class="issue {i.level}">{i.text}</span>
          {/each}
          <a class="health-link" href="/saglik">Sistem sağlığı →</a>
        </div>
      {/if}
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
  .upd {
    position: absolute;
    right: 8px;
    top: calc(50% + env(safe-area-inset-top) / 2);
    transform: translateY(-50%);
    color: var(--gold);
  }
  .upd-pop {
    position: absolute;
    right: 12px;
    top: calc(100% - 4px);
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 200px;
    padding: 12px 14px;
    border-radius: 14px;
    background: var(--surface);
    border: 1px solid var(--gold-line);
    box-shadow: var(--shadow);
    font-size: 0.88rem;
    line-height: 1.4;
  }
  .upd-pop strong {
    color: var(--gold);
    font-size: 0.75rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .dot {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    border: 2px solid var(--bg-elev);
  }
  .dot.warn {
    background: #e0a526;
  }
  .dot.error {
    background: #d9534f;
  }
  .upd-pop .issue {
    margin-top: 6px;
    padding-left: 8px;
    border-left: 3px solid #e0a526;
    font-size: 0.82rem;
  }
  .upd-pop .issue.error {
    border-left-color: #d9534f;
  }
  .health-link {
    margin-top: 8px;
    color: var(--gold);
    font-weight: 600;
    font-size: 0.85rem;
    text-decoration: none;
  }
  .upd-pop .muted {
    color: var(--muted);
    font-size: 0.82rem;
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
    grid-template-columns: repeat(5, 1fr);
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
