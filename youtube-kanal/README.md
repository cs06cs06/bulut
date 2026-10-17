# YouTube Kanalları · Otomatik video üretim hattı

Yüzsüz (faceless), İngilizce YouTube kanalları için baştan sona otomatik video üretimi: konuyu bulur, web'den
araştırır, senaryoyu yazar, seslendirir, görselleri hazırlar, videoyu ve kapağı oluşturur, başlık/açıklama/altyazıyı
hazırlar. Size kalan iş: videoyu **izleyip** YouTube'a yüklemek (ya da otomatik yüklemeyi açmak).

## Kanallar

Her kanal kendi klasöründe yaşar; **aşağıda geçen `config/`, `prompts/`, `data/`, `episodes/` yolları kanal klasörüne göredir.**

| Klasör | Kanal | Biçim | Zamanlama |
|---|---|---|---|
| `kanallar/nostalji/` | **Back In Our Day** (geçici ad): ABD ve Kanada'da 60 yaş üstü izleyiciye 1950'ler–70'ler nostaljisi | 8–12 dakikalık geri sayım listesi (15 madde, en güçlüsü #1 sonda) + her videodan 2 dikey Shorts; fotogerçekçi yapay zekâ görselleri, sıcak 60'lar film tonu, siyah şeritli sarı vurgulu kapak | Pzt / Çar / Cum otomatik |
| `kanallar/ai-egitim/` | **Tool Tutor**: yapay zekâ araçları eğitimleri | 8–9 dakikalık adım adım anlatım; gerçek web sayfalarının ekran görüntüleri | Yalnızca elle (Run workflow → kanal: ai-egitim) |

Nostalji kanalının biçimi, Almanya'daki "Deutschland, wie es einmal war" kanalından uyarlanmıştır (2,5 ayda 24 video,
~1,2 milyon izlenme; en iyi video 277 bin).

```
Pazar sabahı         Konu fikirleri  ─►  data/backlog.yaml (puanlı konu listesi)
Pzt / Çar / Cum      Video üret:
  08:23                 1. Konu seç (onaylı ya da en yüksek puanlı)
                        2. Araştır (Claude + web araması)          → episodes/<id>/research.md
                        2b. Önce paketleme (nostalji): başlık + kapak + merak boşluğu → packaging.json
                        3. Senaryo                                → episodes/<id>/script.md
                        4. Başlık, açıklama, etiket, kapak metni  → episodes/<id>/metadata.json
                        5. Seslendirme (nostalji: Google Gemini · ai-egitim: ElevenLabs)
                        6. Görseller: nostalji → Google Gemini (Nano Banana) · ai-egitim → web sayfası ekran görüntüleri
                        6b. Hareketli sahneler (nostalji): kanca + #6…#1 maddelerinin ilk görseli → Google Veo klipleri
                        7. Video (1920×1080) + kapak + altyazı (+ nostalji: 2 dikey Shorts)
                        8. GitHub → Releases: video.mp4, thumbnail.jpg, captions.srt, upload.txt, short-*.mp4
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
| `ELEVENLABS_API_KEY` | https://elevenlabs.io → Developers → API Keys (`sk_` ile başlar; "text to speech" izni yeterli) | Seslendirme ElevenLabs ise |
| `GEMINI_API_KEY` | https://aistudio.google.com → Get API key (faturalandırma açık olmalı; görsel modellerinin ücretsiz katmanı yok) | Nostalji kanalı (görseller) |
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
1. **Actions → "YouTube Kanalı · Konu fikirleri" → Run workflow** (kanal seçin). Birkaç dakikada `data/backlog.yaml` dolar.
2. Listeye göz atın; istemediğiniz konuları `reddedildi`, öne almak istediklerinizi `onaylı` yapın (isteğe bağlı).
3. **Actions → "YouTube Kanalı · Video üret" → Run workflow** (kanal seçin). Nostalji: ~30–40 dakika (11 dakikalık video + 2 Shorts; oluşturma 4 çekirdekte gerçek zamana yakın sürer); ai-egitim: ~20–30 dakika.
4. Bitince çalıştırma sayfasındaki özet bölümünde **📥 İndir** bağlantısı çıkar (depo → **Releases**).

---

## 2. Her video için yapacaklarınız (~15–20 dakika)

1. Depo → **Releases** → en yeni "🎬 …" kaydı. `video.mp4`, `thumbnail.jpg`, `captions.srt` ve `upload.txt` indirin
   (telefondan da olur).
2. **Videoyu baştan sona izleyin.** Yanlış bir bilgi, bozuk görünen bir sayfa ya da tuhaf bir telaffuz varsa
   yüklemeyin (aşağıdaki "Bir videoyu düzeltmek" kısmına bakın).
3. YouTube Studio → **Create → Upload video**:
   - Başlık: `upload.txt`'deki üç seçenekten birini kopyalayın,
   - Açıklama ve etiketler: `upload.txt`'den kopyalayın,
   - Kapak: `thumbnail.jpg` (kapak yüklemek için kanalın telefonla doğrulanmış olması gerekir),
   - Altyazı: **Subtitles → Upload file → With timing** → `captions.srt`,
   - "Altered or synthetic content" sorusu: ai-egitim (ekran görüntüsü) için genelde **No**; nostalji kanalının
     fotogerçekçi yapay zekâ görselleri gerçek bir sahne gibi göründüğü için **Yes**.
   - **End screen** (nostalji): son 20 saniyede videoda "WATCH THIS NEXT" alanı ayrılmıştır; oraya
     `upload.txt`'de önerilen sonraki videoyu (ya da "Best for viewer") ve abone düğmesini koyun.
   - **Playlist**: `upload.txt`'deki seri oynatma listesine ekleyin (izleyici bir sonrakine geçsin).
   - Altyazı dili İngilizce olunca YouTube diğer dillere otomatik çeviri sunar.
4. Yayınlayın ya da zamanlayın.
5. Nostalji: `short-1.mp4` ve `short-2.mp4` dosyalarını birkaç gün arayla Shorts olarak yükleyin (başlıklar
   `upload.txt`'de) ve Shorts'u ana videoya bağlayın ("Related video"). Topluluk sekmesine `upload.txt`'deki anketi paylaşın.
6. Bir hafta sonra Studio → Analytics → **Audience retention** grafiğine bakın: izleyicinin düştüğü maddeyi ve
   kancanın ilk 30 saniyede tuttuğu oranı not edin; zayıf kalıpları `prompts/script.md` / `prompts/ideas.md`'ye yazın.

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

**Nostalji kanalı** (~11 dakikalık video, 15 madde × 4 görsel + giriş/kapanış ≈ 66 görsel):

| Kalem | Video başına | Not |
|---|---|---|
| Claude (araştırma + senaryo + başlık) | ~1,5–2,5 $ | |
| Görseller (Gemini Nano Banana 2.1, 2K) | ~3,3 $ | `images.size: 1K` ile ~2,3 $; `listicle.images_per_item` ile görsel sayısı |
| Hareketli sahneler (Veo 3.1 Lite, 1080p, 8 klip × 8 sn) | ~5,1 $ | `motion.top_items` / `motion.hook_clips` ile klip sayısı; kapatmak için `config/channel.yaml` → `motion` bölümünü silin |
| Seslendirme (Google Gemini TTS, ~12 dakika + Shorts) | ~0,2 $ | Aynı `GEMINI_API_KEY`; ses `voice.google.voice` (Gacrux). ElevenLabs'e geçilirse ticari lisans için ücretli plan gerekir (ayda 13 video ≈ Pro plan, 99 $) |

`config/ai.yaml` → `budget.monthly_usd` (nostalji: 150 $) Claude, görsel ve klip harcamasını sınırlar. Video başına ~10 $;
haftada 3 video ≈ ayda 13 video ≈ 120–135 $ (seslendirme dahil).

**ai-egitim kanalı:** Claude ~1–2 $, seslendirme ~0,5–1 $ / video.

| Ortak | |
|---|---|
| GitHub Actions | Herkese açık depolarda ücretsiz; özel depolarda ayda 2.000 dakika ücretsiz (nostalji videosu başına ~30–40 dk → ayda 13 video ≈ 500 dk) |

Aylık harcama her kanalın `data/usage.json` dosyasında tutulur. Tavan aşılırsa yeni video başlatılmaz.

> Depo herkese açıksa **Releases** altındaki videolar da herkese açıktır. Bunu istemiyorsanız depoyu özel (private) yapın.

---

## 6. Ayarlar

| Dosya | Ne ayarlanır |
|---|---|
| `config/channel.yaml` | Kanal adı ve konusu, video uzunluğu, renkler, ses, yayın günleri, otomatik onay, YouTube yükleme; nostalji kanalında ayrıca madde/görsel sayısı (`listicle`), görsel stili (`images.style`), film görünümü (`look`) |
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
npm run demo                      # nostalji: yer tutucu görsellerle → kanallar/nostalji/work/demo-root/work/demo/out/video.mp4
KANAL=ai-egitim npm run demo      # eğitim kanalı: örnek siteyle
DEMO_IMAGES=1 npm run demo        # nostalji, gerçek görsellerle (GEMINI_API_KEY gerekir, ücretli)
npm test                          # birim testleri
npm run typecheck
```

Sistemde `ffmpeg` kurulu olmalı. Görsel tasarım `pipeline/src/render/stage.html` (CSS) ve `stage.js`
(animasyonlar ve yazı katmanları), nostalji sahneleri `pipeline/src/media/photoscene.ts` (ffmpeg: yavaş yakınlaştırma,
geçişler, film görünümü), kapak `pipeline/src/render/thumbnail.html` dosyasındadır. Yazı tipi: Montserrat (SIL OFL).

Yeni kanal eklemek: `kanallar/` altına mevcut bir kanal klasörünü kopyalayın, `config/` ve `prompts/` dosyalarını
düzenleyin, `data/backlog.yaml`'ı boşaltın (`[]`) ve iş akışlarındaki `kanal` seçeneklerine klasör adını ekleyin.

## 9. Sorun olursa

- **Actions** sekmesinde kırmızı çarpılı çalıştırmaya tıklayın; hata mesajı Türkçedir.
- *"… tanımlı değil"*: ilgili gizli değer (secret) eksik.
- *"Aylık bütçe tavanına ulaşıldı"*: `config/ai.yaml` → `budget.monthly_usd`.
- *"… görsel üretilemedi"* uyarısı (nostalji): güvenlik filtresine takılan birkaç görselin yerine aynı sahnenin başka
  bir görseli kullanılır; video yine üretilir. *"Hiç görsel üretilemedi"*: `GEMINI_API_KEY` ya da faturalandırma sorunu.
- *"… sayfa yakalanamadı"* uyarısı (ai-egitim): bazı siteler otomatik tarayıcıları engeller; o sahneler otomatik olarak metin
  kartına çevrilir, video yine üretilir. Hangi sayfaların yakalandığı `episodes/<id>/captures.json` dosyasındadır.
- Yarıda kalan üretim bir sonraki çalıştırmada kaldığı yerden devam eder (araştırma ve senaryo yeniden ücretlendirilmez).
