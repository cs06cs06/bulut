# PENALTI — Seri Atışlar

Gece maçı atmosferinde, sinematik render ile hazırlanmış **seri penaltı** oyunu. Tarayıcıda çalışır (WebGL2), kurulum ya da derleme adımı gerekmez.

## Çalıştırma

Statik bir sunucu yeterli (ES modülleri `file://` üzerinden çalışmaz):

```bash
cd penalti
python3 -m http.server 8080      # ya da: npx serve .
# http://localhost:8080
```

## Oynanış

| Rol | Kontrol |
| --- | --- |
| Nişan | Fare (dokunmatikte sürükle) — halka topun gideceği noktayı gösterir; gerilim arttıkça titrer |
| Güç | Fare tuşu / `BOŞLUK` basılı tut, sarı bölgede bırak. Çok sert vurursan top üstten/yandan gider |
| Falso | `Q` / `E` ya da fare tekerleği (dokunmatikte FALSO düğmeleri) |
| Kalecilik | Rakip vurmadan önce kaleye tıkla/dokun: kalecin o noktaya atlar (vuruş anına yakın tıkla) |
| Diğer | `P`/`ESC` duraklat • `F` tam ekran • `M` ses • `H` FPS • tekrarı geçmek için `BOŞLUK`/tık |

Format: 5 atışlık seri; eşitlikte "ani ölüm". Sen ve rakip sırayla atarsınız; rakip atarken kaleci sensin.
Zorluk: Kolay / Normal / Zor / Efsane. Grafik: Düşük / Orta / Yüksek / Ultra (çözünürlük otomatik ayarlanır).

## Teknik özet

* **Render:** Three.js r180 (yerel kopya `vendor/`). MSAA'lı HDR (half-float) sahne, ayrı derinlik geçişi ile **alan derinliği (bokeh)**, 6 kademeli **bloom**, ACES tonlama, renk derecelendirme, vinyet, film greni, kromatik sapma. 4 gölgeli projektör + IBL (sentetik stadyum ortam haritasından PMREM).
* **Saha:** PBR çim (anti-tiling, biçme şeritleri, aşınma yamaları), boyalı çizgiler, LED reklam panoları (piksel ızgarası + kayan metin), büyük ekran, çatı ve projektör dizileri.
* **Kalabalık:** ~27 bin instanced kart figür (animasyonlu: zıplama, dalga, kamera flaşları), koltuk mozaiği.
* **Kale:** dalga denklemi ile simüle edilen file (top çarpınca kabarır), direk/üst bar kapsül çarpışmaları.
* **Top fiziği:** sabit adımlı (240 Hz) — sürüklenme, **Magnus (falso)**, dönmeli sekme/sürtünme, direk, file, kaleci çarpışmaları; atış çözücü (falso varken bile halkanın gösterdiği noktaya).
* **Karakterler:** Ready Player Me kafa/el + **SDF ile üretilmiş atletik gövde** (iskeletli, yüzey ağıyla), shader ile boyanan forma/şort/çorap/krampon (numara, sponsor, arma), saç kabuğu, kaleci eldivenleri.
* **Animasyon:** Mixamo (T-poz) kliplerinin RPM iskeletine dünya-uzayı delta ile **retarget**'i, iki kemikli **IK** (vuruş, plant ayağı, kaleci duruşu), prosedürel dalış/vuruş fazları, sabit adım + arayüz enterpolasyonu.
* **Tekrar (replay):** her atışın iskelet/top verisi kaydedilir; yavaş çekimde farklı kamera açılarıyla (file arkası, yan) oynatılır.
* **Ses:** WebAudio; dinamik stadyum ambiyansı (gerilime göre filtre/ses), CC0 örnekler + sentez efektler.

## Varlıklar ve lisanslar

Tüm harici varlıklar internetten indirilip `assets/` altına konmuştur:

| Varlık | Kaynak | Lisans |
| --- | --- | --- |
| Futbol topu modeli (`football`), gece gökyüzü HDRI (`qwantani_night_puresky`), beton (`concrete_floor_02`) ve forma kumaşı (`cotton_jersey`) dokuları | [Poly Haven](https://polyhaven.com) | CC0 |
| Çim dokusu (`Grass008`) | [ambientCG](https://ambientcg.com) | CC0 |
| Oyuncu kafası/elleri (`readyplayer.me.glb`), Mixamo animasyon/iskelet örnekleri (`Xbot.glb`, `Michelle.glb`) | [three.js örnekleri](https://github.com/mrdoob/three.js/tree/dev/examples/models/gltf) | Ready Player Me / Adobe Mixamo koşulları — ticari kullanımdan önce kontrol edin |
| Ses efektleri (kalabalık, tezahürat, vuruş, file, düdük, direk) | [Freesound](https://freesound.org) CC0 arama filtresi (örn. #868982, #397434, #580301, #494362, #764215, #264378, #635110, #733614, #555042, #816823, #813410, #813625, #218318, #396635) | CC0 |
| Barlow / Barlow Condensed yazı tipleri | [Google Fonts](https://fonts.google.com) | SIL OFL |
| three.js | [three.js](https://threejs.org) | MIT (`vendor/three/LICENSE`) |

Stadyum, kale, forma, LED panolar, kalabalık figürleri, gövde modeli ve tüm oyun kodu bu depoya özgü olarak üretilmiştir.
