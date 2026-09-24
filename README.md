# Öfkeli Kanatlar

Dokunmatik telefonlar için 3 bölümlü, sapanlı kuş–domuz fizik oyunu (HTML5 Canvas + Matter.js).

- **Oynamak:** `index.html` dosyasını bir web sunucusundan açın (ör. `python3 -m http.server`) ya da GitHub Pages ile yayınlayın. Telefonu yatay tutun.
- **Kontroller:** Kuşu geriye çekip bırakın. Uçarken ekrana dokunun: sarı kuş hızlanır, mavi kuş üçe bölünür, bomba kuş patlar. Tek parmakla kaydırıp kamerayı gezdirin, iki parmakla yakınlaştırın.
- **Bölümler:** Yeşil Çayır · Gün Batımı Çölü · Mantar Vadisi (kral domuz).

## Varlıklar
- Bloklar, enkaz, arka plan öğeleri, partikül dokuları, çarpma/arayüz sesleri ve jingle'lar: [Kenney.nl](https://kenney.nl) — CC0 (`assets/LICENSE-kenney.txt`).
- Yazı tipi: Lilita One (SIL OFL).
- Kuşlar, domuzlar, sapan, zemin dokuları, müzik ve karakter sesleri: kodla (prosedürel) üretildi.
- Fizik: Matter.js (MIT).

`tools/sim-test.js` ve `tools/solve.js`, bölümlerin kendi başına sağlam durduğunu ve mevcut kuşlarla geçilebildiğini Node üzerinde doğrular.
