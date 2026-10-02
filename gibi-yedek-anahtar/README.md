# GİBİ — "Yedek Anahtar" (hayran bölümü)

Gibi dizisinin havasında yazılmış, **resmi olmayan** tam bir bölüm senaryosu ve bu
senaryodan **three.js** ile kare kare üretilmiş ~12,5 dakikalık animasyon video.

- 📜 **Senaryo:** [`SENARYO.md`](SENARYO.md)
- 🎬 **Video:** `dist/gibi-yedek-anahtar.mp4` (1280×720, 24 fps, Türkçe ses + gömülü altyazı)
- ▶️ **Tarayıcıda oynatıcı:** `index.html` (aşağıya bakın)

## Bölüm özeti

Yılmaz, evinin yedek anahtarını büyük bir törenle İlkkan'a verir ve "acil durum"un
üç maddelik tanımını yapar: yangın, sel ve "ben acil dersem". Ertesi sabah 07.12'de
gelen "acil durum" çağrısı, komşu Necmi Bey'den kaçma planına, rüzgârla çarpan bir
kapıya, anahtar vermeyen kapıcıya, muhabbeti ayrıca ücretlendiren bir çilingire ve
sonunda kendi evinin misafiri olmaya dönüşür.

| Sahne | Mekân |
|---|---|
| Soğuk açılış | İlkkan'ın evi – akşam |
| Jenerik | |
| 1 | Telefon – sabah 07.12 |
| 2 | Yılmaz'ın evi – plan |
| 3 | Apartman koridoru – kapı çarpar |
| 4 | Apartman girişi – Kapıcı Remzi |
| 5 | Sokak – Çilingir Hüsnü gelir |
| 6 | Koridor – kilit açılır |
| 7 | Yılmaz'ın evi – yeni anahtar |
| Son | Koridor – paspasın üstünde |

## Nasıl çalışır?

Bölümün **tek kaynağı** [`src/episode.js`](src/episode.js): repliklerin yanında
sahne yönergeleri de (yürü, otur, kapıyı aç, el hareketi, kamera) veri olarak durur.
Aynı dosyadan hem okunabilir senaryo hem de video üretilir.

```
src/episode.js ──► tools/export-lines.mjs ──► tools/tts.py  (piper, tr_TR-dfki: her karaktere ayrı perde/hız)
       │                                           │
       └──────────► tools/make-timeline.mjs ◄──────┘   (replik süreleri → zaman çizelgesi + animasyon izleri)
                            │
              ┌─────────────┼────────────────────┐
              ▼             ▼                    ▼
   tools/build-script-md  tools/mix.py        tools/render.mjs
     → SENARYO.md        → build/episode.m4a   → headless Chromium + three.js → ffmpeg → MP4
                          (efekt/müzik numpy
                           ile sentezlenir)
```

- **Setler** (`src/sets.js`): İlkkan'ın evi, Yılmaz'ın evi, apartman koridoru,
  apartman girişi ve sokak — tamamı kutu/silindir gibi ilkel geometrilerden.
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
./build.sh            # hepsini baştan üretir (render 4 çekirdekte ~45-60 dk)
```

Sadece tarayıcıda izlemek için (ses ve zaman çizelgesi `build/` içinde hazır):

```bash
npm install
npx http-server -c-1 .     # sonra http://localhost:8080
```

Tek tek anların görüntüsünü almak için: `node tools/shot.mjs cikti/ 20 183.4 540`

---

*Bu çalışma resmi bir Gibi bölümü değildir; diziye duyulan sevgiyle yapılmış bir hayran işidir.
Karakter modelleri oyunculara benzetilmeye çalışılmamış, tamamen stilize edilmiştir.*
