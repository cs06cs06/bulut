# Konsültasyon Defteri

Enfeksiyon Hastalıkları konsültasyonlarında hasta notlarını **cep telefonunda, yürürken, klavyeye en az dokunarak** kaydetmek için yapılmış bir web uygulaması (PWA). Ana ekrana eklenince normal bir uygulama gibi açılır ve internet olmadan da çalışır.

## Neler var?

| Bölüm | Nasıl girilir |
|---|---|
| **Kimlik** | Baş harfler (tek yazı alanı), protokol ve oda no için büyük sayı tuş takımı, yaş/kilo/boy için slider, servis ve yatak için butonlar, yatış tarihi için "Bugün / Dün / 3 gün önce" butonları |
| **Neden · Öykü** | Konsültasyon nedeni, alerji, komorbidite, risk faktörleri, kateter ve cihazlar (takılma tarihi ve kaçıncı gün olduğu) |
| **Vital** | Ateş, 24 saatlik maks. ateş, nabız, TA, solunum sayısı, SpO₂, GKS slider'ları (normal aralık yeşil bant olarak görünür), O₂ desteği, vazopressör, idrar çıkışı. **qSOFA** ve **OAB** otomatik hesaplanır |
| **Muayene** | Sistem sistem bulgu butonları, "Tüm sistemler doğal" kısayolu, önceki vizitten kopyalama, Wagner ve bası yarası evresi |
| **Lab** | Hemogram, CRP, PCT, biyokimya, laktat, INR, BOS vb. Büyük tuş takımıyla **sırayla giriş** (Tamam yerine "Sonraki ›"), önceki değer ve ↑/↓ gösterimi, trend tablosu. Kreatininden **CrCl (Cockcroft-Gault)** ve **eGFR (CKD-EPI 2021)** hesaplanır; obezde düzeltilmiş kilo kullanılır |
| **Mikro** | Kültürler (örnek tipi, tarih, pozitif şişe, Gram boyama, izolat, direnç: ESBL/CRE/OXA-48/MRSA/VRE…, dokunarak S → I → R antibiyogram), seroloji ve hızlı testler (dokunarak + / − / bekleniyor), görüntüleme |
| **Antibiyotik** | İlaç listesi, hazır doz butonları, yol, uzatılmış infüzyon, başlangıç tarihi (**kaçıncı gün** otomatik), durum (Kullanıyor / Başlansın / Kesilsin / Kesilmiş), **kısıtlı antibiyotik onayı** ve onayın son günü |
| **Plan** | Ön tanı, değerlendirme, hazır öneri butonları (tanısal, tedavi, izolasyon, takip), serbest öneri, kontrol tarihi |
| **Not** | Girilen her şeyden **hazır Türkçe konsültasyon notu** (tam veya özet). Tek dokunuşla kopyalanır; HBYS'ye yapıştırılabilir |

Liste ekranında hastalar servis ve oda sırasıyla dizilir. "Bugün bakılacak" sekmesi kontrol günü gelen, onayı biten hastaları toplar. **Tur özeti** tüm aktif hastaları tek metin halinde verir (devir için).

Her değişiklik anında kaydedilir; kaydet butonu yoktur. Eklediğiniz servis, ilaç, mikroorganizma gibi seçenekler bir sonraki hastada da listede çıkar.

## Telefona kurulum

1. Uygulamayı bir adreste yayınlayın (aşağıda GitHub Pages anlatılıyor).
2. Telefonda adresi açın.
   - **Android (Chrome):** menü ⋮ → *Ana ekrana ekle* / *Uygulamayı yükle*
   - **iPhone (Safari):** Paylaş → *Ana Ekrana Ekle*
3. Ana ekrandaki simgeden açın. İlk açılıştan sonra internet olmadan da çalışır.

### GitHub Pages ile yayınlama (ücretsiz)

1. GitHub'da depo → **Settings → Pages**
2. *Source*: **Deploy from a branch**, *Branch*: `main` ve `/ (root)` → **Save**
3. Bu klasör `main` dalına birleştirildikten sonra birkaç dakika içinde uygulama şu adreste açılır:
   `https://cs06cs06.github.io/bulut/konsultasyon/`

## Gizlilik ve veri güvenliği

- Hasta bilgileri **yalnızca telefonunuzda** (tarayıcının IndexedDB deposunda) tutulur. Hiçbir sunucuya gönderilmez. Uygulamanın kodu herkese açık olsa da girdiğiniz veriler başkasına görünmez.
- Ad yerine **baş harf** kullanmanız önerilir.
- **Ayarlar → PIN** ile 4 haneli kilit koyabilirsiniz; uygulama arka planda belirlediğiniz süreden uzun kalınca kilitlenir. PIN açan kişiyi durdurur, verileri şifrelemez; telefon ekran kilidini mutlaka kullanın.
- Takibi bitenleri **30 gün sonra toplu silme** ve **tüm verileri silme** seçenekleri Ayarlar'dadır.

## Yedekleme

Veriler telefonda durduğu için telefon kaybolursa ya da tarayıcı verileri silinirse notlar da gider. **Ayarlar → Yedek dosyası indir** ile `.json` yedeği alın ve güvenli bir yerde saklayın. Aynı ekrandaki **Yedekten geri yükle** ile başka bir telefona da aktarabilirsiniz (aynı hastanın daha yeni kaydı korunur). Uygulama 7 günden eski yedekte uyarı gösterir.

## Klinik not

CrCl, eGFR, qSOFA ve hazır doz butonları yalnızca yardımcıdır. Hazır dozlar normal böbrek fonksiyonu olan erişkin içindir; referans aralıkları laboratuvarınıza göre değişebilir. Klinik karar ve doz ayarı hekime aittir.

## Dosyalar

```
konsultasyon/
├── index.html            uygulama kabuğu
├── styles.css            arayüz (açık/koyu tema)
├── catalog.js            seçenek listeleri: servis, neden, ilaç, mikroorganizma, öneri…
├── app.js                uygulama mantığı, kayıt, hesaplamalar, not üretimi
├── sw.js                 çevrimdışı çalışma
├── manifest.webmanifest  ana ekrana ekleme
├── icons/                simgeler
└── tools/tek-dosya.mjs   tüm uygulamayı tek HTML dosyasına paketler
```

Listelerde değişiklik (ör. hastanenizin servisleri, sık kullandığınız ilaçlar) için `catalog.js` dosyasını düzenlemek yeterlidir. Uygulamayı güncelledikten sonra `sw.js` içindeki `CACHE` adını değiştirin (`konsultasyon-v2` gibi) ki telefonlar yeni sürümü alsın.
