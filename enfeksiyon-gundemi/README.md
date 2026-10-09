# Enfeksiyon Gündemi

Enfeksiyon hastalıkları ve klinik mikrobiyoloji alanındaki yayınları her gün otomatik toplayan,
bir klinisyen-editör gözüyle değerlendiren ve dijital bir dergi gibi sunan kişisel uygulama.

> Bu uygulama klinik karar destek aracı değil, kişisel bir literatür takip aracıdır.

Durum: **6. aşama** (çok kaynaklı toplama, triyaj, editör yazıları, soru-cevap ve sistem sağlığı panosu). Ayrıntılı plan: [`../docs/klinik-editor-PLAN.md`](../docs/klinik-editor-PLAN.md)

---

## Nasıl çalışır?

| Parça | Nerede çalışır | Ne yapar |
|---|---|---|
| Toplayıcı (`pipeline/`) | GitHub Actions, her gün 04:47 ve 12:17 (TR) | PubMed, dergi RSS'leri, kurumlar (WHO, CDC, ECDC, IDSA, ESCMID, EUCAST, CLSI, KLİMİK) ve ön baskı sunucularından yeni kayıtları çeker, yinelenenleri birleştirir |
| Değerlendirme (`pipeline/`) | Toplamanın hemen ardından | Haiku ile triyaj, Opus ile editör yazıları (Anthropic Batch API, %50 indirimli) |
| Veritabanı (`db/`) | Cloudflare D1 | Tüm kayıtlar, çalıştırma günlükleri |
| Uygulama (`web/`) | Cloudflare Pages | Telefonda okuduğunuz arayüz |
| Soru-cevap (`web/`) | Cloudflare Pages | "Sor" sekmesi ve makale sayfasındaki "Soru sor" düğmesi: arşivde arar, bulunan yayınlara dayanarak kaynak numaralarıyla yanıtlar |
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
4. **Giriş koruması (Cloudflare Access):** Cloudflare → Workers & Pages → proje → Settings → *Restrict previews*;
   ardından Zero Trust → Access → Applications'ta oluşan uygulamanın Subdomain kutusundaki `*` silinip kaydedilir
   (böylece ana adres de korunur) ve *Restrict previews*'a bir kez daha basılır. Uygulamanın AUD değeri ve ekip alan adı
   yukarıdaki iki secret'a girilir; uygulama bu imzayı ayrıca kendisi de doğrular.

## Sorun olursa

- Önce uygulamada **Ayarlar → Sistem sağlığı**'na bakın: her kaynağın durumu (yeşil/sarı/kırmızı), son hatalar
  (sade dille), beklenti sapması uyarıları, yapay zekâ maliyeti ve veritabanı kotaları orada. Bir sorun olduğunda
  başlıktaki saat simgesinde sarı ya da kırmızı bir nokta belirir. Eşikler: `config/limits.yaml` → `health`.
- repo → **Actions** sekmesinde kırmızı çarpılı bir çalıştırma varsa tıklayın; hata mesajı Türkçe yazılır.
- GitHub, uzun süre etkinlik olmayan depolarda zamanlanmış işleri durdurabilir; toplama iş akışı bunu önlemek için
  her çalıştırmada kendini yeniden etkinleştirir. Yine de durduysa: Actions → "Günlük toplama" → *Enable workflow*.
- Toplama başarısız olursa bir sonraki çalıştırmada eksik günler kendiliğinden yeniden denenir.
- Bir kaynağa ulaşılamazsa diğerleri etkilenmez; durum **Ayarlar → Sistem durumu**'nda görünür.
- Bir kurum sitesi tasarımını değiştirirse o kaynak "bağlantı bulunamadı" uyarısı verir; `config/sources.yaml`'daki
  ilgili `link` deseni güncellenmeli ya da kaynak geçici olarak kapatılmalıdır.

## Geliştirici notları

```bash
# Toplayıcı testleri
cd pipeline && npm ci && npm test

# Yerel veritabanına gerçek PubMed verisiyle deneme toplaması
cd pipeline && LOCAL_DB=/tmp/eg.db npm run collect

# Web arayüzü
cd web && npm ci && npm run build
```

- PubMed sorgusu: `config/pubmed.yaml` (MeSH + başlık/özet terimleri, bloklar hâlinde; aynı terimler diğer kaynaklarda anahtar kelime süzgeci olarak da kullanılır)
- Diğer kaynaklar: `config/sources.yaml` (her biri `enabled: false` ile kapatılabilir)
- Dergi katmanları: `config/journals.yaml`
- Kota/sınırlar: `config/limits.yaml` (D1 ücretsiz katman: günde 100.000 satır yazma, veritabanı başına 500 MB)
- Yapay zekâ: `config/ai.yaml` (modeller, günlük yazı sayısı, aylık bütçe tavanı), `config/topics.yaml` (konu etiketleri)
- Editör istemleri: `prompts/triage.md`, `prompts/editor.md`; soru-cevap: `prompts/qa.md` (yanıt), `prompts/qa-plan.md` (arama terimleri)
- Soru-cevap ayarları: `config/ai.yaml` → `qa` (model, en fazla kaynak ve soru sayısı). Arşiv araması yalnızca triyajda
  alakalı bulunan yayınları kapsar; dizin her değerlendirme çalıştırmasında güncellenir.

## Maliyet kontrolü

- Aylık bütçe tavanı `config/ai.yaml` → `budget.monthly_usd`. Dolarsa yeni değerlendirme başlatılmaz.
- Günde en fazla `review.max_per_day` tam editör yazısı.
- Aynı yayın asla iki kez değerlendirilmez; tüm çağrılar (sorular dahil) `ai_usage` tablosuna maliyetiyle kaydedilir.
- Bütçe dolduğunda yeni soru da alınmaz.
- Ek güvenlik: Anthropic Console → Settings → Limits'te aylık harcama limiti.
