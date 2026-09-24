# Pencere 🪟

Instagram hesabı **olmadan** herkese açık profilleri, fotoğrafları, carousel'leri ve **videoları/reels'leri**
görüntülemek için mobil öncelikli, modern bir web uygulaması (PWA).

## Özellikler

- 🔎 **Arama**: kullanıcı adı (`nasa`, `@nasa`), profil bağlantısı ya da gönderi/reels bağlantısı yapıştır.
- 👤 **Profil**: fotoğraf, takipçi/gönderi sayıları, biyografi, bağlantı; 3'lü ızgara, *Tümü / Videolar / Fotoğraflar* filtresi,
  aşağı kaydırdıkça daha fazla gönderi yükleme.
- ▶️ **Tam ekran görüntüleyici** (Reels tarzı):
  - dikey kaydırarak sonraki gönderi, yatay kaydırarak carousel öğeleri,
  - videolar otomatik oynar; dokun → duraklat/oynat, ilerleme çubuğundan sar,
  - indir, paylaş, Instagram'da aç düğmeleri,
  - Android geri tuşu görüntüleyiciyi kapatır.
- 🔖 **Kayıtlı hesaplar**: profilde *Kaydet*'e dokun. Ana sayfada her hesabın son 4 gönderisi önizleme olarak
  görünür, **önizlemeye dokununca doğrudan tam ekran açılır**. Yeni paylaşım gelen hesaplarda rozet çıkar.
  Kayıtlı profiller önbellekte tutulduğu için dokununca **anında** açılır, arka planda güncellenir.
- 📰 **Akış**: tüm kayıtlı hesapların son paylaşımları tarih sırasıyla tek listede.
- 👆 Dokunmatik odaklı: büyük dokunma alanları, aşağı çekip yenileme, uzun basınca seçenek menüsü,
  aşağı kaydırarak kapanan alt menüler, titreşim geri bildirimi, çentik/güvenli alan desteği.
- 🌗 Koyu / açık / otomatik tema. 📲 Ana ekrana eklenebilir (PWA), Android'de "Paylaş → Pencere" ile
  Instagram bağlantısı açılabilir.
- 💾 Kayıtlı listeyi JSON olarak dışa/içe aktarma.

Kayıtlı hesaplar ve ayarlar yalnızca **senin cihazında** (tarayıcı depolaması) saklanır.

## Çalıştırma

Gereken tek şey **Node.js 18.17+**. Hiçbir npm bağımlılığı yok.

```bash
cd pencere
npm start          # ya da: node server.js
# → http://localhost:3000
```

`PORT` ve `HOST` ortam değişkenleriyle port/adres değiştirilebilir.

### Telefonda kullanmak

**A) Bilgisayarda çalıştır, telefondan aç (aynı Wi-Fi):**
Bilgisayarın yerel IP'sini bul (ör. `192.168.1.20`) ve telefonda `http://192.168.1.20:3000` adresini aç.
Tarayıcı menüsünden *Ana ekrana ekle* ile uygulama gibi kullanabilirsin.

**B) Doğrudan Android telefonda (Termux):**
```bash
pkg install nodejs git
git clone https://github.com/cs06cs06/bulut && cd bulut/pencere
node server.js
```
Sonra Chrome'da `http://localhost:3000` → *Ana ekrana ekle*. Bu yöntemde istekler senin ev/mobil
IP'nden gittiği için Instagram en az kısıtlamayı uygular.

**C) Tek tıkla internette yayınla (Render, ücretsiz):**

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/cs06cs06/bulut)

Düğmeye bas → GitHub ile giriş yap → *Apply*. Birkaç dakika sonra `https://pencere-xxxx.onrender.com`
gibi kalıcı bir HTTPS adresin olur (depo köküdeki `render.yaml` kullanılır). Ücretsiz planda uygulama
15 dk kullanılmazsa uyur; ilk açılış ~30 sn sürebilir.

**D) Bir sunucuya kur (Docker):**
```bash
docker build -t pencere .
docker run -p 3000:3000 pencere
```
Render, Railway, Fly.io gibi servislerde de `Dockerfile` ile ya da `npm start` komutuyla çalışır.
Tam PWA kurulumu (çevrimdışı kabuk, paylaşım hedefi) için HTTPS gerekir; bu servisler bunu otomatik sağlar.

## Nasıl çalışır?

Tarayıcı Instagram'a doğrudan istek atamadığı (CORS) için küçük bir Node sunucusu aracılık eder:

| Uç nokta | Görev |
| --- | --- |
| `GET /api/profile/:kullanici` | Profil + son gönderiler. Önce `web_profile_info`, olmazsa herkese açık `/embed` sayfası denenir. |
| `GET /api/user/:id/posts?after=` | Sonraki gönderi sayfası. |
| `GET /api/post/:kod` | Tek gönderi detayı (video adresi, carousel öğeleri). |
| `GET /media?u=` | Instagram CDN medyası için vekil (Range destekli → video sarma çalışır). Yalnızca `*.cdninstagram.com` / `*.fbcdn.net` adreslerine izin verir. |

Sunucu yanıtları birkaç dakika önbelleğe alır, aynı anda gelen aynı istekleri birleştirir.

## Sınırlamalar (dürüstçe)

- Yalnızca **herkese açık** hesaplar görüntülenebilir; gizli hesaplar ve **hikâyeler** giriş gerektirir.
- Instagram girişsiz erişimi kısıtlar. Özellikle veri merkezi IP'lerinden (bulut sunucular) istek atıldığında
  bazen yalnızca son ~6–12 gönderi gelir ya da bir süre "çok fazla istek" hatası alınabilir. Ev/mobil
  bağlantıda (A veya B yöntemi) sonuçlar çok daha iyidir.
- Instagram iç uç noktalarını zaman zaman değiştirir; bir kaynak bozulursa uygulama diğerine geçer.
- Medya adresleri Instagram tarafından imzalanır ve birkaç gün sonra geçersizleşir; uygulama profili
  açtığında adresleri otomatik tazeler.
- Bu araç kişisel görüntüleme içindir; indirdiğin içeriklerin hakları sahiplerine aittir.

## Geliştirme

```bash
npm test            # birim + sunucu güvenlik testleri
npm run icons       # public/icons altındaki PNG ikonlarını yeniden üret
```

Proje yapısı:

```
pencere/
├── server.js            # HTTP sunucusu: statik dosyalar, API, medya vekili
├── lib/instagram.js     # Instagram veri çekme + normalleştirme
├── public/              # İstemci (derleme adımı yok)
│   ├── index.html
│   ├── app.css
│   ├── app.js
│   ├── sw.js            # service worker
│   ├── manifest.webmanifest
│   └── icons/
├── scripts/make-icons.js
├── test/
└── Dockerfile
```
