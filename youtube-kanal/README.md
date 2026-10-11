# YouTube Kanalı · Yapay zekâ araçları eğitimleri (İngilizce, yüzsüz)

Yapay zekâ ve verimlilik araçları hakkında İngilizce, adım adım eğitim videolarını **baştan sona otomatik**
üreten hat. Konuyu bulur, güncel bilgiyi web'den araştırır, senaryoyu yazar, seslendirir, aracın gerçek web
sayfalarını açıp ekran görüntüsü alır, yakınlaştırma/vurgu/imleç animasyonlarıyla 1080p video oluşturur,
kapak görselini, başlığı, açıklamayı (bölüm zaman damgaları ve affiliate bağlantılarıyla) ve altyazıyı hazırlar.

Size kalan iş: videoyu **5–10 dakika izleyip** YouTube'a yüklemek (ya da otomatik yüklemeyi açmak).

```
Pazar sabahı         Konu fikirleri  ─►  data/backlog.yaml (puanlı konu listesi)
Pzt / Çar / Cum      Video üret:
  08:23                 1. Konu seç (onaylı ya da en yüksek puanlı)
                        2. Araştır (Claude + web araması)          → episodes/<id>/research.md
                        3. Senaryo (sahne sahne, görsel tarifli)  → episodes/<id>/script.md
                        4. Başlık, açıklama, etiket, kapak metni  → episodes/<id>/metadata.json
                        5. Seslendirme (ElevenLabs / OpenAI)
                        6. Gerçek sayfaların ekran görüntüleri (Playwright)
                        7. Video (1920×1080, 30 fps) + kapak + altyazı
                        8. GitHub → Releases: video.mp4, thumbnail.jpg, captions.srt, upload.txt
                           (isteğe bağlı: YouTube'a "özel" olarak yükleme)
```

---

## 1. Kurulum (bir kez, ~20 dakika)

### 1.1 Kodu ana dala alın
Zamanlanmış işler ve **Run workflow** düğmesi yalnızca deponun ana dalındaki (main) iş akışları için çalışır.
Bu değişikliklerin olduğu dalı main'e birleştirin (pull request → **Merge**).

### 1.2 Anahtarları ekleyin
GitHub'da depo → **Settings → Secrets and variables → Actions → New repository secret**:

| Ad | Nereden | Zorunlu mu |
|---|---|---|
| `ANTHROPIC_API_KEY` | https://console.anthropic.com → API Keys | Evet |
| `ELEVENLABS_API_KEY` | https://elevenlabs.io → Profile → API Keys | Seslendirme ElevenLabs ise |
| `OPENAI_API_KEY` | https://platform.openai.com → API keys | `voice.provider: openai` seçerseniz |

> Ses seçimi: ElevenLabs'te **Voices → Voice Library**'den beğendiğiniz İngilizce sesi ekleyin, ses kimliğini
> (Voice ID) kopyalayıp `config/channel.yaml` → `voice.elevenlabs.voice_id` alanına yapıştırın.
> Bütün videolarda aynı sesi kullanmak kanal kimliği için önemlidir.

### 1.3 Kanalınızı tanımlayın
`config/channel.yaml` dosyasında (GitHub'da dosyayı açın → kalem simgesi → **Commit changes**):
- `name`, `tagline`: kanal adı (videoların açılışında ve kapanışında görünür),
- `seeds`: konu üretiminde taranacak araçlar,
- `brand`: renkler,
- `schedule.days`: yayın günleri.

### 1.4 Affiliate (satış ortaklığı) bağlantıları — en hızlı gelir
`config/affiliates.yaml` dosyasına videolarda geçecek araçların bağlantılarını ekleyin. Videoda adı geçen her
aracın bağlantısı açıklamaya otomatik eklenir, affiliate olanlar için yasal beyan cümlesi de eklenir.
Çoğu yapay zekâ aracının (ElevenLabs, Notion, Make, Descript, Gamma, Canva…) sitesinin alt kısmında
"Affiliates" / "Partners" bağlantısı vardır. YouTube reklam geliri için 1.000 abone ve 4.000 saat izlenme
gerekirken affiliate geliri **ilk videodan** başlayabilir.

### 1.5 İlk çalıştırma
1. **Actions → "YouTube Kanalı · Konu fikirleri" → Run workflow**. Birkaç dakikada `data/backlog.yaml` dolar.
2. Listeye göz atın; istemediğiniz konuları `reddedildi`, öne almak istediklerinizi `onaylı` yapın (isteğe bağlı).
3. **Actions → "YouTube Kanalı · Video üret" → Run workflow**. ~20–30 dakika sürer.
4. Bitince çalıştırma sayfasındaki özet bölümünde **📥 İndir** bağlantısı çıkar (depo → **Releases**).

---

## 2. Her video için yapacaklarınız (~10 dakika)

1. Depo → **Releases** → en yeni "🎬 …" kaydı. `video.mp4`, `thumbnail.jpg`, `captions.srt` ve `upload.txt` indirin
   (telefondan da olur).
2. **Videoyu baştan sona izleyin.** Yanlış bir bilgi, bozuk görünen bir sayfa ya da tuhaf bir telaffuz varsa
   yüklemeyin (aşağıdaki "Bir videoyu düzeltmek" kısmına bakın).
3. YouTube Studio → **Create → Upload video**:
   - Başlık: `upload.txt`'deki üç seçenekten birini kopyalayın,
   - Açıklama ve etiketler: `upload.txt`'den kopyalayın,
   - Kapak: `thumbnail.jpg` (kapak yüklemek için kanalın telefonla doğrulanmış olması gerekir),
   - Altyazı: **Subtitles → Upload file → With timing** → `captions.srt`,
   - "Altered or synthetic content" sorusu: ekran görüntüsü ve anlatıcı sesi için genelde **No**.
     Gerçek bir kişinin sesini/görüntüsünü taklit eden içerik yoksa beyan gerekmez.
4. Yayınlayın ya da zamanlayın.

### Bir videoyu düzeltmek
Her bölümün metinleri `episodes/<tarih>-<konu>/` klasöründedir. `script.json` dosyasında bir anlatım cümlesini
ya da sayfa adresini düzeltip kaydedin, ardından `data/backlog.yaml`'da o konunun durumunu `onaylı` yapın ve
**Video üret**'i o konunun `id` değeriyle çalıştırın. Araştırma ve senaryo yeniden yazılmaz, yalnızca video
yeniden oluşturulur. Baştan yazdırmak için klasördeki `script.json` ve `metadata.json` dosyalarını silin.

---

## 3. Konu listesi (`data/backlog.yaml`)

| Durum | Anlamı |
|---|---|
| `bekliyor` | Önerildi. `auto_approve: true` iken en yüksek puanlı olan sıradaki üretimde kullanılır |
| `onaylı` | Öncelikli; listedeki ilk onaylı konu önce üretilir |
| `reddedildi` | Üretilmez. Üç kez üst üste başarısız olan konular da buraya düşer (`error` alanında neden yazar) |
| `üretiliyor` | Üretimde ya da yarıda kaldı; bir sonraki çalıştırma kaldığı yerden devam eder |
| `üretildi` | Video hazır |

Kendi konunuzu eklemek için listenin sonuna şunu yazmanız yeter:

```yaml
- title: "How to Turn a PDF Into a Podcast With NotebookLM"
  status: onaylı
```

---

## 4. YouTube'a otomatik yükleme (isteğe bağlı)

> **Önemli:** YouTube, denetimden (audit) geçmemiş Google Cloud projelerinden API ile yüklenen videoları
> **"özel" (private) olarak kilitler**; bunlar sonradan herkese açık yapılamaz. Denetim formu doldurulup onaylanana
> kadar (genelde birkaç hafta) elle yüklemeye devam edin. Kaynak: [YouTube Data API – Videos](https://developers.google.com/youtube/v3/docs/videos/insert).

1. https://console.cloud.google.com → yeni proje → **APIs & Services → Library → YouTube Data API v3 → Enable**.
2. **OAuth consent screen**: External, uygulama adı, kendi e-postanız; **Test users**'a kanalın Google hesabını ekleyin.
3. **Credentials → Create credentials → OAuth client ID → Web application**; *Authorized redirect URIs*'e
   `https://developers.google.com/oauthplayground` ekleyin. Client ID ve Client secret'ı not alın.
4. https://developers.google.com/oauthplayground → sağ üstteki ⚙️ → **Use your own OAuth credentials** → bilgileri girin.
   Sol tarafta kapsam (scope) olarak `https://www.googleapis.com/auth/youtube.upload` ve
   `https://www.googleapis.com/auth/youtube.force-ssl` yazın → **Authorize APIs** → kanal hesabıyla giriş →
   **Exchange authorization code for tokens** → **Refresh token**'ı kopyalayın.
5. GitHub gizli değerleri: `YT_CLIENT_ID`, `YT_CLIENT_SECRET`, `YT_REFRESH_TOKEN`.
6. `config/channel.yaml` → `youtube.upload: true`.
7. Projeyi denetime gönderin: https://support.google.com/youtube/contact/yt_api_form (API Services – Audit and Quota Extension).

> Test modundaki OAuth uygulamalarında yenileme belirteci 7 günde geçersiz olur. Uzun süreli kullanım için
> OAuth consent screen'de **Publish app** deyin (kendi hesabınız için doğrulama gerekmez; uyarı ekranını geçmeniz yeterli).

---

## 5. Maliyet

| Kalem | Video başına (8–9 dk) | Not |
|---|---|---|
| Claude (araştırma + senaryo + başlık) | ~1–2 $ | `config/ai.yaml` → `budget.monthly_usd` tavanı (varsayılan 40 $) |
| Seslendirme | ~0,5–1 $ | ~7.500 karakter; ElevenLabs aylık paketiyle daha ucuz. Güncel fiyat: https://elevenlabs.io/pricing/api |
| GitHub Actions | 0 $ | Herkese açık depolarda ücretsiz; özel depolarda ayda 2.000 dakika ücretsiz (video başına ~25 dk) |

Aylık harcama `data/usage.json` dosyasında tutulur. Tavan aşılırsa yeni video başlatılmaz.

> Depo herkese açıksa **Releases** altındaki videolar da herkese açıktır. Bunu istemiyorsanız depoyu özel (private) yapın.

---

## 6. Ayarlar

| Dosya | Ne ayarlanır |
|---|---|
| `config/channel.yaml` | Kanal adı ve konusu, video uzunluğu, renkler, ses, yayın günleri, otomatik onay, YouTube yükleme |
| `config/ai.yaml` | Modeller, düşünme düzeyi (effort), web araması sayısı, **aylık bütçe** |
| `config/affiliates.yaml` | Araç adı → sizin bağlantınız |
| `prompts/*.md` | Yapay zekâya verilen talimatlar (düz Türkçe): `ideas` konu fikirleri, `research` araştırma, `script` senaryo ve görsel kuralları, `metadata` başlık/açıklama/kapak |
| `assets/` (siz oluşturun) | İsteğe bağlı telifsiz fon müziği → `voice.music: assets/music.mp3` |

---

## 7. Kalite ve YouTube kuralları

YouTube Temmuz 2025'ten beri seri üretilmiş, birbirinin tekrarı olan içeriği ("inauthentic content") para
kazanma programından çıkarıyor. Bu hat bunu önlemek için şunları yapar:
- her video için **güncel web araştırması** yapar; senaryo yalnızca araştırma notlarındaki bilgilere dayanır,
- aracın **gerçek sayfalarını** gösterir (sahnelerin en az üçte biri),
- konu, biçim (eğitim / karşılaştırma / liste) ve görsel türlerini çeşitlendirir.

Sizin yapmanız gereken: **her videoyu yayından önce izlemek.** Yanlış bilgi içeren tek bir video kanalın
güvenilirliğine, izlenme süresine ve önerilme oranına zarar verir.

Ek öneriler:
- İlk 20–30 videodan sonra YouTube Studio → **Analytics**'te hangi konuların izlendiğine bakın; `config/channel.yaml`
  → `seeds` listesini ve `prompts/ideas.md`'yi buna göre güncelleyin.
- Kapak ve başlık tıklanma oranını (CTR) belirler; düşük kalan videolarda Studio'dan kapak/başlık değiştirebilirsiniz
  (`upload.txt`'de iki yedek başlık vardır).

---

## 8. Görünümü denemek ve geliştirme

API anahtarı gerektirmeden bütün görsel türlerini içeren 1 dakikalık sessiz bir deneme videosu:

```bash
cd youtube-kanal/pipeline
npm install
npx playwright install chromium   # bir kez
npm run demo                      # → youtube-kanal/work/demo-root/work/demo/out/video.mp4
npm test                          # birim testleri
npm run typecheck
```

Sistemde `ffmpeg` kurulu olmalı. Görsel tasarım `pipeline/src/render/stage.html` (CSS) ve `stage.js`
(animasyonlar), kapak `pipeline/src/render/thumbnail.html` dosyasındadır.

## 9. Sorun olursa

- **Actions** sekmesinde kırmızı çarpılı çalıştırmaya tıklayın; hata mesajı Türkçedir.
- *"… tanımlı değil"*: ilgili gizli değer (secret) eksik.
- *"Aylık bütçe tavanına ulaşıldı"*: `config/ai.yaml` → `budget.monthly_usd`.
- *"… sayfa yakalanamadı"* uyarısı: bazı siteler otomatik tarayıcıları engeller; o sahneler otomatik olarak metin
  kartına çevrilir, video yine üretilir. Hangi sayfaların yakalandığı `episodes/<id>/captures.json` dosyasındadır.
- Yarıda kalan üretim bir sonraki çalıştırmada kaldığı yerden devam eder (araştırma ve senaryo yeniden ücretlendirilmez).
