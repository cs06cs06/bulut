# Kağıt Top

Kağıdı buruştur, top yap ve çöp kutusuna fırlat! Tarayıcıda çalışan, kurulum
gerektirmeyen bir HTML5 Canvas oyunu.

## Nasıl oynanır?

- **Geri çek, bırak:** Fareyle ya da parmağınla ekranda sürükleyip bırak. Çektiğin
  yönün tersine, çektiğin mesafe kadar güçlü fırlatırsın. Mavi noktalar yörüngenin
  başını gösterir (rüzgârı hesaba katmaz!).
- **Rüzgâr:** Sağ üstteki vantilatör kartı rüzgârın yönünü ve şiddetini gösterir.
  2. seviyeden itibaren esmeye başlar ve giderek sertleşir.
- **Puanlama:** Basket 1 puan. Kutuya hiç değmeden (*Tertemiz!*) girerse 2 puan.
  Üst üste 3 basket ×2, 6 basket ×3 çarpan verir.
- **Seviyeler:** Her 3 basket bir seviye. Kutu uzaklaşır ve küçülür, önizleme
  kısalır, 5. seviyeden itibaren kutu sağa sola kaymaya başlar.
- **Haklar:** 3 ıskalama hakkın var. Iskaladığında kurulum aynı kalır, düzeltme şansın olur.

| Tuş | İşlev |
| --- | --- |
| <kbd>↑</kbd> <kbd>↓</kbd> | Açı |
| <kbd>←</kbd> <kbd>→</kbd> | Güç |
| <kbd>Boşluk</kbd> / <kbd>Enter</kbd> | Fırlat |
| <kbd>P</kbd> / <kbd>Esc</kbd> | Duraklat |
| <kbd>M</kbd> | Sesi aç/kapat |

En iyi skor tarayıcıda (`localStorage`) saklanır.

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
| Kağıt top, çöp kutusu, vantilatör görselleri | [Openclipart](https://openclipart.org) | CC0 |
| Ses efektleri | [Kenney](https://kenney.nl) — Impact, Interface ve Casino ses paketleri | CC0 |
| Patrick Hand fontu | [Google Fonts](https://fonts.google.com/specimen/Patrick+Hand) | SIL OFL 1.1 |

Dosya dosya ayrıntılar için: [`assets/CREDITS.md`](assets/CREDITS.md)

## Dosyalar

```
kagit-top/
├── index.html           # sayfa ve menü ekranları
├── style.css            # arayüz stilleri
├── game.js              # oyun döngüsü, fizik, çizim, ses
├── download-assets.sh   # assetleri orijinal kaynaklardan indirir
└── assets/
    ├── img/             # paper-ball.png, trash-bin.png, fan.png
    ├── sfx/             # .ogg ses efektleri
    ├── fonts/           # PatrickHand-Regular.ttf
    └── CREDITS.md
```
