# Flappy Bird 3D

Klasik Flappy Bird'ün 3D, mobil uyumlu bir yorumu. Oyundaki tüm 3D modeller
[Meshy AI](https://www.meshy.ai) API'si ile üretildi; kuşun kanat iskeleti ve
çırpma animasyonu oyunda kodla kurulur. Oyun [three.js](https://threejs.org) ile
tarayıcıda çalışır, kurulum gerektirmez.

## Nasıl oynanır

- **Telefonda:** ekrana dokun, kuş kanat çırpıp yükselir.
- **Bilgisayarda:** `Boşluk`, `↑` ya da `W`; duraklatmak için `P`/`Esc`, ses için `M`.
- Borulara ve yere çarpmadan aralardan geç. Her boru 1 puan.
- Madalyalar: 10 bronz, 20 gümüş, 30 altın, 40 platin.

## Çalıştırma

Statik bir sunucu yeterli (GLB dosyaları `file://` üzerinden yüklenemez):

```bash
cd flappy-bird-3d
python3 -m http.server 8080    # ya da: npx serve .
```

Ardından `http://localhost:8080` adresini aç. Telefonda denemek için aynı ağdaki
bilgisayarın IP adresini kullanabilir ya da klasörü GitHub Pages ile
yayınlayabilirsin.

## Meshy AI ile üretilen varlıklar

| Dosya | Meshy işlemi | Ayrıntı |
| --- | --- | --- |
| `assets/models/bird.glb` | Text to 3D (önizleme + doku) | Yatay uçuş pozunda, kanatları iki yana açık sarı kuş |
| `assets/models/pipe.glb` | Text to 3D (önizleme + doku) | Yeşil boru; gövdesi oyunda ekrana göre uzatılır |
| `assets/models/cloud.glb` | Text to 3D (önizleme) | Bulut; beyaz malzemeyle boyanır |
| `assets/models/bush.glb` | Text to 3D (önizleme) | Çalı; yeşil malzemeyle boyanır |

### Kuşun kanat animasyonu

Meshy'nin rigging ve animasyon servisleri yalnızca insansı (iki kol, iki
bacak, ayakta T-pozu) karakterleri destekliyor; yatay uçan bir kuşu iskeletlendiremiyor.
Bu yüzden iskelet oyunda kuruluyor (`src/bird-rig.js`):

1. Model dilimlere ayrılıp dikey kalınlığın düştüğü yer, yani kanadın gövdeden
   ayrıldığı omuz noktası bulunur.
2. Her kanada omuzda bir kanat, ortasında bir uç kemiği eklenir; köşe
   ağırlıkları omuzda ve kanat ortasında yumuşak geçişle hesaplanır.
3. Kanat çırpma (`flap`), düşme (`fall`) ve yerde dinlenme (`rest`) klipleri
   kemik dönüşleriyle üretilir. Aşağı vuruş yukarı vuruştan hızlıdır, kanat ucu
   geriden gelir.

İlk sürümde kuş, Meshy rigging'i ve animasyon kütüphanesi (*Jumping Jacks*,
*Fall 2*, *Big Wave Hello*) kullanılabilsin diye ayakta duran insansı bir
maskottu; yatay uçmadığı için yatay uçuş pozunda yeniden modellendi.

### Varlıkları yeniden üretmek

```bash
cd flappy-bird-3d
npm install
MESHY_API_KEY=msy_... npm run assets:generate   # tools/raw/ içine indirir
npm run assets:optimize                          # assets/models/ dosyalarını üretir
```

- API anahtarı yalnızca ortam değişkeninden okunur; **depoya yazmayın**.
- Her görevin kimliği `tools/meshy-tasks.json` dosyasına kaydedilir. Script
  tekrar çalıştırıldığında var olan görevleri yeniden oluşturmaz, yalnızca
  sonuçlarını indirir (kredi harcamaz). Yeni bir model için ilgili girdiyi bu
  dosyadan silin.
- `node tools/generate-assets.mjs bird --preview-only` yalnızca önizleme üretir;
  doku ve rigging'e kredi harcamadan önce şekli kontrol etmek için.
- `optimize-assets.mjs` dokuları WebP'ye küçültür ve Meshy'nin metalik
  malzemelerini mat yapar (toplam indirme ~720 KB).

## Mobil uyumluluk

- Dokunmatik kontrol, çift dokunma yakınlaştırması ve kaydırma kapalı.
- Dar (dikey) ekranlarda kamera uzaklaşır; böylece her cihazda önündeki boruyu
  görmek için aynı mesafe kalır.
- Çentikli ekranlar için güvenli alan (safe area) boşlukları.
- Yüksek yoğunluklu ekranlarda kenar yumuşatma kapalı; kare hızı 45'in altına
  düşerse çözünürlük kendiliğinden azalır.
- Arka plan süsleri tek `InstancedMesh` ile çizilir; ses efektleri dosya
  indirmeden Web Audio ile üretilir.
- Sekme arka plana geçince oyun duraklar. En iyi skor ve ses tercihi cihazda
  saklanır.

## Dosya yapısı

```
index.html                 sayfa ve arayüz
style.css                  arayüz stilleri
src/main.js                oyun döngüsü, fizik, sahne, girdi
src/bird-rig.js            kuşun kanat iskeleti ve animasyonları
src/audio.js               sentezlenmiş ses efektleri
assets/models/*.glb        Meshy AI modelleri (optimize edilmiş)
tools/generate-assets.mjs  Meshy API ile üretim
tools/optimize-assets.mjs  GLB sıkıştırma
tools/meshy-tasks.json     Meshy görev kimlikleri
```
