# Frikik Ustası

Tarayıcıda çalışan, dokunmatik kaydırma (swipe) ile oynanan 3D serbest vuruş oyunu. three.js ile yazıldı; derleme adımı yok, statik dosyalardan çalışır.

## Nasıl oynanır

- **Yön:** Parmağını topun altından kaleye doğru kaydır. Kaydırmanın bittiği yön, topun kale çizgisini geçeceği noktayı belirler; uzun kaydırma yüksek, kısa kaydırma alçak şut demek.
- **Falso:** Kaydırırken kavis çiz. Top da o kavisle döner (sağa bükülen çizgi topu önce sola açar, sonra içeri kıvırır). Barajın etrafından dolandırmak için kullan.
- **Güç:** Hızlı kaydırma sert şut, yavaş kaydırma aşırtma. Çok sert şutlar biraz sapar; falsosuz ve çok sert vuruşlar "yaprak" gibi havada oynar.
- **Nişan kılavuzu:** Parmak ekrandayken topun yolu noktalarla, kaledeki varış noktası bir halkayla gösterilir. Halka yeşilse top kaleye, turuncuysa direğe yakın, kırmızıysa dışarı gidiyor. Kaydırma izi şut sertleştikçe sarıdan kırmızıya döner.
- Masaüstünde fare ile sürükleyerek oynanır. `Esc`/`P` duraklatır, tekrar sırasında `Boşluk` atlar.

### Zorluk

Menüdeki **Zorluk** düğmesiyle seçilir (varsayılan Kolay):

| | Kolay | Normal | Zor |
| --- | --- | --- | --- |
| Nişan kılavuzu | tam yol + halka | yolun başı + halka | yok |
| Direği az ıskalayan şut | kaleye çekilir | biraz çekilir | çekilmez |
| Barajı aşmayan şut | otomatik düşen top (üstten dönüş) | otomatik düşen top | yok |
| Kaleci | geç tepki, yavaş plonjon | biraz yumuşak | tam |
| Baraj | en fazla 3 kişi, alçak sıçrar | en fazla 4 | en fazla 5 |
| Rüzgâr | hafif | orta | tam |

### Modlar

- **Kariyer:** 3 hak. Her golde mesafe, açı, baraj sayısı, rüzgâr ve kaleci refleksi artar. Seri gol çarpanı (x3'e kadar), köşe hedefi, falso, füze, yaprak ve direkten gol bonusları var. En iyi skor cihazda saklanır.
- **Antrenman:** Sınırsız atış; parmağın ekrandayken topun gideceği yörünge önizlenir.

## Öne çıkanlar

- **Fizik:** 240 Hz alt adımlı top simülasyonu — yerçekimi, hava sürtünmesi, Magnus etkisi (falso ve üstten dönüş), rüzgâr, düşük dönüşte "knuckleball" salınımı, çimde sekme/yuvarlanma, direk/üst direk, reklam panosu ve oyuncu çarpışmaları.
- **Nişan çözücü:** Kaydırma hareketi hız, dönüş ve hedef noktasına çevrilir; ardından topun, dönüşüyle birlikte, hedefe varacağı fırlatma açısı sayısal olarak bulunur.
- **File:** Verlet kumaş simülasyonu. Top fileyi gerçekten esnetir, file topu sönümleyerek tutar; direğe çarpan top fileyi titretir.
- **Kaleci yapay zekâsı:** Açıyı kapatacak şekilde konumlanır, vuruş anında "split-step" yapar, topun yolunu (zorluk seviyesine göre hatalı ve gecikmeli, falsoyu zamanla okuyarak) tahmin eder, yan adım atar, balistik bir yayda plonjona çıkar. Eldivenler iki kemikli IK ile canlı topa uzanır; top tutulur ya da çelinir.
- **Animasyon:** Mixamo X Bot iskeleti üzerine prosedürel katmanlar — şutörün koşu klibinden IK ile anahtarlanmış vuruşa geçişi (destek ayağı topun yanına basar), vuruş sonrası yavaşlayan adımlar ve gol sevinci; barajın korunma pozu, çömelip sıçraması, top yakından geçince irkilmesi, top geçince dönüp izlemesi ve gole/kurtarışa tepkisi; bakış takibi, ayak altı temas gölgeleri ve kenar ışığı.
- **Sahne:** Poly Haven HDRI ile aydınlatma, gölge takibi yapan güneş, prosedürel çim (biçme şeritleri, keskin analitik saha çizgileri, kalecinin önünde aşınma), hakem spreyi, LED reklam panoları (golde "GOOOL!" moduna geçer), 20 binden fazla animasyonlu seyirci (Meksika dalgası, golde zıplama ve flaşlar), tribünde dalgalanan taraftar pankartları, uzak tribünlere derinlik veren hafif pus, köşe bayrakları, golde konfeti ve piroteknik kıvılcım fıskiyeleri, çim parçacıkları.
- **Yayın hissi:** Omuz üstü nişan kamerası, şutla birlikte kaydırılan kamera, kritik anlarda ağır çekim, golcüyü "uçak" sevinciyle koşarken izleyen kutlama kamerası, vuruş anından başlayıp kaleye kesen iki açılı tekrar (ekrana dokununca atlanır), şut hızı göstergesi, kamera sarsıntısı, bloom ve renk düzenleme.
- **Ses:** Kalabalık uğultusu top kaleye yaklaştıkça yükselir; gol, "ooh", hayal kırıklığı, alkış, düdük, vuruş, direk ve file sesleri.

## Çalıştırma

ES modülleri kullanıldığı için dosyalar bir web sunucusundan açılmalıdır:

```bash
cd freekick
npx serve .        # ya da: python3 -m http.server 8080
```

Ardından tarayıcıda `http://localhost:3000` (veya 8080) adresini açın. Telefondan denemek için aynı ağdaki bilgisayarın IP adresini kullanabilirsiniz. Grafik kalitesi menüdeki **Grafik** düğmesinden (Otomatik / Yüksek / Orta / Düşük) değiştirilebilir; yavaş cihazlarda çözünürlük kendiliğinden düşürülür.

### Tek sayfalık sürüm (katı CSP / sanal barındırma)

Bazı ortamlar (sıkı Content-Security-Policy uygulayan barındırıcılar, gömülü görüntüleyiciler) sayfanın kendi `.js` modüllerini çalıştırmaz; oyun o zaman yükleme ekranında kalır. Bunun için tüm JS'i, CSS'i ve fontları tek bir HTML'e gömen bir derleme var:

```bash
cd freekick
npm install
npm run build      # dist/ klasörünü üretir
```

`dist/` klasörü tek başına yayınlanabilir: `dist/index.html` + `dist/assets/`. Ayrıca `dist/single.html` model, doku ve sesler dahil her şeyi tek bir dosyada taşır (~6,5 MB); başka hiçbir isteğe izin vermeyen gömülü görüntüleyicilerde bu dosya kullanılır.

Yükleme ekranındaki yazı sorunun nerede olduğunu söyler: **Betik bekleniyor…** sayfada JavaScript hiç çalışmıyor demektir; **Hazırlanıyor… / Başlatılıyor…** betiğin başladığını, **% · …** ise hangi dosyanın beklendiğini gösterir. Bir dakika içinde bitmezse eksik olan dosya ekrana yazılır. `.glb` sunmayan barındırıcılar için model `dist/assets/models/xbot.gltf.json` olarak da üretilir ve oyun otomatik olarak ona geçer; `.hdr` yüklenemezse ışıklandırma JPG panoramadan yapılır.

## Klasör yapısı

```
freekick/
├── index.html          arayüz iskeleti
├── css/style.css       HUD, menüler, animasyonlar
├── js/
│   ├── main.js         başlatma, yükleme, döngü, düğmeler
│   ├── game.js         oyun akışı, puanlama, çarpışmalar, tekrar
│   ├── physics.js      top fiziği ve çarpışmalar
│   ├── shot.js         kaydırma analizi ve fırlatma çözücü
│   ├── keeper.js       kaleci yapay zekâsı ve plonjon
│   ├── wall.js         baraj
│   ├── kicker.js       şutör koşusu ve vuruş
│   ├── rig.js          karakter, forma shader'ı, IK
│   ├── net.js          file (kumaş simülasyonu)
│   ├── stadium.js      saha, kale, tribün, seyirci, panolar
│   ├── ball.js         top materyali, gölge, iz
│   ├── camera.js       kamera yönetmeni
│   ├── fx.js           parçacıklar
│   ├── audio.js        Web Audio mikseri
│   ├── input.js        kaydırma yakalama ve iz çizimi
│   ├── engine.js       renderer, ışık, post-process, kalite
│   └── assets.js       varlık yükleyici
├── tools/build.mjs     tek sayfalık derleme (esbuild)
├── assets/             indirilen model, doku, HDRI, ses ve fontlar
└── vendor/three/       three.js r186
```

Kullanılan tüm harici varlıklar ve lisansları için [CREDITS.md](CREDITS.md) dosyasına bakın.
