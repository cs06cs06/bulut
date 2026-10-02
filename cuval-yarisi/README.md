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

- **Tamamen kodla üretilen karakterler:** Hiçbir karakter modeli indirilmez. Baş, eller, başörtüsü, fes ve katmanlı kıyafetler işaretli uzaklık alanlarıyla (SDF) heykel gibi yontulur, Web Worker'larda surface nets ile yüzeye çevrilir ve meshoptimizer ile hedef üçgen sayısına sadeleştirilir (oyuncu ~24 bin, orta ~9 bin, kalabalık ~1,6 bin üçgen). Bölge sınırları analitik sınıra kaydırılarak sırma kenarları pürüzsüz kalır.
- **Osmanlı kıyafetleri ve kumaş shader'ları:** Kadınlarda V yakalı kutnu entari, altın sırmalı ve lale motifli kadife yelek, çizgili kuşak, oyalı çiçekli yemeni; erkeklerde redingot (pirinç düğmeli), apoletli üniforma, köylü cepkeni ve şalvar, fes ve sakal. Desenler, sırma, kadife parlaklığı ve kabartma tek bir prosedürel shader'da çizilir; tek karakter 2 çizim çağrısıdır.
- **Canlı yüzler:** Göz kapağı, kirpik, kaş ve dudaklar morph hedefleriyle göz kırpar, gülümser, zorlanır, şaşırır. Bakış rastgele gezinir, konuşanların ağzı oynar, başörtüsünün ucu yaylı fizikle sallanır.
- **Kumaş simülasyonu ile çuval:** Çuval artık sert bir model değil, konum tabanlı dinamik (PBD) bir kumaş: 20×12 parçacık, mesafe, kesme ve eğilme kısıtları. Gerçek un çuvalı gibi düz dikilmiş bir torbadır; altında dikiş çizgisi ve iki köşe "kulağı", üstünde dışa kıvrılmış kalın bir ağız kenarı vardır. Ağız ellerde ve belde tutulur (elin olduğu yerde kumaş toplanır), içerideki bacak ve ayaklarla çarpışır, inişte yere yayılıp sürtünür, zıplarken savrulur, düşünce yere serilir; girişte dizlerdeyken yere yığılır. Kumaşın sıkıştığı yerlerde kıvrımlar oluşur: geometride gerçek katlar, gölgelendiricide sıkışmaya bağlı kırışık kabartması, kıvrım diplerinde ve yere değen kısımda koyulaşma. Görüntü ağı simülasyondan Catmull-Rom ile 52×30 çözünürlükte üretilir; 6 çuvalın hepsi kare başına yaklaşık 2,5 ms tutar (düşük kalitede daha az).
- **Çuval içinde animasyon:** Prosedürel iskelet "A" pozunda bağlanır, klipler (bekleme, zıplama, düşme, dans, alkış, el sallama) kodla üretilir. Bacaklar çuvalın içinde sabitlenir, eller iki kemikli IK ile çuval ağzını kavrar ve zıplarken yukarı çeker.
- **Sinematik giriş:** Daver Bey'in kadife gölgelikli köşkünde iskeletli misafirler oturur (Leyla, apoletli sahte Tosun Paşa, Lütfü, Sıtkı, Akil). Masada Poly Haven çay takımı, nar ve elmalar var. Çığırtkan mendili havaya kaldırarak anons eder, davulcu IK ile tokmak ve çubukla davula vurur, yarışmacılar çuvallarını beline çeker.
- **Seyirciler:** Prosedürel karakterlerin farklı pozları (alkış, sevinç, kollar kavuşturulmuş, eller belde, sohbet, el sallama) statik geometriye pişirilip örneklenir; kıyafet renkleri örnek başına boyanır. Kazık ve ip çitin arkasında heyecana göre zıplarlar.
- **Çevre:** Stylized Nature MegaKit ağaçları, çalıları, çiçekleri, çimen öbekleri; yapraklar ve otlar rüzgârda salınır. Ayrıca PBR çuval bezi, çimen ve kadife dokuları, HDRI ortam ışığı, gerçek zamanlı gölgeler ve prosedürel bulutlu gökyüzü var.
- **Yarış müziği:** "Başla!" ile birlikte Santuri Ethem Efendi'nin Tosun Paşa filminde de çalan "Şehnaz Longa"sı girer. Fasıl topluluğu düzenlemesinde keman ve klarnet ezgiyi, arp (kanun yerine) ve naylon gitar (ud yerine) heterofoniyi, darbuka ve def Sofyan usulünü çalar. Perdeler 53 koma sisteminden pitch bend ile seslendirilir, böylece Şehnaz'ın Hicaz aralıkları korunur. Müzik döngüye girer, sonuç ekranında sürer, HÜCUM'da hafifçe hızlanır; davulcu animasyonu vuruşlara kilitlidir. Ana menüye dönünce susar.
- **Ses:** Menü ve girişte davul ve zurna tarayıcıda gerçek zamanlı sentezlenir (Hicaz makamı); mükemmel zıplayışların davula vurgu katar. Çığırtkan anonsları (cihazda Türkçe ses varsa konuşarak), altyazılar, ağır çekim bitiş, kopan kurdele ve konfeti de var.
- **Mobil öncelikli:** Dikey ve yatay ekran, güvenli alan desteği, titreşim, 3 kalite seviyesi var. Zayıf cihazlar otomatik olarak düşük kaliteyle açılır. Seviye ayrıntısı (LOD) düzeyleri: oyuncu tam detay, köşk orta, kalabalık düşük. Çözünürlük kendiliğinden ayarlanır. PWA olarak çevrimdışı çalışır.
- İsteğe bağlı **Yeşilçam filtresi**: 1976 film havası için sepya, gren ve çizik.

## Asset hattı

Ham paketler `tools/build-assets.mjs` ile mobil için işlenir:

- Gereksiz UV ve renk kanalları atılır, dokular WebP'ye çevrilip 1024/512/256 piksele küçültülür.
- Doğa ve obje setleri ortak dokuları paylaşan tek GLB'lere birleştirilir. Ağaç kabukları ayrıca sadeleştirilir.

```bash
npm i @gltf-transform/core@4 @gltf-transform/functions@4 @gltf-transform/extensions@4 sharp meshoptimizer
node tools/build-assets.mjs <ham-paketler> assets/models
```

`tools/lab.html` prosedürel karakter üretimini, yüz ifadelerini ve poz pişirmeyi tek başına görmek için bir test sahnesidir (`?view=face&i=0`, `side`, `back`).

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
| `js/characters.js` | Prosedürel karakter: parça üretim havuzu, deri ağırlıkları, yüz morph'ları, kumaş shader'ı, klipler, IK, kalabalık poz pişirme |
| `js/proc/sdf.js` | SDF ilkelleri ve birleşimleri, surface nets yüzey çıkarımı |
| `js/proc/shapes.js` | İskelet, baş/yüz, başörtüsü, fes, el ve kıyafet heykelleri; bölge sınırı yumuşatma |
| `js/proc/worker.js` | Parçaları arka planda üretip meshoptimizer ile sadeleştiren Web Worker |
| `js/racerModel.js` | Çuvallı yarışmacı: karakter + çuval, bacak sabitleme, el IK'sı |
| `js/sack.js` | Çuval kumaş simülasyonu (PBD), dinamik kıvrımlı görüntü ağı ve kırışık gölgelendiricisi |
| `js/people.js` | Çuval bezi dokusu ve geometrisi, renkli geometri yardımcıları |
| `js/world.js` | Çayır, pist, ip çit, köşk, seyirciler, davulcu ve çığırtkan, doğa, çimen, gökyüzü |
| `js/audio.js` | Ses motoru, davul-zurna sentezi, çığırtkan sesi |
| `js/fx.js` | Toz, çimen kırıntısı, konfeti parçacıkları |
| `js/config.js` | Karakterler, zorluk seviyeleri, fizik sabitleri |

## Harici asset'ler ve lisanslar

Çevre, obje, doku ve ses asset'leri serbest lisanslı kaynaklardan indirilip mobil için yeniden işlendi. Karakterler indirilmez, kodla üretilir.

| Asset | Kaynak | Lisans |
| --- | --- | --- |
| Ağaç, çalı, çiçek, çimen, taş | [Quaternius – Stylized Nature MegaKit](https://quaternius.com/packs/stylizednaturemegakit.html) | CC0 |
| Sandalye, elma fıçısı | [Quaternius – Fantasy Props MegaKit](https://quaternius.com/packs/fantasypropsmegakit.html) | CC0 |
| Çay takımı, nar, elma, oymalı tabak, ahşap kâse, pirinç fener, hasır sepet | [Poly Haven](https://polyhaven.com/models) | CC0 |
| `ballawley_park` HDRI | [Poly Haven](https://polyhaven.com/a/ballawley_park) | CC0 |
| `hessian_230` (çuval bezi), `leafy_grass` (çimen), `velour_velvet` (kadife) dokuları | [Poly Haven](https://polyhaven.com/textures) | CC0 |
| Yarış müziği notası: Santuri Ethem Efendi (1855–1926), "Şehnaz Longa" (beste kamu malı) | [SymbTr](https://github.com/MTG/SymbTr), M. K. Karaosmanoğlu, ISMIR 2012 | CC BY-NC-SA 4.0 (nota verisi ve ondan üretilen `assets/audio/tema.mp3`) |
| Müziği sese çeviren ses fontu: FluidR3 GM (Frank Wen) | [fluid-soundfont](https://packages.debian.org/fluid-soundfont-gm) | MIT |
| İniş ve arayüz sesleri | [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds), [Interface Sounds](https://kenney.nl/assets/interface-sounds) | CC0 |
| Alkış, kalabalık, "ooo", kuş sesleri | [OpenGameArt.org](https://opengameart.org) | CC0 |
| Lilita One, Nunito yazı tipleri | Google Fonts | SIL OFL 1.1 |
| three.js r170 | [threejs.org](https://threejs.org) | MIT |
| meshoptimizer 0.25 (karakter sadeleştirme) | [github.com/zeux/meshoptimizer](https://github.com/zeux/meshoptimizer) | MIT |

## Yarış müziğini değiştirmek

Yarış müziği `js/config.js` içindeki `THEME` ayarından gelir. Başka bir parça çalmak için dosyayı `assets/audio/` altına koyup `url`'yi değiştirin; `bpm` ve `firstBeat` (ilk güçlü vuruşun saniyesi) davulcuyu müziğe kilitler, `loopBeats` döngünün kaç vuruşta kapanacağını belirler (bilinmiyorsa `0` verin, parça baştan sona döner). Telif hakkı süren bir parçayı (örneğin filmin kendi müziğini) yalnızca kişisel kopyanızda kullanın, depoya ya da yayınlanan sürüme eklemeyin.

Varsayılan parça `tools/tema-duzenle.py` ile yeniden üretilebilir:

```bash
pip install mido   # ayrıca: fluidsynth ve fluid-soundfont-gm paketleri
git clone --depth 1 https://github.com/MTG/SymbTr
python3 tools/tema-duzenle.py SymbTr/txt/sehnaz--longa--sofyan----santuri_ethem_efendi.txt tema.mid
fluidsynth -ni -F tema.wav -r 44100 -g 0.3 /usr/share/sounds/sf2/FluidR3_GM.sf2 tema.mid
ffmpeg -i tema.wav -af "atrim=0:79,afade=t=out:st=77.6:d=1.4,loudnorm=I=-16:TP=-1.5" -b:a 112k assets/audio/tema.mp3
```

`assets/audio/tema.mp3` SymbTr verisinden türetildiği için [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) lisanslıdır: ticari olmayan kullanım, atıf ve aynı lisansla paylaşım şartıyla.

## Test

`?test=1` parametresiyle açıldığında simülasyon dışarıdan adım adım ilerletilebilir (`window.__game.advance(saniye)`); otomatik testler ve zorluk dengesi ölçümleri bununla yapıldı.
