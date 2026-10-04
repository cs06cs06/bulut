# Tozlu Yollar — Palouse Offroad

Stilize, açık dünya bir **country offroad** sürüş oyunu. Pikabınla Washington eyaletindeki gerçek **Palouse tepeleri** ve **Steptoe Butte** arazisinde (3,3 × 3,3 km oynanabilir alan + 6,6 km ufuk) buğday tarlaları, toprak yollar ve çiftlikler arasında keşfe çıkıyorsun.

Tarayıcıda çalışır (three.js + Rapier fizik motoru, WebGL2). **Bilgisayarda ve mobilde oynanır.**

▶ **Oyna:** https://cs06cs06.github.io/bulut/tozlu-yollar/

## Özellikler
- **Yük treni:** Haritanın doğusunu boydan boya geçen demiryolu (raylar araziye yarma ve dolgu olarak oyulmuş); dizel lokomotif ve yedi vagonlu tren sefer yapar, hemzemin geçitlerde kırmızı lambalar yanıp söner, zil çalar, tren düdük öter; trafik treni bekler. Trenin önünden kıl payı geçmek beceri zincirine büyük puan yazar.
- **Sürücüler:** Senin aracında, trafikteki ve rakip araçlarda direksiyon başında animasyonlu sürücüler; camlar artık hafif saydam.
- **Sığır gütme:** İnekli çiftliklerin ilan panolarında yeni iş: kaçan 5 ineği arkalarından sürerek ağıla geri getir (inekler arabadan kaçar, sürü halinde kalır).
- **Ayrıntılar:** Şafakta vadilere çöken sabah sisi, fotoğraf modunda arabaya odaklanan alan derinliği, kornaya el sallayan kasabalılar.
- **Palouse’un insanları:** Kasabanın kaldırımlarında dolaşan, dükkân önlerinde sohbet eden, banklarda oturan kasabalılar; panayırda satıcılar ve ziyaretçiler; göl kıyısında kamp ateşinin başında kampçılar ve oltacı; vadide piknik yapan aile; çiftliklerde çalışan çiftçiler; yol kenarında koşanlar. Araba yaklaşınca kenara kaçarlar (animasyonlu Kenney Mini Characters).
- **Komşularla sohbet:** Earl (benzinlik), Rosie (postane), Şerif Dale (devriye arabasının yanında), Martha (Su Kulesi Çiftliği) ve Hank (Kuzey Sprinti bayrağı) dünyada isim etiketleriyle durur; yanlarına gidip F ile konuşursun.
- **Otostopçular:** Yol kenarında el sallayanları arabaya al, gideceği yere bırak; mesafeye göre ücret, zamanında varırsan bahşiş, sarsarsan şikâyet.
- **Daha dolu harita:** Göl Kampı, Kasaba Panayırı (tezgâhlar, fenerler gece yanar), Vadi Pikniği, göl kıyısında oltacı; trafikte şerifin devriye arabası, sedan, hatchback, kargo kamyoneti ve taksi.
- **Hikâye — “Palouse’a Dönüş”:** Deden Walt’ın çiftliğini ve emektar pikabını miras aldın. 8 bölüm boyunca tamirci Earl, komşu Martha, postacı Rosie ve Şerif Dale sana iş verir; çiftliğe göz diken Dawson ailesinin oğlu Hank ile yarışırsın; dedenin kayıp kamyonunu bir ahırda bulup restore edersin. Diyalog paneli, bölüm hedefleri ve harita işaretleri.
- **Ahır buluntuları (Forza Horizon’dan):** Haritadaki kesikli dairelerde söylentiler var; eski ahırda paslanmış bir araç bulup garajda restore et (Dedenin Kamyonu, Eski Minibüs).
- **Beceri zinciri:** Drift, uçuş, kıl payı geçiş, hız, arazi koşusu, çit kırma ve hayvan ürkütme tek bir puanda birleşir; her numara çarpanı ×0,1 artırır, 4 saniye ara verince puan paraya dönüşür, çarpışma zinciri kırar.
- **Geri sarma:** T basılı tutulunca son 10 saniye geri sarılır (yarışlarda kapalı).
- **Yardımcı pilot notları:** Yarışlarda virajlar 1 (keskin) – 6 (hafif) arası derecelendirilip önceden gösterilir; tümsek ve atlama uyarıları.
- **Vinç ve 4x4 düşük vites (SnowRunner’dan):** X ile en yakın ağaca, direğe ya da binaya kablo bağlayıp kendini çek; Q ile düşük vitese geç, dik yokuşları tırman.
- **Harita keşfi ve gözetleme kuleleri:** Harita parşömen sisiyle başlar, sürdükçe açılır; 4 eski gözetleme kulesi geniş bir bölgeyi bir anda açar.
- **Fotoğraf görevleri:** Fotoğraf modunda 7 görev: şapel, Kırmızı Ahır, türbin, zirvede akşam, gece kasaba, uçan kamyon, göl kıyısı.
- **Gerçek arazi:** AWS Terrain Tiles yükseklik verisinden üretilmiş 3,3 km'lik heightfield, LOD arazi parçaları, Rapier çarpışması; yollara oyulmuş toprak rampalar.
- **Stilize görünüm:** El boyaması dokular, kalibre edilmiş country paleti, buğday/sürülmüş/yeşil tarla parselleri, bulut gölgeleri, AO, bloom; uzak ağaçlar için impostor sistemi.
- **Gün döngüsü:** 24 dakikada bir tam gün: güneş gökyüzünde ilerler, gökyüzü sabahtan gün batımına, yıldızlı geceye ve şafağa yumuşakça geçer (boyalı güneş ışıkla hizalanır); hava kararınca farlar ve sokak lambaları kendiliğinden yanar, HUD'da saat. İstenirse sabit öğle / gün batımı / gece.
- **Hava:** Değişken hava: fırtına gökyüzü, yağmur, su birikintileri, kayganlaşan yol, gök gürültüsü ve şimşek.
- **Teslimat işleri:** Çiftliklerdeki ilan panolarından saman balyası, balkabağı kasası ve süt varili taşı. Yük kasada fiziksel olarak durur; sert sürüşte düşer. Ödeme mesafeye, sağlam kalan yüke ve süre bonusuna göre.
- **Ekonomi ve garaj:** Kazandığın parayla Çiftlik Traktörü, Arazi SUV, GAZ-67 Cip ve Canavar Kamyon satın al; motor, lastik ve süspansiyon geliştir; boya seç.
- **Görevler:** 4 zamana karşı parkur (Zirve Tırmanışı, Zirve İnişi, Çiftlik Rallisi, Vadi Turu) altın/gümüş/bronz madalyalarla; 5 hız kapanı ve 4 atlama rampası (rekor ve yıldızlar); havada kalma ve drift puanı.
- **Steptoe Kasabası:** Ana yol boyunca dükkânlar, bakkal, Fıçı Lokantası, kırmızı çatılı Kır Şapeli, çiftçi pazarı tezgâhı, depo, su kulesi, tahıl siloları, sokak lambaları (gece yanar) ve sokak eşyalarıyla küçük bir kasaba.
- **Benzinlik:** Durunca nitro deposu dolar, F ile yıkama ($25) ve hasar tamiri. Modelin foto-gerçekçi dokuları, dünyanın stilize görünümüne uysun diye varlık hattında düz renklere dönüştürülür.
- **Posta turu:** Kasaba postanesinden 5 posta kutusuna mektup dağıt; kutunun yanında yavaşlaman yeterli, süre bonusu var.
- **Nitro:** Shift ile harcanan, kendiliğinden dolan nitro deposu ve gösterge.
- **Kırsal doku:** Yol kenarında elektrik direkleri ve teller, sırtlarda dönen rüzgâr türbinleri, tarlalarda saman sıraları, terk edilmiş barakalar, rüzgâr pompaları, yol kenarı çitleri.
- **Akıllı kamera:** Takip kamerası binalara, ağaçlara ve kayalara girmez, önlerine yaklaşır.
- **Rakip yarışları:** 3 yarış (Kuzey Sprinti, Batı Kupası, Güney Derbisi), her birinde 3 yapay zekâ rakip: viraj hızını hesaplar, sollar, tümseklerden uçar, süspansiyonu yaylanır, toz kaldırır, gece farları yanar. Grid çıkışı, canlı sıralama, para ödülü, ilk zafer bonusu.
- **Hasar:** Çarpışma noktasında kaporta içeri göçer, boya kazınır; ağır hasarda motor duman atar ve güç kaybeder. Garajda veya benzinlikte tamir; hasar her araç için ayrı kaydedilir.
- **Sürücü seviyesi:** Kazanılan her dolar tecrübe puanı; seviye atladıkça para ödülü ve yeni boyalar (krem, turuncu, siyah, beyaz, altın).
- **Sinematik kamera:** Pist kenarı teleobjektif, drone takibi, alçak takip ve helikopter çekimleri arasında kendiliğinden geçiş.
- **Hayalet rekor:** Zamana karşı görevlerde en iyi turun yarı saydam hayaleti seninle yarışır.
- **Günlük görevler:** Her gün 3 yeni görev (teslimat, drift, atlayış, hız kapanı…), hepsine +$500 bonus.
- **Çamur:** Arazide sürdükçe araç alttan yukarı çamurlanır (yağmurda daha hızlı); Söğüt Göleti’nden geçerek veya garajda yıkanır.
- **Yer işareti:** Büyük haritaya tıklayınca dünyada yeşil ışık sütunu ve mini haritada hedef.
- **Keşif:** 22 keşif noktası, 27 gizli balkabağı, haritadan hızlı seyahat; 24 başarım ve istatistik ekranı.
- **Canlı dünya:** Tarlaların üzerinde dönen kuş sürüleri (yakınından geçince havalanır), gece ateş böcekleri, gölette su sıçraması; 8 çiftlik, animasyonlu inek/at/eşek/alpaka/tavuk, kaçan geyik sürüleri, yollarda dolaşan traktör/kamyonet/kamyon trafiği, devrilebilir çitler, itilebilir saman balyaları.
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
| Shift | Nitro |
| R | Aracı düzelt |
| C | Kamera (takip / uzak / kaput / sinematik) |
| H | Korna |
| L | Farlar |
| P | Fotoğraf modu (fotoğraf görevleri) |
| T (basılı) | Geri sar |
| X | Vinç bağla / bırak |
| Q | 4x4 düşük vites |
| F | İlan panosu ($) / görev veya yarış başlat / posta turu / benzinlikte yıkama + tamir / diyalog / iptal |
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
- `stage-models.mjs` — indirilen GLB/glTF modellerini optimize eder (dedup, WebP doku, pivot düzeltme, çatı rengi, foto dokuları düz renge çevirme).
- `audio.py` — sesleri normalize edip OGG/MP3'e dönüştürür.
- `design.mjs`, `layout-json.mjs`, `check-layout.mjs` — harita tasarım görseli ve yol/bina çakışma kontrolü.
- `viewer.html`, `shot.mjs`, `play.mjs` — model önizleme ve headless (Playwright) oyun testi; `?manual` parametresi oyunu adım adım ilerletir.
