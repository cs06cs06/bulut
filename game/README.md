# Tozlu Yollar — Palouse Offroad

Stilize, açık dünya bir **country offroad** sürüş oyunu. Pikabınla Washington eyaletindeki gerçek **Palouse tepeleri** ve **Steptoe Butte** arazisinde (3,3 × 3,3 km oynanabilir alan + 6,6 km ufuk) buğday tarlaları, toprak yollar ve çiftlikler arasında keşfe çıkıyorsun.

Tarayıcıda çalışır (three.js + Rapier fizik motoru, WebGL2). **Bilgisayarda ve mobilde oynanır.**

▶ **Oyna:** https://cs06cs06.github.io/bulut/tozlu-yollar/

## Özellikler
- **Gerçek arazi:** AWS Terrain Tiles yükseklik verisinden üretilmiş 3,3 km'lik heightfield, LOD arazi parçaları, Rapier çarpışması; yollara oyulmuş toprak rampalar.
- **Stilize görünüm:** El boyaması dokular, kalibre edilmiş country paleti, buğday/sürülmüş/yeşil tarla parselleri, bulut gölgeleri, AO, bloom; uzak ağaçlar için impostor sistemi.
- **Hava ve zaman:** Öğle, gün batımı ve yıldızlı gece (farlarla); değişken hava: fırtına gökyüzü, yağmur, su birikintileri, kayganlaşan yol, gök gürültüsü ve şimşek.
- **Teslimat işleri:** Çiftliklerdeki ilan panolarından saman balyası, balkabağı kasası ve süt varili taşı. Yük kasada fiziksel olarak durur; sert sürüşte düşer. Ödeme mesafeye, sağlam kalan yüke ve süre bonusuna göre.
- **Ekonomi ve garaj:** Kazandığın parayla Arazi SUV ve Canavar Kamyon satın al; motor, lastik ve süspansiyon geliştir; boya seç.
- **Görevler:** 4 zamana karşı parkur (Zirve Tırmanışı, Zirve İnişi, Çiftlik Rallisi, Vadi Turu) altın/gümüş/bronz madalyalarla; 5 hız kapanı ve 4 atlama rampası (rekor ve yıldızlar); havada kalma ve drift puanı.
- **Keşif:** 13 keşif noktası, 27 gizli balkabağı, haritadan hızlı seyahat; 16 başarım ve istatistik ekranı.
- **Canlı dünya:** 5 çiftlik, animasyonlu inek/at/eşek/alpaka/tavuk, kaçan geyik sürüleri, yollarda dolaşan traktör/kamyonet/kamyon trafiği, devrilebilir çitler, itilebilir saman balyaları.
- **Fotoğraf modu:** Serbest kamera, filtreler (Sepya, Siyah-Beyaz, Canlı, Western), PNG kaydetme.
- **Ses:** Devre göre katmanlı motor sesi, çakıl/patinaj, çarpışma, yağmur ve gök gürültüsü, kır ambiyansı, Kevin MacLeod'un country/bluegrass parçaları.
- **Platformlar:** Masaüstü (klavye/fare/gamepad) ve mobil (dokunmatik direksiyon çubuğu, pedallar, tam ekran, PWA).

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
| L | Farlar |
| P | Fotoğraf modu |
| F | İlan panosu ($) / bayrakta görev başlat / iptal |
| M / N | Müzik aç-kapa / sonraki parça |
| Tab / Esc | Harita ve duraklatma menüsü |
| Fare | Sürükleyerek kamerayı döndür, tekerlek ile yakınlaştır |
| Gamepad | RT gaz, LT fren, A el freni, Y düzelt, RB kamera, sol çubuk direksiyon, sağ çubuk kamera |

## Mobil
- Telefon/tabletler otomatik algılanır: daha hafif arazi ızgarası (1025²), seyrek bitki örtüsü ve “Düşük” grafik ayarı.
- Dokunmatik kontroller: sol altta analog direksiyon çubuğu, sağ altta GAZ / FREN / EL FRENİ / TURBO, üstte harita · kamera · düzelt · korna · şarkı; boş ekranı sürüklemek kamerayı döndürür. Görev bayrağı yanında çıkan uyarıya dokunarak görev başlar.
- Oyuna başlarken tam ekran ve yatay yön kilidi istenir (Android). iPhone'da tam ekran için Paylaş → “Ana Ekrana Ekle” (PWA manifest'i hazır).
- Ogg Vorbis desteklemeyen tarayıcılar (eski iOS Safari) için AAC (.m4a) ses dosyaları yüklenir.
- Test için masaüstünde `?mobile` parametresiyle mobil mod zorlanabilir.

## Yayınlama (GitHub Pages)
`.github/workflows/pages.yml` her push'ta oyunu derler ve `gh-pages` dalına `tozlu-yollar/` klasörü olarak yayınlar (`pages/index.html` site ana sayfasıdır). Depo ayarlarında **Settings → Pages → Source: Deploy from a branch → `gh-pages` / root** seçili olmalıdır.

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
