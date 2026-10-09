// Yanıtlar için küçük ve güvenli Markdown çevirici: paragraflar, madde işaretleri, **kalın**, *italik*
// ve [#123] biçimindeki kaynak atıfları. Metin önce tamamen kaçışlanır (HTML enjekte edilemez).

export interface Cite {
  label: string;
  href: string | null;
  external: boolean;
  title: string;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function inline(s: string, cite: (id: number) => Cite | null): string {
  return esc(s)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/(\s*)\[#(\d+)\]/g, (m, sp: string, id: string) => {
      const c = cite(Number(id));
      if (!c) return ''; // listede olmayan numara (uydurma atıf) gösterilmez
      const label = esc(c.label);
      if (!c.href) return `${sp}<span class="cite" title="${esc(c.title)}">${label}</span>`;
      const ext = c.external ? ' target="_blank" rel="noopener noreferrer"' : '';
      return `${sp}<a class="cite" href="${esc(c.href)}" title="${esc(c.title)}"${ext}>${label}</a>`;
    });
}

export function renderAnswer(md: string, cite: (id: number) => Cite | null): string {
  const out: string[] = [];
  type List = { tag: 'ul' | 'ol'; items: string[] };
  let list = null as List | null;
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) out.push(`<p>${para.map((l) => inline(l, cite)).join('<br>')}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list) out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i, cite)}</li>`).join('')}</${list.tag}>`);
    list = null;
  };
  for (const raw of md.split('\n')) {
    const line = raw.trimEnd();
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const num = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || num) {
      flushPara();
      const tag = bullet ? 'ul' : 'ol';
      if (list?.tag !== tag) {
        flushList();
        list = { tag, items: [] };
      }
      list!.items.push((bullet ?? num)![1]);
    } else if (!line.trim()) {
      flushPara();
      flushList();
    } else {
      flushList();
      // Model başlık kullanırsa kalın satıra çevrilir
      const h = /^#{1,6}\s+(.*)$/.exec(line);
      para.push(h ? `**${h[1]}**` : line);
    }
  }
  flushPara();
  flushList();
  return out.join('');
}
