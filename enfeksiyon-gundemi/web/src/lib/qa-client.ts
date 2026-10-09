// Tarayıcı tarafı: soru gönderme ve yanıt akışını (SSE) okuma.

export interface SourceCard {
  id: number;
  title: string;
  journal: string | null;
  pub_date: string | null;
  is_preprint: number;
  kind: string;
  reviewed: boolean;
  link: string | null;
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const msg = await res
      .json()
      .then((j) => (j as { message?: string }).message)
      .catch(() => null);
    throw new Error(msg ?? `İstek başarısız (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export function prepare(body: { soru: string; sohbet?: number; yazi?: number }) {
  return post<{ sohbet: number; mesaj: number; kaynaklar: SourceCard[]; yanit?: string }>('/api/sor/hazirla', body);
}

export interface StreamResult {
  text: string;
  status: 'ok' | 'refused' | 'incomplete';
  model: string | null;
}

/** Yanıtı akış hâlinde okur; her yeni parçada onText çağrılır. Bitince yanıtı kaydeder. */
export async function answer(mesaj: number, onText: (text: string) => void): Promise<StreamResult> {
  let text = '';
  let model: string | null = null;
  let stop: string | null = null;
  const usage: Record<string, number> = {};
  const mergeUsage = (u: Record<string, unknown> | undefined) => {
    for (const [k, v] of Object.entries(u ?? {})) if (typeof v === 'number') usage[k] = v;
  };

  try {
    const res = await fetch('/api/sor/yanit', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream, application/json' },
      body: JSON.stringify({ mesaj }),
    });
    if (!res.ok || !res.body) {
      const msg = await res
        .json()
        .then((j) => (j as { message?: string }).message)
        .catch(() => null);
      throw new Error(msg ?? `Yanıt alınamadı (${res.status})`);
    }
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += value;
      let cut: number;
      while ((cut = buf.indexOf('\n\n')) >= 0) {
        const event = buf.slice(0, cut);
        buf = buf.slice(cut + 2);
        const data = event
          .split('\n')
          .filter((l) => l.startsWith('data:'))
          .map((l) => l.slice(5).trim())
          .join('');
        if (!data) continue;
        let ev: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
        try {
          ev = JSON.parse(data);
        } catch {
          continue;
        }
        if (ev.type === 'message_start') {
          model = ev.message?.model ?? model;
          mergeUsage(ev.message?.usage);
        } else if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
          text += ev.delta.text;
          onText(text);
        } else if (ev.type === 'message_delta') {
          stop = ev.delta?.stop_reason ?? stop;
          mergeUsage(ev.usage);
        } else if (ev.type === 'error') {
          throw new Error(ev.error?.message ?? 'Akış hatası');
        }
      }
    }
  } catch (e) {
    await save(mesaj, text, 'incomplete', model, usage);
    throw e;
  }
  // Güvenlik filtresi yanıtı yarıda keserse kısmi metin kullanılmaz
  const status = stop === 'refusal' ? 'refused' : stop === 'end_turn' ? 'ok' : 'incomplete';
  if (status === 'refused') text = '';
  await save(mesaj, text, status, model, usage);
  return { text, status, model };
}

function save(mesaj: number, metin: string, durum: string, model: string | null, usage: Record<string, number>) {
  return post('/api/sor/kaydet', { mesaj, metin, durum, model, usage }).catch(() => null);
}
