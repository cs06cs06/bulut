<script lang="ts">
  import { onMount } from 'svelte';
  import { invalidate } from '$app/navigation';
  import { setState, shareWork } from '$lib/actions';
  import Icon from '$lib/components/Icon.svelte';
  import TopicArt from '$lib/components/TopicArt.svelte';
  import { BASIS_NOTE, IMPACT_LABEL, MATURITY_LABEL, fmtDay, parseList, sourceLink } from '$lib/format';
  import { parseTopics, visualFor } from '$lib/topics';
  import { showToast } from '$lib/toast.svelte';

  let { data } = $props();
  const r = $derived(data.review as Record<string, any>);
  const b = $derived(data.body);
  const authors = $derived(parseList(r.authors as string));
  const link = $derived(sourceLink({ pmid: r.pmid, doi: r.doi, url: r.url }));
  const linkedLink = $derived(r.linked_id ? sourceLink({ pmid: r.linked_pmid, doi: r.linked_doi, url: r.linked_url }) : null);
  const topics = $derived(parseTopics(r.topics as string));
  const v = $derived(visualFor(topics));
  let saved = $state(false);
  $effect.pre(() => {
    saved = r.saved_at != null;
  });

  onMount(() => {
    // Açılan yazı okundu sayılır (önceden yükleme sırasında değil, gerçekten açılınca)
    if (r.read_at == null) setState(r.id, { read: true }).then(() => invalidate('app:durum'));
  });

  async function toggleSave() {
    saved = !saved;
    if (await setState(r.id, { saved })) showToast(saved ? 'Kaydedilenlere eklendi' : 'Kaydedilenlerden çıkarıldı');
    else {
      saved = !saved;
      showToast('Kaydedilemedi, bağlantıyı kontrol edin');
    }
  }
  async function share() {
    const msg = await shareWork({ title_tr: r.title_tr, hook: r.hook, doi: r.doi, pmid: r.pmid, url: r.url });
    if (msg) showToast(msg);
  }
  function back() {
    if (history.length > 1) history.back();
    else location.href = '/';
  }
</script>

<svelte:head>
  <title>{r.title_tr} · Enfeksiyon Gündemi</title>
</svelte:head>

<div class="topbar">
  <button class="icon-btn" onclick={back} aria-label="Geri"><Icon name="back" /></button>
  <div class="tb-actions">
    <button class="icon-btn" class:on={saved} onclick={toggleSave} aria-pressed={saved} aria-label={saved ? 'Kaydedilenlerden çıkar' : 'Kaydet'}>
      <Icon name="bookmark" filled={saved} />
    </button>
    <button class="icon-btn" onclick={share} aria-label="Orijinal yayını paylaş"><Icon name="share" /></button>
  </div>
</div>

<header class="cover {r.impact}">
  <TopicArt motif={v.motif} hue={v.hue} size="hero" />
  <div class="shade"></div>
  <div class="cover-content">
    <div class="badges">
      <span class="badge {r.impact}">{IMPACT_LABEL[r.impact] ?? r.impact}</span>
      {#if r.is_preprint}<span class="pre">Ön baskı · hakem değerlendirmesinden geçmemiş</span>{/if}
    </div>
    <h1>{r.title_tr}</h1>
    <p class="meta">{r.journal_abbr ?? r.journal ?? ''}{r.pub_date ? ` · ${fmtDay(r.pub_date)}` : ''}</p>
  </div>
</header>

<article>
  <p class="hook">{r.hook}</p>

  {#if r.linked_id}
    <p class="linked">
      {#if r.is_preprint}
        Bu ön baskının hakemli dergide yayımlanmış hâli var{r.linked_journal ? ` (${r.linked_journal})` : ''}.
      {:else}
        Bu çalışma daha önce ön baskı olarak paylaşılmıştı.
      {/if}
      {#if r.linked_review}<a href="/yazi/{r.linked_review}">Diğer yazıya git</a>
      {:else if linkedLink}<a href={linkedLink} target="_blank" rel="noopener noreferrer">{r.is_preprint ? 'Dergi yayını' : 'Ön baskı'}</a>{/if}
    </p>
  {/if}

  {#if b.guideline_changes?.length}
    <section class="box gold">
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
    <div class="box"><h2>Önce</h2><p>{b.before}</p></div>
    <div class="box gold"><h2>Şimdi</h2><p>{b.after}</p></div>
  </section>

  <section>
    <h2>Pratikte ne anlama geliyor?</h2>
    <p class="lead">{b.in_practice}</p>
  </section>

  <section>
    <h2>Kanıtın gücü <span class="mbadge {b.evidence.maturity}">{MATURITY_LABEL[b.evidence.maturity] ?? b.evidence.maturity}</span></h2>
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
    <p class="orig-title">{r.title}</p>
    {#if authors.length}<p>{authors.length > 6 ? `${authors.slice(0, 6).join(', ')} ve ark.` : authors.join(', ')}</p>{/if}
    <p>{r.journal ?? ''}{r.pub_date ? ` · ${fmtDay(r.pub_date)}` : ''}</p>
    <p>
      {#if r.doi}DOI: <a href="https://doi.org/{r.doi}" target="_blank" rel="noopener noreferrer">{r.doi}</a>{/if}
      {#if r.pmid}<br />PMID: <a href="https://pubmed.ncbi.nlm.nih.gov/{r.pmid}/" target="_blank" rel="noopener noreferrer">{r.pmid}</a>{/if}
    </p>
    {#if link}
      <a class="orig" href={link} target="_blank" rel="noopener noreferrer">Orijinal yayına git <Icon name="external" size={16} /></a>
    {/if}
    <p class="basis">
      {BASIS_NOTE[r.basis] ?? ''} Yapay zekâ ile hazırlanmıştır; "Editör yorumu" ile başlayan ifadeler yorumdur.
      Bu uygulama klinik karar destek aracı değil, kişisel bir literatür takip aracıdır.
    </p>
  </section>
</article>

<a class="ask" href="/sor?yazi={r.id}"><Icon name="chat" size={18} /> Soru sor</a>

<style>
  .topbar {
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin: 0 -16px;
    padding: calc(6px + env(safe-area-inset-top)) 8px 6px;
    background: var(--glass);
    backdrop-filter: saturate(160%) blur(16px);
    -webkit-backdrop-filter: saturate(160%) blur(16px);
  }
  .topbar .icon-btn {
    color: var(--text);
  }
  .topbar .icon-btn.on {
    color: var(--gold);
  }
  .tb-actions {
    display: flex;
    gap: 4px;
  }
  .cover {
    position: relative;
    overflow: hidden;
    border-radius: 22px;
    min-height: 230px;
    margin-top: 6px;
    color: #f3efe6;
    border: 1px solid var(--line-strong);
    box-shadow: var(--shadow);
  }
  .shade {
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, rgba(8, 10, 14, 0.1), rgba(8, 10, 14, 0.85));
  }
  .cover-content {
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    gap: 10px;
    min-height: 230px;
    padding: 20px;
  }
  .badges {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
  .cover :global(.badge.important) {
    color: #e2b45c;
    background: rgba(226, 180, 92, 0.16);
    border-color: rgba(226, 180, 92, 0.5);
  }
  .cover :global(.badge.practice_changing) {
    color: #ff9a7a;
    background: rgba(255, 154, 122, 0.15);
    border-color: rgba(255, 154, 122, 0.5);
  }
  .cover :global(.badge.informational) {
    color: #c3c8d2;
    background: rgba(195, 200, 210, 0.12);
    border-color: rgba(195, 200, 210, 0.35);
  }
  .pre {
    font-size: 0.72rem;
    color: rgba(243, 239, 230, 0.8);
  }
  h1 {
    margin: 0;
    font-size: 1.6rem;
    line-height: 1.22;
    letter-spacing: -0.01em;
    text-wrap: balance;
  }
  .meta {
    margin: 0;
    font-size: 0.85rem;
    color: rgba(243, 239, 230, 0.7);
  }
  article {
    line-height: 1.65;
    font-size: 1.02rem;
  }
  .hook {
    margin: 20px 0 8px;
    font-size: 1.15rem;
    line-height: 1.5;
    font-weight: 500;
    color: var(--text);
  }
  .ask {
    position: fixed;
    right: max(16px, calc(50% - 304px));
    bottom: calc(86px + env(safe-area-inset-bottom));
    z-index: 15;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 10px 16px;
    border-radius: 999px;
    background: var(--gold);
    color: var(--bg);
    font-weight: 600;
    font-size: 0.92rem;
    text-decoration: none;
    box-shadow: var(--shadow);
  }
  .linked {
    margin: 12px 0 0;
    padding: 10px 12px;
    border: 1px solid var(--gold-line);
    border-radius: 12px;
    background: var(--gold-soft);
    font-size: 0.92rem;
    line-height: 1.5;
  }
  .linked a {
    color: var(--gold);
    font-weight: 600;
    margin-left: 4px;
  }
  section {
    margin-top: 26px;
  }
  h2 {
    margin: 0 0 8px;
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--gold);
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }
  h3 {
    font-size: 0.92rem;
    margin: 16px 0 6px;
  }
  p {
    margin: 0 0 10px;
    color: var(--text-2);
  }
  .lead {
    color: var(--text);
    font-weight: 500;
  }
  .box {
    padding: 14px 16px;
    border-radius: 16px;
    background: var(--surface);
    border: 1px solid var(--line);
  }
  .box.gold {
    border-color: var(--gold-line);
    background: linear-gradient(160deg, var(--gold-soft), var(--surface) 70%);
  }
  .box p {
    margin: 0;
  }
  .shift {
    display: grid;
    gap: 10px;
  }
  @media (min-width: 560px) {
    .shift {
      grid-template-columns: 1fr 1fr;
    }
  }
  .mbadge {
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    text-transform: none;
    padding: 2px 9px;
    border-radius: 999px;
    border: 1px solid var(--line-strong);
    color: var(--muted);
  }
  .mbadge.mature {
    color: var(--gold);
    border-color: var(--gold-line);
  }
  .mbadge.preliminary {
    color: var(--coral);
  }
  .changes {
    padding-left: 20px;
    margin: 0;
  }
  .changes li {
    margin-bottom: 12px;
  }
  .changes li.major .now {
    font-weight: 650;
  }
  .changes span {
    display: block;
  }
  .was {
    color: var(--muted);
    text-decoration: line-through;
    text-decoration-color: color-mix(in srgb, var(--muted) 50%, transparent);
  }
  .related {
    padding-left: 18px;
  }
  .related a {
    color: var(--gold);
  }
  .ref {
    border-top: 1px solid var(--line);
    padding-top: 18px;
    font-size: 0.9rem;
    line-height: 1.5;
  }
  .ref p {
    margin-bottom: 6px;
  }
  .ref a {
    color: var(--gold);
  }
  .orig-title {
    color: var(--text);
    font-weight: 600;
  }
  .orig {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin: 10px 0 14px;
    padding: 10px 16px;
    border-radius: 12px;
    border: 1px solid var(--gold-line);
    background: var(--gold-soft);
    font-weight: 600;
    text-decoration: none;
  }
  .basis {
    font-size: 0.78rem;
    color: var(--muted);
  }
</style>
