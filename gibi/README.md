# GİBİ — hayran bölümleri

Gibi dizisinin havasında yazılmış, **resmi olmayan** tam bölüm senaryoları ve bu
senaryolardan **three.js** ile kare kare üretilmiş animasyon videoları.

| # | Bölüm | Senaryo | Video | Süre |
|---|---|---|---|---|
| 1 | **Yedek Anahtar** | [`senaryolar/yedek-anahtar.md`](senaryolar/yedek-anahtar.md) | `dist/yedek-anahtar.mp4` | 12:23 |
| 2 | **Şifre** | [`senaryolar/sifre.md`](senaryolar/sifre.md) | `dist/sifre.mp4` | 10:10 |

Videolar 1280×720, 24 fps; Türkçe ses ve gömülü altyazı içerir.

### 1 · Yedek Anahtar

Yılmaz, evinin yedek anahtarını büyük bir törenle İlkkan'a verir ve "acil durum"un
üç maddelik tanımını yapar: yangın, sel ve "ben acil dersem". Ertesi sabah 07.12'de
gelen "acil durum" çağrısı; komşu Necmi Bey'den kaçma planına, rüzgârla çarpan bir
kapıya, anahtar vermeyen kapıcıya, muhabbeti ayrıca ücretlendiren bir çilingire ve
sonunda kendi evinin misafiri olmaya dönüşür.

### 2 · Şifre

Derbiye yirmi iki dakika vardır ve Yılmaz'ın evinde internet yoktur: modem hâlâ
Necmi Bey'dedir ve Necmi Bey şifreyi "güvenlik için" değiştirmiştir. İpucu: *bu
apartmanda herkesin bildiği ama kimsenin söylemediği şey.* Kapıcı Remzi'nin
tahminleri ("aidat", "asansör yok"), Bakkal Şükrü'nün veresiye defteri ve dört yüz
on liralık bir borç devri, ikisini ilk bölümün en çok bilinen ama hiç söylenmeyen
lafına götürür. Ekranda geri sayım: *maça 18… 13… 9… 5… 1 dakika.*

## Nasıl çalışır?

Her bölümün **tek kaynağı** `episodes/<bölüm>.js` dosyasıdır (örn.
[`episodes/sifre.js`](episodes/sifre.js)): repliklerin yanında sahne yönergeleri de
(yürü, otur, kapıyı aç, el hareketi, kamera, telefon/defter ara görüntüsü, televizyon
ekranı) veri olarak durur. Aynı dosyadan hem okunabilir senaryo hem de video üretilir.
Yeni bir bölüm eklemek için `episodes/` altına bir dosya yazmak yeterlidir.

```
episodes/<bölüm>.js ──► tools/export-lines.mjs ──► tools/tts.py  (piper, tr_TR-dfki: her karaktere ayrı perde/hız)
       │                                           │
       └──────────► tools/make-timeline.mjs ◄──────┘   (replik süreleri → zaman çizelgesi + animasyon izleri)
                            │
              ┌─────────────┼────────────────────┐
              ▼             ▼                    ▼
   tools/build-script-md  tools/mix.py        tools/render.mjs
     → senaryolar/*.md   → build/<bölüm>/      → headless Chromium + three.js → ffmpeg → dist/<bölüm>.mp4
                          (efekt/müzik numpy
                           ile sentezlenir)
```

- **Setler** (`src/sets.js`): İlkkan'ın evi, Yılmaz'ın evi, apartman koridoru,
  apartman girişi, sokak ve Şükrü'nün bakkalı — tamamı kutu/silindir gibi ilkel geometrilerden.
- **Karakterler** (`src/characters.js`): iskeletli "kukla"lar; yürüme, oturma,
  ~30 el hareketi, mimikler, göz kırpma ve sesin genliğinden dudak senkronu.
- **Kamera** (`src/main.js`): geniş plan, yakın plan, omuz üstü, ikili plan ve
  "crash zoom"; 180° kuralını korur ve karakterlerin birbirini kapatmadığı açıyı seçer.
- **Ses** (`tools/mix.py`): kapı, telefon, rüzgâr, minibüs gibi efektler, jenerik
  müziği, sahne geçiş müziği ve ortam sesleri koddan sentezlenir.

## Çalıştırma

Gereken: Node 18+, Python 3.10+, ffmpeg.

```bash
pip install piper-tts numpy scipy
./build.sh yedek-anahtar   # 1. bölümü baştan üretir (render 4 çekirdekte ~45 dk)
./build.sh sifre           # 2. bölüm
```

Sadece tarayıcıda izlemek için (ses ve zaman çizelgesi `build/` içinde hazır):

```bash
npm install
npx http-server -c-1 .     # sonra http://localhost:8080/?ep=sifre
```

Tek tek anların görüntüsünü almak için: `node tools/shot.mjs cikti/ --ep sifre 20 183.4 540`

---

*Bu çalışma resmi bir Gibi bölümü değildir; diziye duyulan sevgiyle yapılmış bir hayran işidir.
Karakter modelleri oyunculara benzetilmeye çalışılmamış, tamamen stilize edilmiştir.*
