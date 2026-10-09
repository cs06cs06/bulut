<script lang="ts">
  import { tick } from 'svelte';
  import { goto, replaceState } from '$app/navigation';
  import Icon from '$lib/components/Icon.svelte';
  import { fmtDay, fmtTime } from '$lib/format';
  import { renderAnswer, type Cite } from '$lib/markdown';
  import { answer, prepare, type SourceCard } from '$lib/qa-client';
  import type { ChatMessage } from './+page.server';

  let { data } = $props();

  let messages = $state<ChatMessage[]>([]);
  let chatId = $state<number | null>(null);
  $effect.pre(() => {
    messages = data.messages.map((m) => ({ ...m }));
    chatId = data.chat?.id ?? null;
  });

  let question = $state('');
  let busy = $state(false);
  let phase = $state<'' | 'searching' | 'thinking' | 'writing'>('');
  let problem = $state('');
  let input: HTMLTextAreaElement | undefined = $state();
  let bottom: HTMLDivElement | undefined = $state();

  const examples = $derived(
    data.work
      ? [
          'Bu çalışmanın en önemli sınırlılıkları neler?',
          'Sonuçlar hangi hasta grubuna uygulanabilir?',
          'Türkiye’deki direnç verileri düşünüldüğünde pratiğe nasıl yansır?',
        ]
      : [
          'Karbapeneme dirençli Enterobacterales enfeksiyonlarında son çalışmalar ne gösteriyor?',
          'Son bir ayda kızamık salgınlarıyla ilgili hangi bildirimler var?',
          'Kandidemide kısa süreli tedaviyle ilgili yeni veri var mı?',
        ],
  );

  /** Yanıt, kendinden önceki sorunun kaynaklarına atıf yapar */
  function citeFor(i: number) {
    const q = messages.slice(0, i).findLast((m) => m.role === 'user');
    const src = q?.sources ?? [];
    return (id: number): Cite | null => {
      const k = src.findIndex((s) => s.id === id);
      if (k < 0) return null;
      const s = src[k];
      return {
        label: data.work ? 'kaynak' : String(k + 1),
        href: s.reviewed ? `/yazi/${s.id}` : s.link,
        external: !s.reviewed,
        title: s.title,
      };
    };
  }

  const waitingAnswer = $derived(!busy && messages.length > 0 && messages[messages.length - 1].role === 'user');

  async function scrollDown() {
    await tick();
    bottom?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }

  async function runAnswer(userMsgId: number) {
    const reply: ChatMessage = { id: -userMsgId, role: 'assistant', content: '', status: null, sources: [] };
    messages.push(reply);
    const idx = messages.length - 1;
    phase = 'thinking';
    try {
      const r = await answer(userMsgId, (t) => {
        phase = 'writing';
        messages[idx].content = t;
      });
      messages[idx].status = r.status;
      if (r.status === 'refused') messages[idx].content = 'Bu soru yanıtlanamadı (güvenlik filtresi). Soruyu farklı biçimde sormayı deneyebilirsiniz.';
      else if (!r.text) messages[idx].content = 'Yanıt alınamadı.';
    } catch (e) {
      messages[idx].status = 'incomplete';
      problem = e instanceof Error ? e.message : 'Yanıt alınamadı.';
      if (!messages[idx].content) messages.pop();
    }
    phase = '';
  }

  async function send(text = question) {
    const q = text.trim();
    if (q.length < 3 || busy) return;
    busy = true;
    problem = '';
    phase = data.work ? 'thinking' : 'searching';
    question = '';
    const local: ChatMessage = { id: 0, role: 'user', content: q, status: null, sources: [] };
    messages.push(local);
    scrollDown();
    try {
      const p = await prepare({ soru: q, sohbet: chatId ?? undefined, yazi: chatId ? undefined : data.work?.id });
      const i = messages.length - 1;
      messages[i].id = p.mesaj;
      messages[i].sources = p.kaynaklar as SourceCard[];
      if (!chatId) {
        chatId = p.sohbet;
        replaceState(`/sor?sohbet=${p.sohbet}`, {});
      }
      if (p.yanit) messages.push({ id: -p.mesaj, role: 'assistant', content: p.yanit, status: 'not_found', sources: [] });
      else await runAnswer(p.mesaj);
    } catch (e) {
      problem = e instanceof Error ? e.message : 'Soru gönderilemedi.';
      if (messages[messages.length - 1] === local || messages[messages.length - 1]?.id === 0) {
        messages.pop();
        question = q;
      }
    } finally {
      busy = false;
      phase = '';
    }
  }

  async function retry() {
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'user' || busy) return;
    busy = true;
    problem = '';
    try {
      await runAnswer(last.id);
    } finally {
      busy = false;
    }
  }

  function onKey(e: KeyboardEvent) {
    // Masaüstünde Enter gönderir, Shift+Enter yeni satır; telefonda klavyenin "gönder" tuşu yok
    if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)) {
      e.preventDefault();
      send();
    }
  }

  function grow() {
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
  }

  function newChat() {
    goto(data.work ? `/sor?yazi=${data.work.id}&yeni=1` : '/sor');
  }

  const PHASE: Record<string, string> = {
    searching: 'Arşivde aranıyor…',
    thinking: 'Kaynaklar okunuyor…',
    writing: '',
  };
</script>

<svelte:head>
  <title>Sor · Enfeksiyon Gündemi</title>
</svelte:head>

<div class="head">
  <h1 class="title">{data.work ? 'Bu yayına soru sor' : 'Sor'}</h1>
  {#if messages.length}
    <button class="new" onclick={newChat}>Yeni sohbet</button>
  {/if}
</div>

{#if data.work}
  <a class="work" href={data.work.reviewed ? `/yazi/${data.work.id}` : undefined}>
    <Icon name="back" size={16} />
    <span>{data.work.title}</span>
  </a>
{:else if !messages.length}
  <p class="intro">
    Sorunuz arşivdeki yayınlarda aranır ve yanıt yalnızca bulunan yayınlara dayanarak, kaynak numaralarıyla yazılır.
  </p>
{/if}

<section class="thread" aria-live="polite">
  {#each messages as m, i (i)}
    {#if m.role === 'user'}
      <div class="q">{m.content}</div>
      {#if m.sources.length && !data.work}
        <details class="sources">
          <summary>{m.sources.length} yayın bulundu</summary>
          <ol>
            {#each m.sources as s}
              <li>
                {#if s.reviewed}
                  <a href="/yazi/{s.id}">{s.title}</a>
                {:else if s.link}
                  <a href={s.link} target="_blank" rel="noopener noreferrer">{s.title}</a>
                {:else}
                  {s.title}
                {/if}
                <span class="meta">
                  {s.journal ?? ''}{s.pub_date ? ` · ${fmtDay(s.pub_date)}` : ''}
                  {#if s.is_preprint}· ön baskı{/if}
                  {#if s.reviewed}· editör yazısı{/if}
                </span>
              </li>
            {/each}
          </ol>
        </details>
      {/if}
    {:else}
      <div class="a" class:muted={m.status === 'not_found' || m.status === 'refused'}>
        {#if m.content}
          {@html renderAnswer(m.content, citeFor(i))}
        {/if}
        {#if m.status === 'incomplete' && m.content}
          <p class="note">Yanıt yarıda kaldı.</p>
        {/if}
      </div>
    {/if}
  {/each}

  {#if phase && PHASE[phase]}
    <div class="phase"><span class="dots"><i></i><i></i><i></i></span>{PHASE[phase]}</div>
  {/if}
  {#if waitingAnswer}
    <button class="retry" onclick={retry}>Yanıtı al</button>
  {/if}
  {#if problem}
    <p class="problem" role="alert">{problem}</p>
  {/if}

  {#if !messages.length}
    <div class="examples">
      {#each examples as ex}
        <button onclick={() => send(ex)} disabled={busy}>{ex}</button>
      {/each}
    </div>
  {/if}
  <div bind:this={bottom}></div>
</section>

{#if !messages.length && data.recent.length}
  <h2 class="section-title">Önceki sorular</h2>
  <ul class="recent">
    {#each data.recent as c}
      <li>
        <a href="/sor?sohbet={c.id}">
          <strong>{c.title}</strong>
          <span>{c.work_title ? `${c.work_title} · ` : ''}{fmtTime(c.updated_at)}</span>
        </a>
      </li>
    {/each}
  </ul>
{/if}

<p class="disclaimer">Yanıtlar yapay zekâ ile hazırlanır ve hatalı olabilir; kaynağa bakarak doğrulayın. Bu uygulama klinik karar destek aracı değil, kişisel bir literatür takip aracıdır.</p>

<form
  class="composer"
  onsubmit={(e) => {
    e.preventDefault();
    send();
  }}
>
  <textarea
    bind:this={input}
    bind:value={question}
    oninput={grow}
    onkeydown={onKey}
    rows="1"
    maxlength="2000"
    placeholder={data.work ? 'Bu yayınla ilgili sorunuz…' : 'Sorunuzu yazın…'}
    aria-label="Soru"
    disabled={busy}
  ></textarea>
  <button type="submit" class="send" disabled={busy || question.trim().length < 3} aria-label="Gönder">
    <Icon name="send" size={20} />
  </button>
</form>

<style>
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 8px 0 10px;
  }
  .title {
    font-size: 1.6rem;
    margin: 0;
    letter-spacing: -0.01em;
  }
  .new {
    border: 1px solid var(--line-strong);
    background: var(--surface);
    color: var(--text-2);
    border-radius: 999px;
    padding: 6px 12px;
    font-size: 0.82rem;
  }
  .work {
    display: flex;
    gap: 6px;
    align-items: flex-start;
    padding: 10px 12px;
    border-radius: 12px;
    background: var(--gold-soft);
    border: 1px solid var(--gold-line);
    color: var(--text);
    text-decoration: none;
    font-size: 0.92rem;
    line-height: 1.4;
  }
  .work :global(svg) {
    flex: none;
    margin-top: 2px;
    color: var(--gold);
  }
  .intro {
    color: var(--text-2);
    line-height: 1.55;
    margin: 0 0 8px;
  }
  .thread {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 14px;
    padding-bottom: 90px;
  }
  .q {
    align-self: flex-end;
    max-width: 85%;
    padding: 10px 14px;
    border-radius: 18px 18px 4px 18px;
    background: var(--gold);
    color: var(--bg);
    line-height: 1.45;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .a {
    padding: 12px 14px;
    border-radius: 4px 18px 18px 18px;
    background: var(--surface);
    border: 1px solid var(--line);
    line-height: 1.6;
    overflow-wrap: anywhere;
  }
  .a.muted {
    color: var(--text-2);
  }
  .a :global(p) {
    margin: 0 0 10px;
  }
  .a :global(p:last-child) {
    margin-bottom: 0;
  }
  .a :global(ul),
  .a :global(ol) {
    margin: 0 0 10px;
    padding-left: 20px;
  }
  .a :global(li) {
    margin: 3px 0;
  }
  .a :global(.cite) {
    display: inline-block;
    min-width: 18px;
    margin: 0 1px;
    padding: 0 5px;
    border-radius: 8px;
    background: var(--gold-soft);
    color: var(--gold);
    font-size: 0.75rem;
    font-weight: 700;
    line-height: 1.5;
    text-align: center;
    text-decoration: none;
    vertical-align: 1px;
  }
  .note {
    color: var(--muted);
    font-size: 0.85rem;
  }
  .sources {
    align-self: flex-end;
    max-width: 92%;
    font-size: 0.85rem;
    color: var(--text-2);
  }
  .sources summary {
    cursor: pointer;
    text-align: right;
    color: var(--muted);
  }
  .sources ol {
    margin: 6px 0 0;
    padding: 10px 12px 10px 28px;
    border-radius: 12px;
    background: var(--surface-2);
  }
  .sources li {
    margin: 4px 0;
    line-height: 1.4;
  }
  .sources a {
    color: var(--text);
  }
  .sources .meta {
    display: block;
    color: var(--muted);
    font-size: 0.78rem;
  }
  .phase {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--muted);
    font-size: 0.88rem;
  }
  .dots {
    display: inline-flex;
    gap: 3px;
  }
  .dots i {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--gold);
    animation: blink 1.2s infinite ease-in-out;
  }
  .dots i:nth-child(2) {
    animation-delay: 0.2s;
  }
  .dots i:nth-child(3) {
    animation-delay: 0.4s;
  }
  @keyframes blink {
    0%,
    80%,
    100% {
      opacity: 0.25;
    }
    40% {
      opacity: 1;
    }
  }
  .retry {
    align-self: flex-start;
    border: 1px solid var(--gold-line);
    background: var(--gold-soft);
    color: var(--gold);
    border-radius: 999px;
    padding: 8px 14px;
    font-weight: 600;
  }
  .problem {
    padding: 10px 12px;
    border-radius: 12px;
    background: var(--err-bg);
    color: var(--err-text);
    font-size: 0.9rem;
  }
  .examples {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .examples button {
    text-align: left;
    padding: 10px 14px;
    border-radius: 14px;
    border: 1px solid var(--line-strong);
    background: var(--surface);
    color: var(--text-2);
    font-size: 0.92rem;
    line-height: 1.4;
  }
  .section-title {
    font-size: 0.8rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
    margin: 22px 0 8px;
  }
  .recent {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .recent a {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 10px 0;
    border-bottom: 1px solid var(--line);
    color: var(--text);
    text-decoration: none;
  }
  .recent strong {
    font-weight: 600;
    line-height: 1.35;
  }
  .recent span {
    color: var(--muted);
    font-size: 0.8rem;
  }
  .disclaimer {
    color: var(--muted);
    font-size: 0.75rem;
    line-height: 1.45;
    margin: 18px 0 0;
  }
  .composer {
    position: fixed;
    left: 50%;
    transform: translateX(-50%);
    bottom: calc(84px + env(safe-area-inset-bottom));
    z-index: 15;
    width: min(calc(100% - 24px), 520px);
    display: flex;
    align-items: flex-end;
    gap: 8px;
    padding: 6px 6px 6px 14px;
    border-radius: 22px;
    background: var(--surface);
    border: 1px solid var(--gold-line);
    box-shadow: var(--shadow);
  }
  .composer textarea {
    flex: 1;
    resize: none;
    border: 0;
    outline: none;
    background: transparent;
    color: var(--text);
    font: inherit;
    font-size: 1rem;
    line-height: 1.4;
    padding: 8px 0;
    max-height: 160px;
  }
  .send {
    flex: none;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: 0;
    display: grid;
    place-items: center;
    background: var(--gold);
    color: var(--bg);
  }
  .send:disabled {
    opacity: 0.4;
  }
</style>
