# Kağıt Top

Kağıdı buruştur, top yap ve çöp kutusuna fırlat! Tarayıcıda çalışan, kurulum
gerektirmeyen bir HTML5 Canvas oyunu. Mekân: Dunder Mifflin Paper Company, Scranton şubesi.

## Ofis

- Asma tavan, arada bir titreyen floresanlar, halıfleks zemin ve jaluzili pencere
- DUNDER MIFFLIN tabelası ve **"Iskasız geçen atış"** panosu: serin burada tutulur,
  ıskalayınca kırmızı kalemle sıfırlanır; rekor serin altında yazar
- Masada tüplü monitör ve jöleye gömülmüş bir zımba
- Dosya dolabının üstünde pancarlar, köşede su sebili ve saksı
- **Dundies** rafı: kazandığın Dundie kupaları duvardaki rafta birikir

## Nasıl oynanır?

- **Geri çek, bırak:** Fareyle ya da parmağınla ekranda sürükleyip bırak. Çektiğin
  yönün tersine, çektiğin mesafe kadar güçlü fırlatırsın. Mavi noktalar yörüngenin
  başını gösterir (rüzgârı hesaba katmaz!).
- **Rüzgâr:** Sağ üstteki vantilatör kartı rüzgârın yönünü ve şiddetini gösterir.
  2. seviyeden itibaren esmeye başlar ve giderek sertleşir.
- **Puanlama:** Basket 1 puan. Kutuya hiç değmeden (*Tertemiz!*) girerse 2 puan.
  Üst üste 3 basket ×2, 6 basket ×3 çarpan verir.
- **Altın Bilet:** 2. seviyeden itibaren bazen parlayan altın bir kağıt gelir; kutuya
  girerse 3 kat puan getirir.
- **Koliler:** 3. seviyeden itibaren depodan gelen Dunder Mifflin kağıt kolileri masa ile
  kutu arasına yığılabilir. Üstünden aşırt ya da koliden sektirip sok (*Tabela!*).
- **Seviyeler:** Her 3 basket bir seviye. Kutu uzaklaşır ve küçülür, önizleme
  kısalır, 5. seviyeden itibaren kutu sağa sola kaymaya başlar.
- **Haklar:** 3 ıskalama hakkın var. Iskaladığında kurulum aynı kalır, düzeltme şansın olur.

### Dundie Ödülleri

Menüdeki **Dundie Rafı** kazandığın ve kilitli ödülleri gösterir; ödüller tarayıcıda saklanır.

| Dundie | Nasıl kazanılır |
| --- | --- |
| İlk Sipariş | İlk basketini at |
| Sıfır Hata | Kutuya hiç değmeden bir basket at |
| Kıl Payı | Çembere çarpıp içeri giren bir basket at |
| Tabela Ustası | Topu koliden sektirip kutuya sok |
| Altın Bilet | Altın Bilet topunu kutuya at |
| Ayın Çalışanı | Üst üste 5 basket |
| Bölge Müdürü | Üst üste 10 basket |
| Scranton'ın Gururu | 5. seviyeye ulaş |
| Yılın Satıcısı | Tek mesaide 50 puan |
| Dünyanın En İyi Patronu | Tek mesaide 100 puan |

| Tuş | İşlev |
| --- | --- |
| <kbd>↑</kbd> <kbd>↓</kbd> | Açı |
| <kbd>←</kbd> <kbd>→</kbd> | Güç |
| <kbd>Boşluk</kbd> / <kbd>Enter</kbd> | Fırlat |
| <kbd>P</kbd> / <kbd>Esc</kbd> | Kahve molası (duraklat) |
| <kbd>M</kbd> | Sesi aç/kapat |

En iyi skor, en uzun seri ve Dundie'ler tarayıcıda (`localStorage`) saklanır.

## Çalıştırma

`index.html` dosyasını doğrudan tarayıcıda açabilirsin. Ses ve fontların sorunsuz
yüklenmesi için yerel bir sunucu önerilir:

```bash
cd kagit-top
python3 -m http.server 8000
# → http://localhost:8000
```

## Assetler

Görseller, sesler ve font koda gömülü değil; hepsi harici kaynaklardan indirilen
ücretsiz lisanslı (CC0 / OFL) dosyalar. Depoda hazır geliyorlar, ama istersen
orijinal kaynaklarından yeniden indirebilirsin:

```bash
./download-assets.sh   # gerekenler: curl, unzip
```

| Tür | Kaynak | Lisans |
| --- | --- | --- |
| Kağıt top, çöp kutusu, vantilatör ve ofis eşyası görselleri | [Openclipart](https://openclipart.org) | CC0 |
| Ses efektleri | [Kenney](https://kenney.nl): Impact, Interface, Casino ve RPG ses paketleri | CC0 |
| Patrick Hand ve Bebas Neue fontları | [Google Fonts](https://fonts.google.com) | SIL OFL 1.1 |

Dosya dosya ayrıntılar için: [`assets/CREDITS.md`](assets/CREDITS.md)

## Dosyalar

```
kagit-top/
├── index.html           # sayfa ve menü ekranları
├── style.css            # arayüz stilleri
├── game.js              # oyun döngüsü, fizik, çizim, ses
├── download-assets.sh   # assetleri orijinal kaynaklardan indirir
└── assets/
    ├── img/             # top, kutu, vantilatör ve ofis eşyaları (.png)
    ├── sfx/             # .ogg ses efektleri
    ├── fonts/           # Patrick Hand, Bebas Neue
    └── CREDITS.md
```

> Dunder Mifflin, *The Office* dizisindeki kurgusal kağıt şirketidir. Bu oyun bir hayran
> çalışmasıdır; dizinin logosu, görselleri ya da sesleri kullanılmamıştır.
