# Çuval Yarışı: Tosun Paşa'nın Kır Eğlencesi

Kartal Tibet'in yönettiği **Tosun Paşa** (1976) filminde, İskenderiye Beyi Daver Bey'in düzenlediği kır eğlencesinde çığırtkan "Şimdi de kadınlar arası çuval yarışı!" diye seslenir. Kadınlar aynı hizaya dizilir, çuvalları bellerine kadar çeker ve davul eşliğinde zıplayarak yarışır. Tellioğulları bu eğlencedeki halat çekme dışındaki bütün oyunları kazanır. Bu oyun o sahneyi telefonda oynanabilen 3D bir ritim yarışına dönüştürür.

Ticari olmayan bir hayran oyunudur. Filmin görüntüsü ya da sesi kullanılmamıştır; karakterler oyun için yeniden yorumlanmıştır.

## Oynanış

- **Dokun, zıpla.** Ekranın herhangi bir yerine dokun (klavyede `Boşluk`).
- **Ritmi yakala.** İnişten hemen sonra halka yeşil yanar. O anda dokunmak **MÜKEMMEL** sayılır, kombo artar ve zıplayış uzar.
- **Panik yapma.** Havadayken basmak dengeyi bozar. Denge çubuğu dolarsa yere kapaklanırsın.
- **HÜCUM!** Mükemmel zıplayışlar coşku biriktirir. Daire dolunca HÜCUM'a bas (klavyede `H`): birkaç saniye düşmeden hızlı zıplarsın.
- 3 Tellioğlu kadını (Adile, Zekiye, Hatice) 3 Seferoğlu kadınına karşı yarışır. Sıralama takım puanına yazılır.
- Karakterlerin güç / denge / çeviklik değerleri zıplama mesafesini, temposunu ve hata toleransını değiştirir. Kolay, Orta, Zor seviyeleri var.

## Neler var

- **İskeletli, animasyonlu karakterler:** Quaternius'un gerçek oranlı taban karakterleri köylü kıyafetleri ve başlıklarla giydirildi. Başlık başörtüsü olarak kullanılıyor, erkeklerde fes ve sakal var. Kıyafetler shader'da renk maskesiyle boyanıyor: krem kumaş takım rengine dönüyor, kahve deri ve korse aynen kalıyor (Tellioğulları kırmızı, Seferoğulları mavi tonlar).
- **Çuval içinde gerçek animasyon:** Gövde Universal Animation Library'den gelen bekleme, zıplama, düşme ve dans animasyonlarıyla oynar. Bacaklar çuvalın içinde sabitlenir, eller iki kemikli IK ile çuval ağzını kavrar ve zıplarken yukarı çeker.
- **Sinematik giriş:** Daver Bey'in kadife gölgelikli köşkünde iskeletli misafirler oturur (Leyla, apoletli sahte Tosun Paşa, Lütfü, Sıtkı, Akil). Masada Poly Haven çay takımı, nar ve elmalar var. Çığırtkan mendili havaya kaldırarak anons eder, davulcu IK ile tokmak ve çubukla davula vurur, yarışmacılar çuvallarını beline çeker.
- **Seyirciler:** İskeletli karakterlerin farklı pozları (alkış, kollar kavuşturulmuş, ipe yaslanma, sohbet) statik geometriye pişirilip örneklenir. Kazık ve ip çitin arkasında heyecana göre zıplarlar.
- **Çevre:** Stylized Nature MegaKit ağaçları, çalıları, çiçekleri, çimen öbekleri; yapraklar ve otlar rüzgârda salınır. Ayrıca PBR çuval bezi, çimen ve kadife dokuları, HDRI ortam ışığı, gerçek zamanlı gölgeler ve prosedürel bulutlu gökyüzü var.
- **Ses:** Davul ve zurna tarayıcıda gerçek zamanlı sentezlenir (Hicaz makamı); mükemmel zıplayışların davula vurgu katar. Çığırtkan anonsları (cihazda Türkçe ses varsa konuşarak), altyazılar, ağır çekim bitiş, kopan kurdele ve konfeti de var.
- **Mobil öncelikli:** Dikey ve yatay ekran, güvenli alan desteği, titreşim, 3 kalite seviyesi var. Zayıf cihazlar otomatik olarak düşük kaliteyle açılır. Seviye ayrıntısı (LOD) düzeyleri: oyuncu tam detay, köşk orta, kalabalık düşük. Çözünürlük kendiliğinden ayarlanır. PWA olarak çevrimdışı çalışır.
- İsteğe bağlı **Yeşilçam filtresi**: 1976 film havası için sepya, gren ve çizik.

## Asset hattı

Ham paketler `tools/build-assets.mjs` ile mobil için işlenir:

- Gereksiz UV ve renk kanalları atılır, dokular WebP'ye çevrilip 1024/512/256 piksele küçültülür.
- Tam gövdeden sadece baş ve boyun kesilir; kıyafetin altında kalan gövde hiç çizilmez.
- Karakter parçaları için 3 detay düzeyi üretilir (meshoptimizer ile sadeleştirme).
- Animasyon kütüphanelerinden yalnızca kullanılan klipler alınır. Ölçek kanalları ve gereksiz ötelemeler atılır, kareler yeniden örneklenir; böylece 15 MB'tan 0,5 MB'a iner.
- Doğa ve obje setleri ortak dokuları paylaşan tek GLB'lere birleştirilir. Ağaç kabukları ayrıca sadeleştirilir.

```bash
npm i @gltf-transform/core@4 @gltf-transform/functions@4 @gltf-transform/extensions@4 sharp meshoptimizer
node tools/build-assets.mjs <ham-paketler> assets/models
```

`tools/lab.html` karakter birleştirme, boyama ve poz pişirmeyi tek başına görmek için bir test sahnesidir.

## Çalıştırma

Statik dosyalardan oluşur, derleme adımı yoktur. ES modülleri ve `fetch` kullandığı için bir HTTP sunucusundan açılmalıdır:

```bash
cd cuval-yarisi
npx http-server -p 8080 .
# ya da: python3 -m http.server 8080
```

Sonra telefondan aynı ağdaki `http://<bilgisayar-ip>:8080` adresini aç. GitHub Pages ile yayınlanırsa doğrudan telefondan oynanır.

## Dosya yapısı

| Dosya | Görev |
| --- | --- |
| `js/main.js` | Oyun döngüsü, durumlar, kamera, sinematik, HUD, menüler |
| `js/racer.js` | Zıplama fiziği, ritim değerlendirmesi, denge/düşme, yapay zekâ |
| `js/characters.js` | İskeletli karakter birleştirme, kıyafet boyama, animasyon, IK, kalabalık poz pişirme |
| `js/racerModel.js` | Çuvallı yarışmacı: karakter + çuval, bacak sabitleme, el IK'sı |
| `js/people.js` | Çuval bezi dokusu ve geometrisi, renkli geometri yardımcıları |
| `js/world.js` | Çayır, pist, ip çit, köşk, seyirciler, davulcu ve çığırtkan, doğa, çimen, gökyüzü |
| `js/audio.js` | Ses motoru, davul-zurna sentezi, çığırtkan sesi |
| `js/fx.js` | Toz, çimen kırıntısı, konfeti parçacıkları |
| `js/config.js` | Karakterler, zorluk seviyeleri, fizik sabitleri |

## Harici asset'ler ve lisanslar

Tüm asset'ler serbest lisanslı kaynaklardan indirilip mobil için yeniden işlendi.

| Asset | Kaynak | Lisans |
| --- | --- | --- |
| Taban karakterler (kadın/erkek baş, göz, kaş, sakal) | [Quaternius – Universal Base Characters](https://quaternius.com/packs/universalbasecharacters.html) | CC0 |
| Köylü kıyafetleri, başlık | [Quaternius – Modular Character Outfits: Fantasy](https://quaternius.com/packs/modularcharacteroutfitsfantasy.html) | CC0 |
| Animasyonlar | [Quaternius – Universal Animation Library 1 ve 2](https://quaternius.com/packs/universalanimationlibrary.html) | CC0 |
| Ağaç, çalı, çiçek, çimen, taş | [Quaternius – Stylized Nature MegaKit](https://quaternius.com/packs/stylizednaturemegakit.html) | CC0 |
| Sandalye, elma fıçısı | [Quaternius – Fantasy Props MegaKit](https://quaternius.com/packs/fantasypropsmegakit.html) | CC0 |
| Çay takımı, nar, elma, oymalı tabak, ahşap kâse, pirinç fener, hasır sepet | [Poly Haven](https://polyhaven.com/models) | CC0 |
| `ballawley_park` HDRI | [Poly Haven](https://polyhaven.com/a/ballawley_park) | CC0 |
| `hessian_230` (çuval bezi), `leafy_grass` (çimen), `velour_velvet` (kadife) dokuları | [Poly Haven](https://polyhaven.com/textures) | CC0 |
| İniş ve arayüz sesleri | [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds), [Interface Sounds](https://kenney.nl/assets/interface-sounds) | CC0 |
| Alkış, kalabalık, "ooo", kuş sesleri | [OpenGameArt.org](https://opengameart.org) | CC0 |
| Lilita One, Nunito yazı tipleri | Google Fonts | SIL OFL 1.1 |
| three.js r170 | [threejs.org](https://threejs.org) | MIT |

## Test

`?test=1` parametresiyle açıldığında simülasyon dışarıdan adım adım ilerletilebilir (`window.__game.advance(saniye)`); otomatik testler ve zorluk dengesi ölçümleri bununla yapıldı.
