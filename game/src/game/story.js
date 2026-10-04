import { TOWERS } from '../world/layout.js';

// Story campaign "Palouse'a Dönüş": you inherit grandpa Walt's farm and old pickup. Neighbours
// give you work, the Dawsons want the farm, and grandpa's long-lost truck waits in a barn.
// Chapters reuse the open-world activities; dialogue pauses the game.
const NPC = {
  walt: { name: 'Dede Walt · mektup', init: '✉', color: '#8a5a2b' },
  earl: { name: 'Earl Hobbs · tamirci', init: 'EH', color: '#3a6ea5' },
  martha: { name: 'Martha Jensen · Su Kulesi Çiftliği', init: 'MJ', color: '#5a8a3a' },
  rosie: { name: 'Rosie · postacı', init: 'R', color: '#c27a2a' },
  hank: { name: 'Hank Dawson · rakip', init: 'HD', color: '#a3241c' },
  dale: { name: 'Şerif Dale', init: '★', color: '#6b5a3a' },
};

export const CHAPTERS = [
  {
    title: 'Eve Dönüş', reward: 200,
    intro: [['walt', 'Sevgili torunum, bu mektubu okuyorsan ben artık Palouse rüzgârına karışmışım demektir.'],
      ['walt', 'Çiftliği ve emektar pikabı sana bırakıyorum. Bu toprak cömerttir ama emek ister.'],
      ['walt', 'Kasabaya in, benzinlikteki Earl’e uğra. O sana yol gösterir. Seni seven deden, Walt.']],
    goal: 'Steptoe Kasabası’ndaki benzinliğe git',
    target: (g) => [g.world.gasStation.x, g.world.gasStation.z],
    check: (g) => Math.hypot(g.vehicle.position.x - g.world.gasStation.x, g.vehicle.position.z - g.world.gasStation.z) < 18,
    outro: [['earl', 'Demek Walt’ın torunu sensin! Gözlerin aynı onunki gibi.'],
      ['earl', 'Çiftliği ayakta tutmak istiyorsan para lazım. Komşuların işi hiç bitmez.'],
      ['earl', 'Sarı ışıklı ilan panolarına bak; yükü düşürmeden götür, gerisi gelir.']],
  },
  {
    title: 'İlk Ekmek Parası', reward: 400,
    intro: [['martha', 'Merhaba komşu! Ben Martha, Su Kulesi Çiftliği’nden. Walt hepimize hep yardım ederdi.'],
      ['martha', 'Bu yıl hasat bol ama taşıyacak el yok. İki teslimat yaparsan çok sevinirim.']],
    goal: 'İki teslimat tamamla', base: (g) => ({ n: g.progress.stats.deliveries }),
    count: (g, b) => [g.progress.stats.deliveries - b.n, 2],
    outro: [['martha', 'Harikasın! Walt seninle gurur duyardı.'], ['martha', 'Al bakalım, bu da benden. Yolda karnın acıkırsa diye.']],
  },
  {
    title: 'Kasabanın Sesi', reward: 350,
    intro: [['rosie', 'Selam! Ben Rosie, kasabanın tek postacısı. Bacağım alçıda, görüyorsun.'],
      ['rosie', 'Postanedeki çantayı alıp kutulara dağıtır mısın? Kutunun yanında yavaşlaman yeterli.']],
    goal: 'Postaneden bir posta turu tamamla', base: (g) => ({ n: g.progress.stats.mailRoutes }),
    target: (g) => (g.postal.active ? null : [g.world.postOffice.x, g.world.postOffice.z]),
    count: (g, b) => [g.progress.stats.mailRoutes - b.n, 1],
    outro: [['rosie', 'Kasaba seni şimdiden sevdi!'], ['rosie', 'Bir şey daha: Hank Dawson seni soruyordu. Dikkatli ol, o çocuk hiç kaybetmeyi sevmez.']],
  },
  {
    title: 'Rakip', reward: 500,
    intro: [['hank', 'Demek yeni Miller sensin. Ben Hank Dawson. Babam o çiftliği yıllardır almak istiyor.'],
      ['hank', 'Kuzey Sprinti’nde benden önce bitiremezsen teklifimizi düşünmeye başlarsın. Bayrak Miller Çiftliği’nin kuzeyinde.']],
    goal: 'Kuzey Sprinti’ni Hank’ten önce bitir',
    target: (g) => (g.races.active ? null : [g.races.races.find((r) => r.id === 'north').start.x, g.races.races.find((r) => r.id === 'north').start.z]),
    check: (g, b, ev) => ev.race?.id === 'north' && ev.race.beatHank,
    fail: (ev) => ev.race?.id === 'north' && !ev.race.beatHank && 'Hank: “Ha! Toz yuttun, Miller. İstersen tekrar dene.”',
    outro: [['hank', 'Şans eseri… Bir dahaki sefere o kadar şanslı olmayacaksın.']],
  },
  {
    title: 'Dedenin Sırrı', reward: 300,
    intro: [['earl', 'Walt gençken koca bir çekici kullanırdı. Kamyon bir gün ortadan kayboldu, kimse nereye gittiğini bilmiyor.'],
      ['earl', 'Rivayet o ki çiftliğin kuzeyindeki eski bir ahırda saklıymış. Haritada kesikli çemberle işaretledim.']],
    setup: (g) => { g.barnFinds.reveal('grandpa'); g.progress.data.story.earl = true; },
    goal: 'Haritadaki söylenti alanında eski ahırı bul',
    target: (g) => { const b = g.barnFinds.barns.find((x) => x.id === 'grandpa'); return [b.sx, b.sz]; },
    check: (g) => g.barnFinds.isFound('grandpa'),
    outro: [['earl', 'İnanmıyorum, hâlâ orada! Paslanmış ama motoru sağlam.'], ['earl', 'Parçaları sipariş ettim. Masrafın yarısı benden.']],
  },
  {
    title: 'Yeniden Doğuş', reward: 300,
    intro: [['earl', 'Garajdan restorasyonu başlat. Walt’ın kamyonu yeniden yola çıksın!']],
    goal: 'Garajda (Tab → Garaj) dedenin kamyonunu restore et',
    check: (g) => g.progress.data.owned.includes('semi'),
    outro: [['earl', 'İşte bu! Walt’ın kamyonu yeniden yolda. Ağır yükte bundan iyisi yok.']],
  },
  {
    title: 'Kulelerden Bakış', reward: 400,
    intro: [['dale', 'Hoş geldin evlat. Eski yangın gözetleme kulelerini bilir misin?'],
      ['dale', 'İkisine git, bölgeyi tanı. Palouse’u bilmeyen burada kaybolur.']],
    base: (g) => ({ n: g.explore.visitedCount }),
    goal: 'İki gözetleme kulesine git',
    target: (g) => { const p = g.vehicle.position; const t = g.explore.towers.filter((x) => !x.visited).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0]; return t ? [t.x, t.z] : null; },
    count: (g, b) => [g.explore.visitedCount - b.n, Math.min(2, TOWERS.length - b.n)],
    outro: [['dale', 'Artık bu toprakları benden iyi biliyorsun. Dawson’lara da göz kulak ol.']],
  },
  {
    title: 'Palouse Kupası', reward: 1500,
    intro: [['hank', 'Son bir yarış, Miller. Güney Derbisi. Kazanırsan babam teklifini geri çeker.'],
      ['hank', 'Ama kaybedersen… çiftliğin anahtarını getirirsin.']],
    goal: 'Güney Derbisi’ni birinci bitir',
    target: (g) => (g.races.active ? null : [g.races.races.find((r) => r.id === 'south').start.x, g.races.races.find((r) => r.id === 'south').start.z]),
    check: (g, b, ev) => ev.race?.id === 'south' && ev.race.place === 1,
    fail: (ev) => ev.race?.id === 'south' && ev.race.place !== 1 && 'Hank: “Kupaya bu kadar yakındın! Bir daha gel bakalım.”',
    outro: [['hank', '…Tamam. Kabul ediyorum, iyi sürüyorsun. Çiftlik senin, Miller.'],
      ['earl', 'Walt bunu görse şapkasını havaya atardı. Palouse’a hoş geldin, evlat. Gerçekten hoş geldin.']],
  },
];

export class Story {
  constructor({ game }) {
    this.g = game;
    const d = game.progress.data;
    this.state = d.story || (d.story = { ch: 0, stage: 'intro', base: {} });
    this.ev = {};
    this.delay = 2.5;
    this.el = { box: document.getElementById('dialogue'), por: document.getElementById('dl-portrait'), name: document.getElementById('dl-name'), text: document.getElementById('dl-text') };
    this.el.box.addEventListener('pointerdown', (e) => { e.preventDefault(); this.next(); });
  }

  get chapter() { return CHAPTERS[this.state.ch]; }
  get done() { return this.state.ch >= CHAPTERS.length; }
  get speaking() { return !!this.lines; }

  event(type, data) {
    if (type === 'race') this.ev.race = data;
    if (this.state.stage === 'active' && type === 'race') {
      const msg = this.chapter?.fail?.(this.ev);
      if (msg && !this.chapter.check(this.g, this.state.base, this.ev)) this.g.hud.hint(msg, 4);
    }
  }

  // dialogue: lines of [npcKey, text]; game pauses until the last line is dismissed
  say(lines, then) {
    this.lines = lines.slice(); this.then = then;
    this.prevState = this.g.state === 'dialogue' ? 'play' : this.g.state;
    this.g.state = 'dialogue';
    this.el.box.classList.remove('hidden');
    this._show();
    this.g.audio.play('ui_switch', { bus: 'ui', volume: 0.6 });
  }

  _show() {
    const [who, text] = this.lines[0], n = NPC[who];
    this.el.por.textContent = n.init; this.el.por.style.background = n.color;
    this.el.name.textContent = n.name; this.el.text.textContent = text;
    this.el.box.classList.remove('pop'); void this.el.box.offsetWidth; this.el.box.classList.add('pop');
  }

  next() {
    if (!this.lines) return;
    this.lines.shift();
    this.g.audio.play('ui_click', { bus: 'ui', volume: 0.6 });
    if (this.lines.length) { this._show(); return; }
    this.lines = null;
    this.el.box.classList.add('hidden');
    this.g.state = this.prevState || 'play';
    this.g.clock.getDelta();
    const t = this.then; this.then = null; t?.();
  }

  // HUD objective + map target for the active chapter
  objective() {
    if (this.done || this.state.stage !== 'active') return null;
    const c = this.chapter, lines = [c.goal];
    if (c.count) { const [a, b] = c.count(this.g, this.state.base); lines.push(`${Math.max(0, Math.min(a, b))} / ${b}`); }
    return { title: `Hikâye · ${this.state.ch + 1}. ${c.title}`, lines };
  }

  get target() { return this.done || this.state.stage !== 'active' ? null : this.chapter.target?.(this.g) || null; }

  update(dt) {
    if (this.done || this.speaking || this.g.state !== 'play') return;
    const g = this.g, c = this.chapter, st = this.state;
    const busy = g.races.active || g.gameplay.active || g.postal.active || g.delivery.job;
    if (st.stage === 'intro') {
      this.delay -= dt;
      if (this.delay > 0 || busy) return;
      // like a phone call: wait until the player slows down
      if (g.vehicle.speed > 6) {
        this.callT = (this.callT || 0) - dt;
        if (this.callT <= 0) { this.callT = 18; g.hud.hint(`📞 ${NPC[c.intro[0][0]].name.split(' · ')[0]} seni arıyor — dur ve dinle`, 4); }
        return;
      }
      this.say(c.intro, () => {
        st.stage = 'active'; st.base = c.base?.(g) || {}; this.ev = {};
        c.setup?.(g);
        g.progress.save();
        g.hud.toast(`Bölüm ${st.ch + 1}`, c.title, c.goal);
      });
      return;
    }
    const ok = c.check ? c.check(g, st.base, this.ev) : (() => { const [a, b] = c.count(g, st.base); return a >= b; })();
    if (!ok || g.races.active) return;
    this.say(c.outro, () => {
      g.progress.addMoney(c.reward);
      g.hud.popup(`Bölüm tamam: ${c.title} <small>+$${c.reward}</small>`);
      st.ch++; st.stage = 'intro'; st.base = {}; this.ev = {};
      this.delay = 5;
      g.progress.save();
      if (this.done) { g.progress.data.storyDone = true; g.hud.toast('Hikâye Tamamlandı', 'Palouse’un Yeni Efsanesi', 'Çiftlik artık senin. Palouse seni bekliyor: yarışlar, ahırlar, kuleler…'); }
    });
  }
}
