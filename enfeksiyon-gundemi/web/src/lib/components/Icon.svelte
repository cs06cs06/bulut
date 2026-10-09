<script lang="ts">
  // Arayüz simgeleri (çizgi stili, 24×24)
  type Name = 'history' | 'home' | 'compass' | 'bookmark' | 'settings' | 'bell' | 'share' | 'search' | 'alert' | 'back' | 'external' | 'check' | 'chat' | 'send';
  let { name, filled = false, size = 22 }: { name: Name; filled?: boolean; size?: number } = $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill={filled ? 'currentColor' : 'none'}
  stroke="currentColor"
  stroke-width="1.8"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  {#if name === 'history'}
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" fill="none" /><path d="M3 3v5h5" fill="none" /><path d="M12 7v5l3.5 2" fill="none" />
  {:else if name === 'home'}
    <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />
  {:else if name === 'compass'}
    <circle cx="12" cy="12" r="9" fill="none" /><path d="m15.5 8.5-2 5-5 2 2-5z" />
  {:else if name === 'bookmark'}
    <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4.5L5 21V4a1 1 0 0 1 1-1z" />
  {:else if name === 'settings'}
    <circle cx="12" cy="12" r="3" fill="none" />
    <path
      fill="none"
      d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"
    />
  {:else if name === 'bell'}
    <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" fill="none" />
  {:else if name === 'share'}
    <path d="M12 3v12M7 8l5-5 5 5" fill="none" /><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" fill="none" />
  {:else if name === 'search'}
    <circle cx="11" cy="11" r="7" fill="none" /><path d="m20 20-3.5-3.5" />
  {:else if name === 'alert'}
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" fill="none" />
  {:else if name === 'back'}
    <path d="M15 18 9 12l6-6" fill="none" />
  {:else if name === 'external'}
    <path d="M14 4h6v6M20 4l-9 9" fill="none" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" fill="none" />
  {:else if name === 'check'}
    <path d="M5 12.5 10 17l9-10" fill="none" />
  {:else if name === 'chat'}
    <path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-9l-5 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" /><path d="M8 10h8M8 13h5" fill="none" />
  {:else if name === 'send'}
    <path d="M12 19V5M6 11l6-6 6 6" fill="none" />
  {/if}
</svg>
