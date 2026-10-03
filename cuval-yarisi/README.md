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

- **Gerçekçi karakterler:** Bütün insanlar [Microsoft Rocketbox](https://github.com/microsoft/Microsoft-Rocketbox) avatar kütüphanesinden (MIT) geliyor. FBX'ler `tools/build-rocketbox.cjs` ile GLB'ye çevrilir, dokular WebP'ye, geometri meshopt ile sıkıştırılır (avatar başına ~7 bin üçgen, kalabalık LOD'u ~2,5 bin). Yarışmacılar entari ve yemenili `Female_Adult_06`; her birinin entarisi (çizgili kırmızı/mavi, pembe vb.), yemenisinin çiçek deseni ve oyası `tools/rocketbox-textures.py` ile ayrı ayrı yeniden boyanır. Erkekler takım elbise ve yelekli Rocketbox avatarları; başlarına Printables'tan indirilen bir fes (Esteban Chardonnet, CC BY) kemiğe bağlanarak giydirilir, takımlarda kuşak takılır.
- **Hareket yakalama:** Bekleme, sevinç, alkış, dans, el sallama, konuşma, anons, oturma, gülme ve onaylama klipleri Rocketbox'ın 400'ü aşkın mocap animasyonundan seçilip yalnızca biped kemik dönüşleri bırakılarak sıkıştırılır (toplam ~2 MB). Klipler arasında yumuşak geçiş yapılır.
- **Canlı yüzler:** Rocketbox yüz kemikleriyle göz kapakları kırpılır, çene konuşurken, sevinirken, zorlanırken ve şaşırırken açılır.
- **Halat çekme:** Filmdeki kır eğlencesinde Tellioğulları'nın kaybettiği tek oyun. Dörder delikanlı (Tellioğulları'nda Şaban da var) pistin ortasında ipe asılır; fesli, kuşaklı erkekler geriye yaslanıp çömelir, bacaklar ve eller IK ile yere ve ipe oturur. İp her karede yeniden kurulan lif dokulu bir tüptür, gerginliğe göre sarkar; ortadaki kırmızı kurdele kireç çizgisini geçince oyun biter. Oyuncu davul-zurnanın her "güm"ünde ÇEK!'e dokunur: tam vuruş tam güç verir, kaçırmak ve arka arkaya basmak nefesi tüketir. Art arda mükemmel çekişler seri kurar ve HEP BERABER göstergesini doldurur (basınca birkaç vuruş tüm takım tek yürek asılır). Seferoğulları ara ara toplu asılır, formu değişir; zorluk seviyeleri insan benzeri zamanlama hatasıyla simüle edilerek ayarlandı. Sonunda kazananlar sevinir, kaybedenler sürüklenir.
- **Kır eğlencesi turnuvası:** Menüden "Kır eğlencesi" seçilince çuval yarışı ve halat çekme art arda oynanır. Çuval yarışının takım puanlarına halat çekmenin galibi için 10 puan eklenir, şampiyon aile ilan edilir.
- **Çamur birikintileri:** Her kulvarda iki ıslak çamur birikintisi var; yüzey gökyüzünü yansıtır, basılınca halka halka dalgalanır. Çamura inen yarışmacının çuvalı kirlenir (kumaşın alt kısmı düzensiz bir çizgiye kadar çamurlanır, sıçrama lekeleri olur, ıslakken parlar), kahverengi damlalar sıçrar, "şlap" sesi gelir. Çamurdan ancak MÜKEMMEL bir zıplayışla temiz çıkılır; yoksa çuval yapışır, yavaşlarsın ve dengen sarsılır. Kural rakipler için de geçerlidir.
- **Etkileşimli eğitim:** İlk yarışta koç devreye girer: ilk dokunuşa kadar zaman durur, yeşil pencerede zaman yavaşlar ve "ŞİMDİ!" yanar; ilk çamurda ve coşku ilk dolduğunda (HÜCUM) yine yavaşlayıp ne yapılacağını söyler. "Nasıl oynanır?" ekranından istendiğinde yeniden oynanabilir.
- **Kumaş simülasyonu ile çuval:** Çuval artık sert bir model değil, konum tabanlı dinamik (PBD) bir kumaş: 20×12 parçacık, mesafe, kesme ve eğilme kısıtları. Gerçek un çuvalı gibi düz dikilmiş bir torbadır; altında dikiş çizgisi ve iki köşe "kulağı", üstünde dışa kıvrılmış kalın bir ağız kenarı vardır. Ağız ellerde ve belde tutulur (elin olduğu yerde kumaş toplanır), içerideki bacak ve ayaklarla çarpışır, inişte yere yayılıp sürtünür, zıplarken savrulur, düşünce yere serilir; girişte dizlerdeyken yere yığılır. Kumaşın sıkıştığı yerlerde kıvrımlar oluşur: geometride gerçek katlar, gölgelendiricide sıkışmaya bağlı kırışık kabartması, kıvrım diplerinde ve yere değen kısımda koyulaşma. Görüntü ağı simülasyondan Catmull-Rom ile 52×30 çözünürlükte üretilir; 6 çuvalın hepsi kare başına yaklaşık 2,5 ms tutar (düşük kalitede daha az).
- **Çuval içinde animasyon:** Yarışmacının belden aşağısı çuvalın içinde kalır (gölgelendiricide dinlenme pozundaki yüksekliğe göre kesilir), eller iki kemikli IK ile çuval ağzını kavrar ve zıplarken yukarı çeker.
- **Sinematik giriş:** Daver Bey'in kadife gölgelikli köşkünde fesli misafirler Poly Haven sandalyelerinde oturur (Leyla pembe entarisiyle, kuşaklı sahte Tosun Paşa, Lütfü, Sıtkı, Akil); konuşanlar el kol hareketi yapar. Masada Poly Haven çay takımı, nar ve elmalar var. Çığırtkan anons klibiyle mendili sallar, davulcu IK ile tokmak ve çubukla davula vurur, yarışmacılar çuvallarını beline çeker.
- **Seyirciler:** Rocketbox avatarlarının sadeleştirilmiş kopyaları mocap kliplerinin bir anında (alkış, sevinç, sohbet, el sallama) dondurulup statik geometriye pişirilir ve örneklenir; çarşaflı kadınlar, renkli entarili köylü kadınlar, fesli erkekler. Kazık ve ip çitin arkasında heyecana göre zıplarlar.
- **Çevre:** Bütün bitki ve eşyalar Poly Haven'dan (CC0). Ağaçlar (zeytin benzeri ada ağaçları, ince gövdeli ağaç, çam) 1–7 milyon üçgenlik taramalar olduğundan tarayıcıda üç açıdan render edilip tek bir atlasa basılır ve 60°'lik kesişen düzlemlere giydirilir (ağaç başına 6 üçgen). Çalılar, eğrelti, kır çiçekleri (gazanya, ursinia, kırlangıçotu, karahindiba, cezayir menekşesi), çimen öbekleri, yosunlu taşlar ve kütük sadeleştirilip örneklenir; yapraklar ve otlar rüzgârda salınır. Davulcunun yanında boyalı bank, testi, sepet ve kova; başlangıç ve bitişte fıçı, sandık, katlanır tabure durur. Ayrıca PBR çuval bezi, çimen ve kadife dokuları, HDRI ortam ışığı, gerçek zamanlı gölgeler ve prosedürel bulutlu gökyüzü var.
- **Yarış müziği:** "Başla!" ile birlikte Santuri Ethem Efendi'nin Tosun Paşa filminde de çalan "Şehnaz Longa"sı girer. Fasıl topluluğu düzenlemesinde keman ve klarnet ezgiyi, arp (kanun yerine) ve naylon gitar (ud yerine) heterofoniyi, darbuka ve def Sofyan usulünü çalar. Perdeler 53 koma sisteminden pitch bend ile seslendirilir, böylece Şehnaz'ın Hicaz aralıkları korunur. Müzik döngüye girer, sonuç ekranında sürer, HÜCUM'da hafifçe hızlanır; davulcu animasyonu vuruşlara kilitlidir. Ana menüye dönünce susar.
- **Ses:** Menü ve girişte davul ve zurna tarayıcıda gerçek zamanlı sentezlenir (Hicaz makamı); mükemmel zıplayışların davula vurgu katar. Çığırtkan anonsları (cihazda Türkçe ses varsa konuşarak), altyazılar, ağır çekim bitiş, kopan kurdele ve konfeti de var.
- **Mobil öncelikli:** Dikey ve yatay ekran, güvenli alan desteği, titreşim, 3 kalite seviyesi var. Zayıf cihazlar otomatik olarak düşük kaliteyle açılır. Seviye ayrıntısı (LOD) düzeyleri: oyuncu tam detay, köşk orta, kalabalık düşük. Çözünürlük kendiliğinden ayarlanır. PWA olarak çevrimdışı çalışır.
- İsteğe bağlı **Yeşilçam filtresi**: 1976 film havası için sepya, gren ve çizik.

## Asset hattı

Ham asset'ler `tools/` altındaki betiklerle mobil için işlenir (`npm i @gltf-transform/core@4 @gltf-transform/functions@4 @gltf-transform/extensions@4 sharp meshoptimizer playwright`):

```bash
# 1) Karakterler: Rocketbox deposundaki Assets klasörü + FBX2glTF
python3 tools/rocketbox-textures.py <Rocketbox/Assets> <doku-klasörü>        # TGA -> PNG, entari/yemeni varyantları
node tools/build-rocketbox.cjs <Rocketbox/Assets> <doku-klasörü> <FBX2glTF> <fez.stl> assets/avatars
# 2) Ağaç billboard'ları: Poly Haven glTF'leri tarayıcıda üç açıdan render edilir, sonra atlasa dizilir
OUT=<bake-klasörü> node tools/tree-bake.mjs island_tree_01 island_tree_02 island_tree_03 tree_small_02   # tree-bake.html, three/ ve ph/ klasörünü sunan bir sunucu gerekir
# çam: pine_tree_01'deki üç ağaçtan 'b' ayrı bir GLB'ye çıkarılıp F=/ph/pine_b/pine_b_1k.glb ile pişirilir (pine_b)
python3 tools/tree-atlas.py <bake-klasörü> trees_atlas.webp trees_atlas.json island_tree_01 island_tree_02 island_tree_03 tree_small_02 pine_b
# 3) Doğa, eşya ve masa takımı paketleri
node tools/build-assets.mjs <poly-haven-klasörü> trees_atlas.webp trees_atlas.json assets/models
```

Bitkiler sadeleştirilir, yaprak malzemeleri alfa maskeye çevrilir, köşe renkleri (Poly Haven'da maske olarak kullanılıyor) atılır, dokular WebP'ye küçültülür, geometri quantize edilip meshopt ile sıkıştırılır. `tools/avatar-lab.html` avatarları ve klipleri, `tools/env-lab.html` doğa/eşya paketlerini tek başına görmek için test sahneleridir.

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
| `js/avatars.js` | Rocketbox avatarları: yükleme, varyant dokuları, fes ve kuşak, mocap klipleri ve geçişler, göz kırpma/çene, çuval içi kesme, kol IK'sı, kalabalık poz pişirme |
| `js/racerModel.js` | Çuvallı yarışmacı: karakter + çuval, bacak sabitleme, el IK'sı |
| `js/tug.js` | Halat çekme: takımlar, poz ve IK, dinamik ip, vuruş ızgarası, YZ ve ip fiziği |
| `js/mud.js` | Çamur birikintileri: yerleşim, ıslak yüzey ve dalga gölgelendiricisi, çarpışma sorgusu |
| `js/sack.js` | Çuval kumaş simülasyonu (PBD), dinamik kıvrımlı görüntü ağı ve kırışık gölgelendiricisi |
| `js/people.js` | Çuval bezi dokusu ve geometrisi, renkli geometri yardımcıları |
| `js/world.js` | Çayır, pist, ip çit, köşk, seyirciler, davulcu ve çığırtkan, doğa, çimen, gökyüzü |
| `js/audio.js` | Ses motoru, davul-zurna sentezi, çığırtkan sesi |
| `js/fx.js` | Toz, çimen kırıntısı, konfeti parçacıkları |
| `js/config.js` | Karakterler, zorluk seviyeleri, fizik sabitleri |

## Harici asset'ler ve lisanslar

Karakter, çevre, obje, doku ve ses asset'leri serbest lisanslı kaynaklardan indirilip mobil için yeniden işlendi.

| Asset | Kaynak | Lisans |
| --- | --- | --- |
| Karakterler (Female_Adult_06/10, Business_Male_01–06, Male_Adult_15) ve hareket yakalama animasyonları | [Microsoft Rocketbox Avatar Library](https://github.com/microsoft/Microsoft-Rocketbox) | MIT |
| Fes ("Just a FEZ") | [Printables – Esteban Chardonnet](https://www.printables.com/model/601430) | CC BY |
| Ağaçlar (island_tree_01–03, tree_small_02, pine_tree_01), çalılar (shrub_02/03, searsia_lucida), eğrelti, kır çiçekleri, çimen öbekleri, yosunlu taşlar, kütük | [Poly Haven](https://polyhaven.com/models/nature) | CC0 |
| Sandalye, bank, tabureler, fıçılar, kova, sandık, sepetler, testi | [Poly Haven](https://polyhaven.com/models) | CC0 |
| Çay takımı, nar, elma, oymalı tabak, ahşap kâse, pirinç fener | [Poly Haven](https://polyhaven.com/models) | CC0 |
| `ballawley_park` HDRI | [Poly Haven](https://polyhaven.com/a/ballawley_park) | CC0 |
| `hessian_230` (çuval bezi), `leafy_grass` (çimen), `velour_velvet` (kadife) dokuları | [Poly Haven](https://polyhaven.com/textures) | CC0 |
| Yarış müziği notası: Santuri Ethem Efendi (1855–1926), "Şehnaz Longa" (beste kamu malı) | [SymbTr](https://github.com/MTG/SymbTr), M. K. Karaosmanoğlu, ISMIR 2012 | CC BY-NC-SA 4.0 (nota verisi ve ondan üretilen `assets/audio/tema.mp3`) |
| Müziği sese çeviren ses fontu: FluidR3 GM (Frank Wen) | [fluid-soundfont](https://packages.debian.org/fluid-soundfont-gm) | MIT |
| İniş ve arayüz sesleri | [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds), [Interface Sounds](https://kenney.nl/assets/interface-sounds) | CC0 |
| Alkış, kalabalık, "ooo", kuş sesleri | [OpenGameArt.org](https://opengameart.org) | CC0 |
| Lilita One, Nunito yazı tipleri | Google Fonts | SIL OFL 1.1 |
| three.js r170 | [threejs.org](https://threejs.org) | MIT |
| meshoptimizer (sıkıştırılmış geometri çözücüsü, three.js ile gelir) | [github.com/zeux/meshoptimizer](https://github.com/zeux/meshoptimizer) | MIT |

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
