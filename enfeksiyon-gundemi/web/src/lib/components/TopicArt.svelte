<script lang="ts">
  // Konuya özel çizgi çizim (fotoğraf yerine). Renk ve motif konu etiketinden gelir.
  import type { Motif } from '$lib/topics';

  let { motif, hue, size = 'tile' }: { motif: Motif; hue: number; size?: 'tile' | 'hero' } = $props();
</script>

<div class="art {size}" style="--h: {hue}" aria-hidden="true">
  <svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    {#if motif === 'virus'}
      <circle cx="50" cy="50" r="20" />
      {#each Array(10) as _, i}
        {@const a = (i * Math.PI) / 5}
        <line x1={50 + 20 * Math.cos(a)} y1={50 + 20 * Math.sin(a)} x2={50 + 31 * Math.cos(a)} y2={50 + 31 * Math.sin(a)} />
        <circle cx={50 + 34 * Math.cos(a)} cy={50 + 34 * Math.sin(a)} r="3" />
      {/each}
      <circle cx="44" cy="45" r="3" /><circle cx="56" cy="54" r="4" /><circle cx="46" cy="58" r="2" />
    {:else if motif === 'capsule'}
      <g transform="rotate(-35 50 50)">
        <rect x="22" y="38" width="56" height="24" rx="12" />
        <line x1="50" y1="38" x2="50" y2="62" />
      </g>
      <circle cx="26" cy="74" r="5" /><circle cx="76" cy="26" r="4" />
    {:else if motif === 'shield'}
      <path d="M50 18 L76 28 V50 C76 66 64 77 50 83 C36 77 24 66 24 50 V28 Z" />
      <path d="M38 50 L47 59 L63 41" />
    {:else if motif === 'droplet'}
      <path d="M50 16 C62 34 72 46 72 60 A22 22 0 0 1 28 60 C28 46 38 34 50 16 Z" />
      <circle cx="44" cy="62" r="4" /><circle cx="56" cy="56" r="3" />
    {:else if motif === 'lungs'}
      <path d="M50 18 V46 M50 46 C44 50 40 50 38 46 M50 46 C56 50 60 50 62 46" />
      <path d="M38 34 C28 36 20 52 20 68 C20 78 28 82 36 78 C42 75 44 68 44 58 V40 C44 36 41 33 38 34 Z" />
      <path d="M62 34 C72 36 80 52 80 68 C80 78 72 82 64 78 C58 75 56 68 56 58 V40 C56 36 59 33 62 34 Z" />
    {:else if motif === 'rod'}
      <g transform="rotate(-25 50 50)">
        <rect x="24" y="40" width="44" height="18" rx="9" />
        <path d="M68 49 C74 44 78 54 84 49 C88 46 90 50 92 48" />
        <path d="M24 49 C18 54 14 44 8 49" />
      </g>
      <rect x="30" y="66" width="26" height="11" rx="5.5" transform="rotate(15 43 71)" />
    {:else if motif === 'spores'}
      <circle cx="40" cy="44" r="13" /><circle cx="62" cy="38" r="9" /><circle cx="60" cy="62" r="11" />
      <circle cx="36" cy="68" r="6" /><line x1="40" y1="57" x2="40" y2="80" /><line x1="60" y1="73" x2="62" y2="84" />
    {:else if motif === 'globe'}
      <circle cx="50" cy="50" r="28" />
      <ellipse cx="50" cy="50" rx="12" ry="28" />
      <line x1="22" y1="50" x2="78" y2="50" /><path d="M26 36 H74 M26 64 H74" />
    {:else if motif === 'syringe'}
      <g transform="rotate(-40 50 50)">
        <rect x="28" y="42" width="38" height="16" rx="3" />
        <line x1="66" y1="50" x2="84" y2="50" /><line x1="20" y1="40" x2="20" y2="60" /><line x1="20" y1="50" x2="28" y2="50" />
        <line x1="38" y1="42" x2="38" y2="50" /><line x1="46" y1="42" x2="46" y2="50" /><line x1="54" y1="42" x2="54" y2="50" />
      </g>
    {:else if motif === 'cell'}
      <circle cx="50" cy="50" r="27" />
      <circle cx="54" cy="46" r="10" />
      <path d="M30 34 C36 30 40 30 44 34 M64 70 C68 66 72 66 74 62" />
    {:else if motif === 'dish'}
      <ellipse cx="50" cy="56" rx="32" ry="14" />
      <path d="M18 56 V48 C18 40 32 34 50 34 C68 34 82 40 82 48 V56" />
      <circle cx="40" cy="55" r="3" /><circle cx="54" cy="58" r="4" /><circle cx="62" cy="52" r="2.5" /><circle cx="47" cy="50" r="2" />
    {:else}
      <path d="M50 78 C30 64 20 52 20 40 C20 30 28 24 36 24 C42 24 47 28 50 33 C53 28 58 24 64 24 C72 24 80 30 80 40 C80 52 70 64 50 78 Z" />
      <path d="M30 50 H42 L46 42 L52 58 L56 50 H70" />
    {/if}
  </svg>
</div>

<style>
  .art {
    --tone: hsl(var(--h) 70% 62%);
    position: relative;
    overflow: hidden;
    color: var(--tone);
    background:
      radial-gradient(120% 90% at 85% 15%, hsl(var(--h) 60% 50% / 0.35), transparent 60%),
      linear-gradient(145deg, hsl(var(--h) 35% 22%), hsl(var(--h) 30% 12%));
  }
  .tile {
    width: 84px;
    height: 84px;
    border-radius: 14px;
    flex: none;
  }
  .tile svg {
    width: 100%;
    height: 100%;
    padding: 12px;
  }
  .hero {
    position: absolute;
    inset: 0;
    border-radius: inherit;
  }
  .hero svg {
    position: absolute;
    right: -6%;
    top: -8%;
    width: 72%;
    height: auto;
    opacity: var(--art-alpha);
    stroke-width: 1.6;
  }
</style>
