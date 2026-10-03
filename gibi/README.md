# GİBİ — hayran bölümleri

Gibi dizisinin havasında yazılmış, **resmi olmayan** tam bölüm senaryoları ve bu
senaryolardan **three.js** ile kare kare üretilmiş animasyon videoları.

| # | Bölüm | Senaryo | Video | Süre |
|---|---|---|---|---|
| 1 | **Yedek Anahtar** | [`senaryolar/yedek-anahtar.md`](senaryolar/yedek-anahtar.md) | `dist/yedek-anahtar.mp4` | 12:23 |
| 2 | **Şifre** | [`senaryolar/sifre.md`](senaryolar/sifre.md) | `dist/sifre.mp4` | 10:10 |
| 3 | **Yönetim** | [`senaryolar/yonetim.md`](senaryolar/yonetim.md) | `dist/yonetim.mp4` | 12:21 |

1. ve 2. bölüm "motor 1" ile (çizgi film görünümü, 720p, piper sesleri), 3. bölüm
"motor 2" ile (fiziksel tabanlı ışık, 1080p, neural sesler) üretildi. Hepsi 24 fps,
Türkçe ses ve gömülü altyazı içerir.

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

### 3 · Yönetim

Koridora asılan ilan, Huzur Apartmanı'nı olağanüstü toplantıya çağırır: gündem
aidatlar, ödünç alınan eşyalar ve yönetici seçimidir; üç maddenin üçünün de konusu
Yılmaz'dır. Takım elbisesini giyen Yılmaz, avukatı İlkkan'la prova yapar; toplantı
her eşyasında "Yılmaz Bey" etiketi olan Necmi Bey'in salonunda, Yılmaz'ın
sandalyelerinde yapılır. Sevim Hanım istifa eder ve oylama sonunda İlkkan, oturmadığı
bir apartmanın yöneticisi olur. Yönetimin ilk günü: matkap talebi, zam talebi,
otomat şikâyeti… ve Yılmaz'ın beklenmedik peşin ödemesi.

## Motor 2 (3. bölüm)

| Alan | Motor 1 | Motor 2 |
|---|---|---|
| Ses | piper `tr_TR-dfki` (tek ses, perde kaydırma) | **Microsoft neural sesler** (Edge TTS): her karaktere ayrı ses, duyguya göre hız/perde |
| Karakter | ilkel şekiller, eldiven eller | torna profilli gövde, **beş parmaklı eller**, göz kapakları, iris/göz bebeği, kaş eğrileri, dudak + diş + dil, giyim ayrıntıları (yaka, kravat, düğmeler) |
| Dudak senkronu | ses genliği | genlik + **ağız şekli** (o/u yuvarlak, i/e geniş — sesin spektrumundan) |
| Işık | toon gölgelendirme | **PBR** malzemeler, yumuşak gölge, ortam ışığı (PMREM), ACES ton eşleme |
| Kamera | – | yakın planlarda **alan derinliği**, sinematik renk, vinyet, ince film greni, FXAA |
| Görüntü | 1280×720 | **1920×1080** (3D 1280×720'de çizilip ölçeklenir, yazılar 1080p) |
| Müzik | basit sentez | **caz kombosu**: Karplus-Strong kontrbas, Rhodes, klarnet, fırçalı davul (swing) |
| Efekt | sabit efektler | + yürüyüş izlerinden **otomatik ayak sesleri** (zemine göre) |
| Yazı tipi | DejaVu | Inter, Archivo Black, Fraunces (Google Fonts, OFL) |

Sesler, kullanılan neural seslerin Türkçe telaffuzunu ölçmek için Whisper
(`faster-whisper small`) ile yazıya döküldü; seçilen tüm seslerde kelime hata oranı ~%0.

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
pip install piper-tts edge-tts numpy scipy
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
