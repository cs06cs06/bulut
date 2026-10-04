# Tozlu Yollar — Palouse Offroad

Stilize, açık dünya bir **country offroad** sürüş oyunu. Pikabınla Washington eyaletindeki gerçek **Palouse tepeleri** ve **Steptoe Butte** arazisinde (3,3 × 3,3 km oynanabilir alan + 6,6 km ufuk) buğday tarlaları, toprak yollar ve çiftlikler arasında keşfe çıkıyorsun.

Tarayıcıda çalışır (three.js + Rapier fizik motoru, WebGL2).

## Özellikler
- **Gerçek arazi:** AWS Terrain Tiles yükseklik verisinden üretilmiş heightfield, çok seviyeli (LOD) arazi parçaları ve Rapier heightfield çarpışması.
- **Stilize görünüm:** El boyaması dokular, kalibre edilmiş country renk paleti, buğday/sürülmüş/yeşil tarla parselleri, sürülmüş toprakta sıra desenleri, hareket eden bulut gölgeleri, HDRI gökyüzü ve ışık, AO, bloom, ton eşleme.
- **Dış kaynaklı varlıklar:** Tüm modeller, dokular, müzik ve sesler indirilmiş paketlerden gelir ([CREDITS.md](CREDITS.md)). Sahnede kodla çizilmiş bina/ağaç/çit yoktur.
- **Araç fiziği:** Raycast süspansiyon, 4x4 çekiş, tork eğrili otomatik şanzıman, el freniyle drift, havada kontrol, takla düzeltme, yüzeye göre tutuş.
- **Canlı dünya:** 5 çiftlik (ahırlar, silolar, değirmenler, su kuleleri), animasyonlu inekler, atlar, eşekler, alpakalar, tavuklar; araç yaklaşınca kaçan geyik sürüleri. Rüzgârda sallanan bitki örtüsü, uzak ağaçlar için impostor (billboard) sistemi.
- **Oynanış:** 13 keşif noktası, 27 gizli balkabağı, iki zamana karşı görev (*Zirve Tırmanışı* — spiral yoldan Butte zirvesine, *Çiftlik Rallisi*), haritadan hızlı seyahat; ilerleme tarayıcıda saklanır.
- **Ses:** Devre göre çapraz geçişli çok katmanlı motor sesi, çakıl/patinaj döngüleri, çarpışma ve iniş sesleri, kuşlar, rüzgâr, inek ve tavuk sesleri, Kevin MacLeod'un country/bluegrass parçaları.
- **Arayüz:** Analog hız göstergesi, yöne dönen mini harita, büyük harita, Türkçe menüler, grafik kalitesi (Düşük–Ultra), öğle/gün batımı seçimi, pikap rengi, ses ayarları, gamepad ve dokunmatik kontroller.

## Çalıştırma
```bash
cd game
npm install
npm run dev        # http://localhost:5173
npm run build      # üretim derlemesi → dist/
npm run preview
```
`dist/` klasörü herhangi bir statik sunucuda (GitHub Pages, Netlify vb.) yayınlanabilir (`base: './'`).

## Kontroller
| Tuş | İşlev |
|---|---|
| W / ↑ | Gaz |
| S / ↓ | Fren, durunca geri vites |
| A D / ← → | Direksiyon |
| Boşluk | El freni (drift) |
| Shift | Turbo |
| R | Aracı düzelt |
| C | Kamera (takip / uzak / kaput) |
| H | Korna |
| F | Bayrak yanında görev başlat / iptal |
| M / N | Müzik aç-kapa / sonraki parça |
| Tab / Esc | Harita ve duraklatma menüsü |
| Fare | Sürükleyerek kamerayı döndür, tekerlek ile yakınlaştır |
| Gamepad | RT gaz, LT fren, A el freni, Y düzelt, RB kamera, sol çubuk direksiyon, sağ çubuk kamera |

## Proje yapısı
```
game/
  index.html, src/ui/style.css   arayüz
  src/main.js                    yükleme, oyun döngüsü, durumlar
  src/core/                      renderer + post-processing, ses, girdi
  src/world/                     arazi, splat shader, yollar, yerleşim, bitki örtüsü, impostor'lar
  src/game/                      araç, kamera, efektler, hayvanlar, görevler
  public/assets/                 indirilen ve web için optimize edilen varlıklar
  tools/                         varlık hazırlama ve test araçları
```

## Varlık hattı (tools/)
- `dem.mjs` — Terrarium yükseklik karolarını indirip birleştirir; `heightmap.mjs` — oyunun `height.bin` dosyalarını üretir.
- `stage-models.mjs` — indirilen GLB/glTF modellerini optimize eder (dedup, WebP doku, pivot düzeltme, çatı rengi).
- `audio.py` — sesleri normalize edip OGG/MP3'e dönüştürür.
- `design.mjs`, `layout-json.mjs`, `check-layout.mjs` — harita tasarım görseli ve yol/bina çakışma kontrolü.
- `viewer.html`, `shot.mjs`, `play.mjs` — model önizleme ve headless (Playwright) oyun testi; `?manual` parametresi oyunu adım adım ilerletir.
