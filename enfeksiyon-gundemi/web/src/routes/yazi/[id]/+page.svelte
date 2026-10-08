<script lang="ts">
  import { BASIS_NOTE, IMPACT_LABEL, MATURITY_LABEL, fmtDay, parseList, sourceLink } from '$lib/format';
  let { data } = $props();
  const r = $derived(data.review as Record<string, any>);
  const b = $derived(data.body);
  const authors = $derived(parseList(r.authors as string));
  const link = $derived(sourceLink({ pmid: r.pmid, doi: r.doi }));
</script>

<svelte:head>
  <title>{r.title_tr} · Enfeksiyon Gündemi</title>
</svelte:head>

<article class={r.impact}>
  <a class="back" href="/">← Tüm yazılar</a>
  <p class="impact">{IMPACT_LABEL[r.impact] ?? r.impact}{r.is_preprint ? ' · ön baskı (hakem değerlendirmesinden geçmemiş)' : ''}</p>
  <h1>{r.title_tr}</h1>
  <p class="hook">{r.hook}</p>

  {#if b.guideline_changes?.length}
    <section>
      <h2>Ne değişti?</h2>
      <ol class="changes">
        {#each b.guideline_changes as c}
          <li class:major={c.significance === 'major'}>
            <span class="was">Eskiden: {c.before}</span>
            <span class="now">Artık: {c.after}</span>
          </li>
        {/each}
      </ol>
      {#if b.guideline_key_points?.length}
        <h3>Değişmeyen ama vurgulanan noktalar</h3>
        <ul>
          {#each b.guideline_key_points as p}<li>{p}</li>{/each}
        </ul>
      {/if}
    </section>
  {/if}

  <section class="shift">
    <div><h2>Önce</h2><p>{b.before}</p></div>
    <div><h2>Şimdi</h2><p>{b.after}</p></div>
  </section>

  <section>
    <h2>Pratikte ne anlama geliyor?</h2>
    <p>{b.in_practice}</p>
  </section>

  <section>
    <h2>Kanıtın gücü <span class="badge">{MATURITY_LABEL[b.evidence.maturity] ?? b.evidence.maturity}</span></h2>
    <p>{b.evidence.design}</p>
    <p>{b.evidence.results}</p>
  </section>

  <section>
    <h2>Sınırlılıklar</h2>
    <p>{b.limitations}</p>
  </section>

  <section>
    <h2>Finansman ve çıkar çatışması</h2>
    <p>{b.funding_coi}</p>
  </section>

  <section>
    <h2>Bağlam</h2>
    <p>{b.context}</p>
    {#if data.related.length}
      <ul class="related">
        {#each data.related as rel}<li><a href="/yazi/{rel.work_id}">{rel.title_tr}</a></li>{/each}
      </ul>
    {/if}
  </section>

  <section>
    <h2>Türkiye bağlamı</h2>
    <p>{b.turkey}</p>
  </section>

  <section class="ref">
    <h2>Künye</h2>
    <p><strong>{r.title}</strong></p>
    {#if authors.length}<p>{authors.length > 6 ? `${authors.slice(0, 6).join(', ')} ve ark.` : authors.join(', ')}</p>{/if}
    <p>{r.journal ?? ''}{r.pub_date ? ` · ${fmtDay(r.pub_date)}` : ''}</p>
    <p>
      {#if r.doi}DOI: <a href="https://doi.org/{r.doi}" target="_blank" rel="noopener noreferrer">{r.doi}</a>{/if}
      {#if r.pmid} · PMID: <a href="https://pubmed.ncbi.nlm.nih.gov/{r.pmid}/" target="_blank" rel="noopener noreferrer">{r.pmid}</a>{/if}
    </p>
    {#if link}<p><a class="orig" href={link} target="_blank" rel="noopener noreferrer">Orijinal yayına git →</a></p>{/if}
    <p class="basis">{BASIS_NOTE[r.basis] ?? ''} Yapay zekâ ile hazırlanmıştır; "Editör yorumu" ile başlayan ifadeler yorumdur.</p>
  </section>
</article>

<style>
  article {
    line-height: 1.6;
  }
  .back {
    font: 0.85rem system-ui, sans-serif;
    color: var(--muted);
    text-decoration: none;
  }
  .impact {
    margin: 16px 0 4px;
    font: 600 0.8rem system-ui, sans-serif;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted);
  }
  .practice_changing .impact {
    color: var(--tier1);
  }
  .important .impact {
    color: var(--tier2);
  }
  h1 {
    font-size: 1.6rem;
    line-height: 1.25;
    margin: 0 0 12px;
  }
  .hook {
    font-size: 1.15rem;
    font-style: italic;
    margin: 0 0 8px;
  }
  section {
    margin-top: 24px;
  }
  h2 {
    font: 600 0.95rem system-ui, sans-serif;
    margin: 0 0 6px;
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  h3 {
    font: 600 0.9rem system-ui, sans-serif;
    margin: 16px 0 4px;
  }
  p {
    margin: 0 0 8px;
  }
  .badge {
    font: 500 0.75rem system-ui, sans-serif;
    padding: 2px 8px;
    border: 1px solid var(--line);
    border-radius: 999px;
    color: var(--muted);
  }
  .shift {
    display: grid;
    grid-template-columns: 1fr;
    gap: 12px;
  }
  @media (min-width: 560px) {
    .shift {
      grid-template-columns: 1fr 1fr;
    }
  }
  .shift div {
    padding: 12px 14px;
    border-radius: 10px;
    background: var(--surface);
    border: 1px solid var(--line);
  }
  .changes {
    padding-left: 20px;
  }
  .changes li {
    margin-bottom: 10px;
  }
  .changes li.major {
    font-weight: 600;
  }
  .changes span {
    display: block;
  }
  .was {
    color: var(--muted);
  }
  .ref {
    border-top: 1px solid var(--line);
    padding-top: 16px;
    font: 0.9rem/1.5 system-ui, sans-serif;
  }
  .orig {
    font-weight: 600;
    color: var(--accent);
  }
  .basis {
    color: var(--muted);
    font-size: 0.8rem;
  }
</style>
