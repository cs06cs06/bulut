# Enfeksiyon Gündemi

Enfeksiyon hastalıkları ve klinik mikrobiyoloji alanındaki yayınları her gün otomatik toplayan,
bir klinisyen-editör gözüyle değerlendiren ve dijital bir dergi gibi sunan kişisel uygulama.

> Bu uygulama klinik karar destek aracı değil, kişisel bir literatür takip aracıdır.

Durum: **2. aşama** (PubMed toplama, triyaj ve editör yazıları). Ayrıntılı plan: [`../docs/klinik-editor-PLAN.md`](../docs/klinik-editor-PLAN.md)

---

## Nasıl çalışır?

| Parça | Nerede çalışır | Ne yapar |
|---|---|---|
| Toplayıcı (`pipeline/`) | GitHub Actions, her gün 04:47 ve 12:17 (TR) | PubMed'den yeni kayıtları çeker, yinelenenleri birleştirir, veritabanına yazar |
| Değerlendirme (`pipeline/`) | Toplamanın hemen ardından | Haiku ile triyaj, Opus ile editör yazıları (Anthropic Batch API, %50 indirimli) |
| Veritabanı (`db/`) | Cloudflare D1 | Tüm kayıtlar, çalıştırma günlükleri |
| Uygulama (`web/`) | Cloudflare Pages | Telefonda okuduğunuz arayüz |
| Ayarlar (`config/`) | Bu repo | Arama sorguları, dergi katmanları, konular, yapay zekâ modelleri, bütçe |
| Editör talimatları (`prompts/`) | Bu repo | Triyaj ve editör yazısı istemleri (düz Türkçe metin) |

Hiçbir şey eklemeniz gerekmez. İsterseniz `config/` altındaki dosyaları GitHub'ın web
arayüzünden düzenleyebilirsiniz (dosyayı açın → kalem simgesi → "Commit changes").

## Kurulum (bir kez)

1. **Hesaplar:** Cloudflare (ücretsiz), Anthropic Console (API anahtarı), NCBI (ücretsiz API anahtarı).
2. **GitHub Secrets** — repo → Settings → Secrets and variables → Actions → *New repository secret*:

   | Ad | Değer |
   |---|---|
   | `CLOUDFLARE_API_TOKEN` | Cloudflare API jetonu (izinler: Account · D1 · Edit, Account · Cloudflare Pages · Edit) |
   | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare hesap kimliği |
   | `NCBI_API_KEY` | NCBI API anahtarı |
   | `NCBI_EMAIL` | NCBI'ye bildirilen iletişim e-postası |
   | `ANTHROPIC_API_KEY` | Claude API anahtarı |
   | `EG_ACCESS_TEAM_DOMAIN` | Cloudflare Access ekip alan adı (ör. `adiniz.cloudflareaccess.com`) |
   | `EG_ACCESS_AUD` | Cloudflare Access uygulamasının "Application Audience (AUD) Tag" değeri |

3. Kod `main` dalına geldiğinde **Yayın** iş akışı veritabanını ve siteyi kendiliğinden kurar.
   Elle başlatmak için: repo → **Actions** → "Enfeksiyon Gündemi · Yayın" → **Run workflow**.
4. **Giriş koruması (Cloudflare Access):** adım adım talimatlar 1. aşamanın sonunda verilecek.

## Sorun olursa

- repo → **Actions** sekmesinde kırmızı çarpılı bir çalıştırma varsa tıklayın; hata mesajı Türkçe yazılır.
- Toplama başarısız olursa bir sonraki çalıştırmada eksik günler kendiliğinden yeniden denenir.

## Geliştirici notları

```bash
# Toplayıcı testleri
cd pipeline && npm ci && npm test

# Yerel veritabanına gerçek PubMed verisiyle deneme toplaması
cd pipeline && LOCAL_DB=/tmp/eg.db npm run collect

# Web arayüzü
cd web && npm ci && npm run build
```

- PubMed sorgusu: `config/pubmed.yaml` (MeSH + başlık/özet terimleri, bloklar hâlinde)
- Dergi katmanları: `config/journals.yaml`
- Kota/sınırlar: `config/limits.yaml` (D1 ücretsiz katman: günde 100.000 satır yazma, veritabanı başına 500 MB)
- Yapay zekâ: `config/ai.yaml` (modeller, günlük yazı sayısı, aylık bütçe tavanı), `config/topics.yaml` (konu etiketleri)
- Editör istemleri: `prompts/triage.md`, `prompts/editor.md`

## Maliyet kontrolü

- Aylık bütçe tavanı `config/ai.yaml` → `budget.monthly_usd`. Dolarsa yeni değerlendirme başlatılmaz.
- Günde en fazla `review.max_per_day` tam editör yazısı.
- Aynı yayın asla iki kez değerlendirilmez; tüm çağrılar `ai_usage` tablosuna maliyetiyle kaydedilir.
- Ek güvenlik: Anthropic Console → Settings → Limits'te aylık harcama limiti.
