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

- three.js ile gerçek zamanlı 3D: PBR çuval bezi, çimen ve kadife dokuları, HDRI ortam ışığı, gerçek zamanlı gölgeler, rüzgârda salınan çimen, prosedürel bulutlu gökyüzü.
- Sinematik giriş: Daver Bey'in kadife gölgelikli köşkü (Leyla, sahte Tosun Paşa, Lütfü, Sıtkı, Akil masada), mendil sallayan çığırtkan, davulcu, çuvallarını beline çeken yarışmacılar.
- 400'ü aşkın fesli ve yemenili seyirci; heyecana göre zıplayıp alkışlarlar.
- Davul ve zurna tarayıcıda gerçek zamanlı sentezlenir (Hicaz makamı); mükemmel zıplayışların davula vurgu katar.
- Çığırtkan anonsları (cihazda Türkçe ses varsa konuşarak), altyazılar, ağır çekim bitiş, kopan kurdele, konfeti.
- Mobil öncelikli arayüz: dikey ve yatay ekran, çentik/güvenli alan desteği, titreşim, otomatik çözünürlük ayarı, PWA (ana ekrana eklenebilir, çevrimdışı çalışır).
- İsteğe bağlı **Yeşilçam filtresi**: 1976 film havası için sepya, gren ve çizik.

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
| `js/people.js` | Prosedürel karakterler (yarışmacılar, fesli erkekler, yemenili kadınlar), çuval dokusu |
| `js/world.js` | Çayır, pist, köşk, seyirciler, davulcu, ağaçlar, çimen, gökyüzü |
| `js/audio.js` | Ses motoru, davul-zurna sentezi, çığırtkan sesi |
| `js/fx.js` | Toz, çimen kırıntısı, konfeti parçacıkları |
| `js/config.js` | Karakterler, zorluk seviyeleri, fizik sabitleri |

## Harici asset'ler ve lisanslar

Tüm asset'ler serbest lisanslı kaynaklardan indirilip mobil için yeniden boyutlandırıldı / sıkıştırıldı.

| Asset | Kaynak | Lisans |
| --- | --- | --- |
| `ballawley_park` HDRI | [Poly Haven](https://polyhaven.com/a/ballawley_park) | CC0 |
| `hessian_230` (çuval bezi), `leafy_grass` (çimen), `velour_velvet` (kadife) dokuları | [Poly Haven](https://polyhaven.com/textures) | CC0 |
| Ağaç, çalı, çiçek, kütük modelleri | [Kenney Nature Kit](https://kenney.nl/assets/nature-kit) | CC0 |
| İniş ve arayüz sesleri | [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds), [Interface Sounds](https://kenney.nl/assets/interface-sounds) | CC0 |
| Alkış, kalabalık, "ooo", kuş sesleri | [OpenGameArt.org](https://opengameart.org) (Applause in a large hall, Crowd Shouting Ambience, OoOoOo, Park ambiences) | CC0 |
| Lilita One, Nunito yazı tipleri | Google Fonts | SIL OFL 1.1 |
| three.js r170 | [threejs.org](https://threejs.org) | MIT |

## Test

`?test=1` parametresiyle açıldığında simülasyon dışarıdan adım adım ilerletilebilir (`window.__game.advance(saniye)`); otomatik testler ve zorluk dengesi ölçümleri bununla yapıldı.
