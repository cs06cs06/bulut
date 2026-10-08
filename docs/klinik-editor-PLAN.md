# Kişisel Klinik Editör — Mimari ve Geliştirme Planı (taslak, onay bekliyor)

> Durum: **Öneri.** Kodlamaya onaydan sonra başlanacak. Sorular en sonda.

## 1. Teknoloji seçimi (tamamı ücretsiz katman)

| Katman | Seçim | Neden |
|---|---|---|
| Zamanlanmış toplama ve AI işleri | **GitHub Actions** (günlük cron) | Ücretsiz, kod zaten GitHub'da, uzun süren işler (XML ayrıştırma, toplu AI) için uygun. Gizli repo: ayda 2.000 dk ücretsiz; bizim iş günde ~10–20 dk → ayda ~300–600 dk. |
| Veritabanı | **Cloudflare D1** (SQLite) | Ücretsiz 5 GB, günde 5 milyon satır okuma / 100.000 yazma. Supabase'in aksine hareketsizlikte "uyku moduna" geçmez → bakım gerektirmez. Tam metin arama (FTS5) var. |
| Ön yüz + API | **Cloudflare Pages + Pages Functions** | Ücretsiz, Türkiye'ye yakın sunucular, hızlı. Okuma API'si hafif sorgulardan oluşur (ücretsiz plandaki 10 ms CPU sınırı ağ beklemesini saymaz). |
| Giriş koruması | **Cloudflare Access** (e-postaya tek kullanımlık kod) | Uygulamanın önüne kurumsal düzeyde bir kapı; şifre tutmayız, yalnızca sizin e-postanız girebilir. API ayrıca Access imzasını doğrular (çift katman). |
| Dil | **TypeScript** (her yerde) | Tek dil → bakım kolay. Resmi Anthropic SDK'sı var. |
| Arayüz | **SvelteKit** (statik SPA + PWA) | Çok küçük paket boyutu → mobil veride hızlı açılış; çevrimdışı önbellek. |
| Yapay zekâ | **Claude API** | Triyaj: `claude-haiku-5-5` ($0,10 / $0,50 per 1M token). Editör + soru-cevap: `claude-opus-5-5` ($4 / $20) veya `claude-sonnet-5-5` ($2 / $10) — sizin kararınız (Soru 2). |

Neden Supabase + Vercel değil? Supabase ücretsiz projeleri 7 gün hareketsizlikte duraklatılıyor ve 500 MB sınırı var; toplama bir hafta aksarsa pano da dahil her şey kapanır. Cloudflare tek panelden yönetilir.

## 2. Uçtan uca akış (her gün, Türkiye saatiyle sabah)

```
1 Topla      → PubMed, Europe PMC, medRxiv/bioRxiv, dergi RSS, rehber kaynakları
2 Normalize  → tek kayıt formatı
3 Birleştir  → DOI / PMID / PMCID / başlık benzerliği; ön baskı ↔ dergi yayını bağla
4 Zenginleştir → OpenAlex (dergi, atıf), Crossref (DOI doğrulama), Europe PMC (açık tam metin)
5 Ön puan    → kural tabanlı: dergi katmanı, yayın türü, kaynak türü (ücretsiz)
6 Triyaj     → Haiku, Batch API (%50 indirim): alakalı mı, önem 1–5, konu etiketleri
7 Seçim      → bütçe ve günlük tavan içinde en önemliler
8 Editör     → güçlü model, Batch API, yapılandırılmış (şemalı) çıktı
9 Yayımla    → günlük baskı; pazar günü haftalık baskı + editör girişi
10 Sağlık    → her adımın kaydı (log) → pano
```

- **Hatalara dayanıklılık:** Her kaynak bağımsız çalışır (biri çökse diğerleri devam eder); üstel geri çekilmeyle yeniden deneme; gün içinde ikinci bir "toparlama" çalıştırması yarım kalan işleri (ör. bitmemiş Batch) tamamlar. Her adım tekrar çalıştırılabilir; aynı makale iki kez işlenmez.
- **Hiçbir şey kaybolmaz:** Triyajda elenen kayıtlar da arşivde kalır ve aranabilir; sadece akışı doldurmaz. Ayrıca güvenlik ağı: 1. katman dergiler, rehberler, RKÇ ve meta-analizler triyaj "düşük" dese bile insan-okunur bir listeye ("Gözden kaçmasın") düşer.

### Önerilen 3 katmanlı içerik
1. **Tam editör yazısı** (güçlü model) — günün en önemli ~5–10 yayını.
2. **Kısa not** (Haiku, 2–3 cümle Türkçe) — önemli ama tam yazıyı hak etmeyenler.
3. **Arşiv kaydı** (yalnızca künye) — geri kalanı; arama ve soru-cevapta kullanılır.

## 3. Kaynaklar (doğrulanmış koşullar)

| Kaynak | Erişim | Not |
|---|---|---|
| PubMed E-utilities | Ücretsiz API anahtarı; anahtarla 10 istek/sn (anahtarsız 3) | `tool` ve `email` parametreleri kaydedilmeli. Ana omurga. |
| Europe PMC REST | Anahtarsız | Açık erişim tam metin (JATS XML), ön baskılar. Koşullar uygulama sırasında tekrar kontrol edilecek. |
| OpenAlex | Anahtarsız başlanabilir; ücretsiz anahtar günlük bütçeyi 10× artırıyor | Bizim kullanım çok düşük. |
| Crossref | Anahtarsız; `mailto` ile "polite pool": 10 istek, eşzamanlı 3 | DOI doğrulama. |
| medRxiv / bioRxiv | `api.biorxiv.org` `details` ve `pubs` uç noktaları | Ön baskılar ayrı etiketli; `pubs` ile dergi yayınına bağlanır. |
| Dergi RSS | Yapılandırma dosyasındaki liste | PubMed gecikmesini kapatır. |
| Rehber kaynakları | RSS varsa RSS, yoksa sayfa izleme (değişiklik tespiti) | CDC/MMWR, WHO, ECDC: RSS. IDSA, ESCMID, EUCAST, CLSI, KLİMİK, Sağlık Bakanlığı: büyük olasılıkla sayfa izleme. **Dürüst uyarı:** web sayfası izleme, site tasarımı değişince bozulabilir; panodaki "beklenti sapması" uyarısı bunu yakalar. |

Bütün sorgular, dergi katmanları, kaynak listesi ve editör talimatları kod dışında, düz metin dosyalarında (`config/*.yaml`, `prompts/*.md`). İsterseniz GitHub'ın web arayüzünden düzenlenebilir; istemezseniz hiç dokunmanız gerekmez.

## 4. Veri modeli (özet)

- `works` — tekil yayın (başlık, yazarlar, dergi, tarih, DOI, PMID, PMCID, tür, özet, tam metin var mı, ön baskı mı, bağlı yayın)
- `source_records` — her kaynaktan gelen ham kayıt (hangi kaynaktan, ne zaman); birleştirmenin izi
- `triage` — alaka, önem puanı, konular, gerekçe, model, token
- `reviews` — editör yazısı: yapılandırılmış alanlar (kanca, etki seviyesi, önce→sonra, pratikte, kanıt, sınırlılıklar, finansman/ÇÇ, bağlam, Türkiye, dayanak: özet/tam metin), istem sürümü
- `issues` / `issue_items` — günlük ve haftalık baskılar, haftalık giriş yazısı
- `reading_state` — okundu, kaydedildi
- `chats` / `chat_messages` — makale bazında (veya genel) sohbet geçmişi
- `runs` / `run_events` — her çalıştırmanın ve kaynağın kaydı (pano bunu okur)
- `ai_usage` — her AI çağrısının token ve maliyeti (aylık maliyet panosu)
- Tam metin arama indeksi (FTS5): başlık, özet, editör yazısı

## 5. Editör ve maliyet kontrolü

- Editör çıktısı **JSON şemasına bağlı** (yapılandırılmış çıktı) → her yazıda 10 bölüm eksiksiz; arayüz tutarlı.
- Rehber/konsensus belgeleri için ayrı istem: "ne değişti" odaklı.
- Dürüstlük kuralları sistem isteminde + şemada `dayanak` alanı ("yalnızca özet" uyarısı otomatik görünür).
- Bağlam/süreklilik: yazı öncesi arşivden ilgili geçmiş değerlendirmelerin kısa özetleri isteme eklenir.
- Türkiye bağlamı: model emin değilse "yerel veriyle karşılaştırılmalı" der. İsterseniz sonradan küçük bir "yerel bağlam notları" dosyası eklenebilir (zorunlu değil).
- **Maliyet frenleri:** günlük tam yazı tavanı, günlük triyaj tavanı, aylık dolar tavanı (aşılırsa sistem durur ve panoda uyarır), Batch API (%50 indirim), istem önbellekleme, aynı makaleyi asla ikinci kez işlememe. Anthropic konsolunda ayrıca harcama limiti koymanızı önereceğim.

### Tahmini aylık maliyet (varsayım: günde ~500 aday, ~8 tam yazı, ayda ~50 soru)

| Kalem | Opus 5.5 ile | Sonnet 5.5 ile |
|---|---|---|
| Triyaj + kısa notlar (Haiku, batch) | ~$1–2 | ~$1–2 |
| Editör yazıları (batch) | ~$12–18 | ~$6–9 |
| Soru-cevap | ~$4–6 | ~$2–3 |
| **Toplam** | **~$17–26** | **~$9–14** |

Gerçek rakamlar ilk haftadan sonra panoda ölçülecek; tavanı buna göre ayarlarız.

## 6. Soru-cevap

- Makale sayfasında sabit "Soru sor" düğmesi; cevap o makalenin özeti/tam metni + editör yazısıyla.
- Genel sorular: model önce soruyu yapılandırılmış bir aramaya çevirir (anahtar kelimeler, tarih aralığı, konu), arşivde arar, bulunan makalelere dayanarak cevaplar ve her iddia için makaleyi gösterir. Bulamazsa "arşivde bulamadım" der.
- Akış (streaming) ile cevap anında yazılmaya başlar. Geçmiş makale bazında saklanır.

## 7. Arayüz

Mobil öncelikli kart akışı; "Senin için yeni" açılışta; etki seviyesine göre görsel hiyerarşi; kaydedilenler; filtreler (konu, etki, tür, kaynak; ön baskılar ayrı rozetli); arşiv araması; karanlık mod (sistem + elle); PWA; sade tek cümlelik "klinik karar destek aracı değildir" notu (alt bilgi + hakkında); üstte sorun olduğunda ince uyarı şeridi.

## 8. Aşamalar (her birinin sonunda çalışan sürüm + test talimatı)

1. **Altyapı + PubMed toplama + veritabanı + yineleme temizliği** — Cloudflare/GitHub kurulumu, giriş koruması, telefondan açılan çok basit bir "toplanan kayıtlar" listesi.
2. **Triyaj + editör değerlendirmesi** — ilk gerçek editör yazıları (basit görünümde).
3. **Mobil okuma arayüzü** — kart akışı, okuma takibi, kaydedilenler, filtreler, karanlık mod, PWA.
4. **Diğer kaynaklar** — Europe PMC, OpenAlex, Crossref, medRxiv/bioRxiv, RSS, rehber kaynakları; ön baskı ↔ yayın bağlama.
5. **Soru-cevap.**
6. **Sağlık panosu ve uyarılar.**
7. **Haftalık baskı, bağlam/süreklilik, son rötuşlar, README.**

## 9. Sizden gerekecek hesaplar (aşama 1'de adım adım anlatılacak)

GitHub (var), Cloudflare (ücretsiz), Anthropic Console (API anahtarı + kredi + harcama limiti), NCBI hesabı (ücretsiz API anahtarı).
