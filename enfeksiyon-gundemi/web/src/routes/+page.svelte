<script lang="ts">
  import { IMPACT_LABEL, fmtDay, fmtTime, sourceLink } from '$lib/format';
  let { data } = $props();
</script>

{#if data.issues.length}
  <section class="issues" aria-label="Uyarılar">
    {#each data.issues as i}
      <p class={i.level}>{i.message}</p>
    {/each}
  </section>
{/if}

<p class="status">
  Son toplama: {fmtTime(data.lastRuns.collect)} · Son değerlendirme: {fmtTime(data.lastRuns.process)}
  · <a href="/kayitlar">Tüm kayıtlar</a>
</p>

<h2>Editör yazıları</h2>
{#if data.reviews.length === 0}
  <p class="empty">Henüz editör yazısı yok. İlk değerlendirmeler tamamlandığında burada görünecek.</p>
{/if}
<ol class="cards">
  {#each data.reviews as r (r.id)}
    <li class="card {r.impact}">
      <a href="/yazi/{r.id}">
        <span class="impact">{IMPACT_LABEL[r.impact] ?? r.impact}{r.is_preprint ? ' · ön baskı' : ''}</span>
        <strong class="title">{r.title_tr}</strong>
        <span class="hook">{r.hook}</span>
        <span class="src">{r.journal_abbr ?? r.journal ?? ''}{r.pub_date ? ` · ${fmtDay(r.pub_date)}` : ''}</span>
      </a>
    </li>
  {/each}
</ol>

{#if data.notes.length}
  <h2>Kısa notlar</h2>
  <ol class="notes">
    {#each data.notes as n (n.id)}
      <li>
        <strong>{n.title_tr ?? n.title}</strong>
        <p>{n.summary_tr}</p>
        <span class="src">
          {n.journal_abbr ?? n.journal ?? ''}{n.pub_date ? ` · ${fmtDay(n.pub_date)}` : ''}
          {#if sourceLink(n)}· <a href={sourceLink(n)} target="_blank" rel="noopener noreferrer">kaynak</a>{/if}
        </span>
      </li>
    {/each}
  </ol>
{/if}

<style>
  .issues p {
    margin: 0 0 8px;
    padding: 10px 12px;
    border-radius: 8px;
    font: 0.9rem/1.4 system-ui, sans-serif;
  }
  .issues .warn {
    background: var(--warn-bg);
    color: var(--warn-text);
  }
  .issues .error {
    background: var(--err-bg);
    color: var(--err-text);
  }
  .status {
    color: var(--muted);
    font: 0.8rem/1.5 system-ui, sans-serif;
    margin: 0 0 8px;
  }
  h2 {
    font-size: 1.15rem;
    margin: 24px 0 8px;
  }
  .empty {
    color: var(--muted);
  }
  .cards,
  .notes {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .card {
    margin: 0 0 12px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--surface);
  }
  .card a {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 14px 16px;
    text-decoration: none;
  }
  .card.practice_changing {
    border-left: 4px solid var(--tier1);
  }
  .card.important {
    border-left: 4px solid var(--tier2);
  }
  .impact {
    font: 600 0.75rem system-ui, sans-serif;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .practice_changing .impact {
    color: var(--tier1);
  }
  .important .impact {
    color: var(--tier2);
  }
  .title {
    font-size: 1.1rem;
    line-height: 1.3;
  }
  .hook {
    line-height: 1.45;
  }
  .src {
    color: var(--muted);
    font: 0.8rem system-ui, sans-serif;
  }
  .notes li {
    padding: 12px 0;
    border-bottom: 1px solid var(--line);
  }
  .notes p {
    margin: 4px 0;
    line-height: 1.45;
  }
</style>
