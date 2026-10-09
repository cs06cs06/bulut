# Enfeksiyon Gündemi

Enfeksiyon hastalıkları ve klinik mikrobiyoloji alanındaki yeni yayınları her sabah otomatik toplayan,
bir klinisyen-editör gözüyle değerlendiren ve telefonda dijital bir dergi gibi sunan kişisel uygulama.

> Bu uygulama klinik karar destek aracı değil, kişisel bir literatür takip aracıdır.

- **Adres:** https://enfeksiyon-gundemi.pages.dev (yalnızca sizin e-postanızla, tek kullanımlık kodla giriş)
- **Ayrıntılı plan:** [`../docs/klinik-editor-PLAN.md`](../docs/klinik-editor-PLAN.md)

---

## 1. Günlük kullanım

| Nerede | Ne var |
|---|---|
| **Ana Sayfa** | Günün baskısı: "Günün Önemli Gelişmeleri" ve "Sizin İçin Seçilenler". Okunmamış yazılar işaretlidir. Pazar sabahından itibaren bir hafta boyunca en üstte **Haftanın öne çıkanları** kartı görünür. "Geçmiş baskılar →" eski sayılara götürür. |
| **Yazı sayfası** | 10 bölümlü editör yazısı. "Bağlam" bölümünde daha önce sunulan yazılarla ilişkisi yazar (destekliyor / çelişiyor / genişletiyor / güncelliyor) ve sonradan gelen ilişkili yazılar listelenir. Sağ alttaki **Soru sor** ile o yayın hakkında soru sorabilirsiniz. |
| **Keşfet** | Tam yazı almamış önemli yayınların kısa notları; arama; konu, ön baskı ve kurum süzgeçleri. **Gözden kaçmasın** süzgeci, yapay zekânın düşük puan verdiği ama güçlü kaynaktan (1. katman dergi, rehber, RKÇ, meta-analiz) gelen yayınları gösterir. |
| **Sor** | Arşivin tamamına soru sorun. Yanıt yalnızca bulunan yayınlara dayanır ve kaynak numaralarıyla yazılır; numaraya dokununca yayın açılır. |
| **Kaydedilenler** | Yer imi koyduğunuz yazılar. |
| **Ayarlar** | Tema (açık/koyu/cihaz), sistem durumu, geçmiş baskılar, toplanan tüm kayıtlar, çıkış. |

Başlıktaki **saat simgesi** son güncellemenin zamanını gösterir. Simgede **sarı ya da kırmızı bir nokta** varsa
sistemde dikkat gerektiren bir durum vardır; simgeye dokunup "Sistem sağlığı →" bağlantısını açın.

Ana ekrana eklemek için: tarayıcı menüsü → **Ana ekrana ekle**.

## 2. Arka planda neler oluyor?

Her gün **04:47** ve **12:17**'de (Türkiye saati) GitHub'da otomatik bir iş çalışır:

1. **Toplama:** PubMed (son günler + geriye dönük 30 gün), dergi beslemeleri (Lancet ailesi, CID, JAC, CMI, JHI, EID; NEJM,
   Lancet, JAMA ve BMJ'den yalnızca enfeksiyonla ilgili olanlar), kurumlar (WHO salgın bildirimleri, CDC MMWR, ECDC, IDSA,
   ESCMID, EUCAST, CLSI, KLİMİK) ve ön baskı sunucuları (medRxiv, bioRxiv, Europe PMC). Aynı yayın farklı kaynaklardan
   gelirse tek kayıtta birleşir; ön baskı dergide yayımlanınca ikisi bağlanır.
2. **Ön değerlendirme (triyaj):** Ekonomik model (Claude Haiku) her kaydı alaka ve önem (1–5) açısından puanlar, Türkçe başlık
   ve önemliler için kısa not yazar.
3. **Editör yazıları:** Güçlü model (Claude Opus) günde en fazla 8 yayın için tam yazı hazırlar. Açık erişimli tam metin varsa
   ona, yoksa özete dayanır; hangisine dayandığı yazının sonunda belirtilir.
4. **Pazar sabahı:** Haftanın yazılarından "Bu haftanın en önemli üç gelişmesi" giriş yazısıyla **haftalık baskı** hazırlanır
   (pazar kaçarsa pazartesi).
5. **Arama dizini** soru-cevap için güncellenir.

## 3. Sorun olursa

1. Uygulamada **Ayarlar → Sistem durumu → Sistem sağlığı panosu**'nu açın. Orada:
   - her kaynağın durumu (yeşil / sarı / kırmızı), son başarılı çekim zamanı ve son 14 günün kayıt grafiği,
   - hatalar sade dille ("Site erişimi engelledi", "Sayfanın tasarımı değişmiş olabilir" …),
   - **beklenti sapması**: hata olmasa bile bir kaynaktan gelen kayıt sayısı olağanın belirgin altına düşerse uyarı,
   - yapay zekâ maliyeti ve ay sonu tahmini, değerlendirme bekleyen kayıtlar, veritabanı kotaları.
2. Bir kaynak birkaç gün sarı/kırmızı kalırsa açıklamasını olduğu gibi bana (ya da depoyu bakan kişiye) iletin.
   Diğer kaynaklar etkilenmez; eksik günler bir sonraki çalıştırmada kendiliğinden yeniden denenir.
3. "Otomatik toplama … saattir çalışmadı" uyarısı: GitHub'da depo → **Actions** → "Enfeksiyon Gündemi · Günlük toplama"
   → (varsa) **Enable workflow**, ardından **Run workflow**. İş akışı bunu önlemek için her çalıştırmada kendini yeniden
   etkinleştirir; yine de olursa bu adım yeterlidir.
4. **Actions** sekmesinde kırmızı çarpılı bir çalıştırmaya tıklarsanız hata mesajı Türkçe yazılmıştır.

## 4. Ayarları değiştirmek (isteğe bağlı)

Hiçbir şeyi değiştirmeniz gerekmez. İsterseniz aşağıdaki dosyaları GitHub'ın web arayüzünden düzenleyebilirsiniz:
dosyayı açın → kalem simgesi → değişikliği yapın → **Commit changes**. Değişiklik bir sonraki çalıştırmada geçerli olur.
Her dosyanın içinde açıklamalar Türkçedir.

| Dosya | Ne ayarlanır |
|---|---|
| `config/pubmed.yaml` | PubMed arama terimleri (aynı terimler genel dergilerde konu süzgeci olarak da kullanılır) |
| `config/sources.yaml` | Dergi beslemeleri, kurumlar, ön baskılar; her kaynak `enabled: false` ile kapatılabilir |
| `config/journals.yaml` | 1. ve 2. katman dergiler, Türkiye kaynaklı dergiler |
| `config/topics.yaml` | Konu etiketleri |
| `config/ai.yaml` | Modeller, günlük editör yazısı sayısı, **aylık bütçe tavanı**, haftalık baskı ve soru-cevap ayarları |
| `config/limits.yaml` | Veritabanı kotası sınırları ve sistem sağlığı eşikleri |
| `prompts/*.md` | Yapay zekâya verilen talimatlar (düz Türkçe metin): `triage` ön değerlendirme, `editor` editör yazısı, `weekly` haftalık giriş yazısı, `qa` ve `qa-plan` soru-cevap |

## 5. Maliyet

- Altyapı ücretsizdir (GitHub Actions, Cloudflare Pages ve D1 ücretsiz katmanları). Tek maliyet Claude API kullanımıdır.
- **Aylık bütçe tavanı:** `config/ai.yaml` → `budget.monthly_usd` (şu an 25 $). Dolarsa yeni değerlendirme ve soru alınmaz;
  panoda uyarı çıkar. Tavanın %80'ine gelindiğinde sarı uyarı görünür.
- Toplu işleme (Batch API, %50 indirim), istem önbellekleme, günlük yazı tavanı ve aynı yayını asla iki kez işlememe
  maliyeti düşük tutar. Her çağrı maliyetiyle kaydedilir; güncel tutar panoda.
- Ek güvenlik için Anthropic Console → Settings → Limits'te aylık harcama limiti koymanızı öneririm.

## 6. Kurulum (bir kez yapıldı; yeniden kurmak gerekirse)

1. **Hesaplar:** Cloudflare (ücretsiz), Anthropic Console (API anahtarı + kredi), NCBI (ücretsiz API anahtarı).
2. **GitHub Secrets** — depo → Settings → Secrets and variables → Actions → *New repository secret*.
   Anahtarlar yalnızca burada durur; kodda ya da sohbette paylaşılmaz.

   | Ad | Değer |
   |---|---|
   | `CLOUDFLARE_API_TOKEN` | Cloudflare API jetonu (izinler: Account · D1 · Edit, Account · Cloudflare Pages · Edit) |
   | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare hesap kimliği |
   | `NCBI_API_KEY` | NCBI API anahtarı |
   | `NCBI_EMAIL` | NCBI'ye bildirilen iletişim e-postası |
   | `ANTHROPIC_API_KEY` | Claude API anahtarı (soru-cevap için Cloudflare'e de otomatik, şifreli aktarılır) |
   | `EG_ACCESS_TEAM_DOMAIN` | Cloudflare Access ekip alan adı (ör. `adiniz.cloudflareaccess.com`) |
   | `EG_ACCESS_AUD` | Cloudflare Access uygulamasının "Application Audience (AUD) Tag" değeri |

3. Kod `main` dalına geldiğinde **Yayın** iş akışı veritabanını ve siteyi kendiliğinden kurar.
   Elle başlatmak için: depo → **Actions** → "Enfeksiyon Gündemi · Yayın" → **Run workflow**.
4. **Giriş koruması (Cloudflare Access):** Cloudflare → Workers & Pages → proje → Settings → *Restrict previews*;
   ardından Zero Trust → Access → Applications'ta oluşan uygulamanın Subdomain kutusundaki `*` silinip kaydedilir
   (böylece ana adres de korunur) ve *Restrict previews*'a bir kez daha basılır. Uygulamanın AUD değeri ve ekip alan adı
   yukarıdaki iki secret'a girilir; uygulama bu imzayı ayrıca kendisi de doğrular. Yayın iş akışı her seferinde sitenin
   girişsiz açılmadığını kontrol eder.

## 7. Geliştirici notları

| Klasör | İçerik |
|---|---|
| `pipeline/` | Toplama ve yapay zekâ işleri (Node 22, TypeScript). `src/jobs/collect.ts`, `process.ts`, `weekly.ts` |
| `web/` | Arayüz ve soru-cevap uç noktaları (SvelteKit, Cloudflare Pages) |
| `db/migrations/` | Veritabanı şeması (Cloudflare D1 / SQLite); yayın ve toplama iş akışları otomatik uygular |
| `scripts/prepare-db.sh` | Veritabanını bulur/oluşturur, şemayı uygular |

```bash
# Toplayıcı testleri ve tür denetimi
cd pipeline && npm ci && npm test && npx tsc --noEmit

# Yerel veritabanına gerçek PubMed verisiyle deneme toplaması
cd pipeline && LOCAL_DB=/tmp/eg.db npm run collect

# Web arayüzü
cd web && npm ci && npm run check && npm run build
```

- Cloudflare D1 ücretsiz katmanı: günde 100.000 satır yazma, veritabanı başına 500 MB. Toplayıcı yazma sayısını izler ve
  kota dolmadan durur; kalan iş ertesi güne kalır.
- Arşiv araması (FTS5) yalnızca triyajda alakalı bulunan yayınları kapsar.
- Editör yazısı istemi değiştiğinde `pipeline/src/jobs/process.ts` içindeki `PROMPT_VERSION` artırılır; her yazı hangi
  istem sürümüyle yazıldığını saklar.
