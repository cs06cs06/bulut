# bulut
Github üzerinde bulutta geliştirdiğim tüm uygulamalarım

## ⚡ EMA Lightning Seslendirici (text-to-speech)

Hugging Face'teki [canberkkkkkk/ema-lightning](https://huggingface.co/canberkkkkkk/ema-lightning) modelini kullanan Türkçe metinden sese uygulaması. Model 8.6M parametreli ve yaklaşık 34 MB. GPU'da da CPU'da da internet bağlantısı olmadan çalışır (ilk açılışta ağırlıklar bir kez indirilir).

- **Web arayüzü:** metni yazarsınız, ses üretilirken çalmaya başlar. Hız, tohum (seed) ve örnekleme hızı ayarlanabilir. Sonuç WAV olarak indirilebilir.
- **REST API:** tek parça WAV (`/api/say`) ve akışlı PCM (`/api/stream`) uç noktaları.
- **Komut satırı:** metni ya da dosyayı WAV'a çevirir veya doğrudan hoparlörden çalar.

### Kurulum

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

### Web arayüzü

```bash
uvicorn tts_app.server:app --host 0.0.0.0 --port 8000
```

Ardından tarayıcıda http://localhost:8000 adresini açın. Kısayol: metin kutusunda `Ctrl+Enter` seslendirmeyi başlatır.

NVIDIA GPU varsa model açılışta `.lightning()` ile derlenir ve çok daha hızlı çalışır. Bu adımı kapatmak için `EMA_LIGHTNING=0` kullanın. Cihazı seçmek için `EMA_DEVICE=cpu` ya da `EMA_DEVICE=cuda` verilebilir.

### API

Her iki uç nokta da aynı JSON gövdesini alır:

| Alan | Değer | Varsayılan |
|---|---|---|
| `text` | 1–5000 karakter | zorunlu |
| `speed` | 0.25 – 4 | 1.0 |
| `seed` | negatif olmayan tam sayı; aynı tohum aynı sesi verir | rastgele |
| `sample_rate` | 48000, 24000, 16000, 8000 | 48000 |

```bash
# Tek parça WAV (yanıt başlıklarında X-Seed ve X-Duration döner)
curl -X POST localhost:8000/api/say -H 'Content-Type: application/json' \
     -d '{"text": "Merhaba, size nasıl yardımcı olabilirim?", "seed": 0}' -o merhaba.wav

# Akış: ham 16 bit mono PCM (little-endian); örnekleme hızı X-Sample-Rate başlığında
curl -N -X POST localhost:8000/api/stream -H 'Content-Type: application/json' \
     -d '{"text": "Siparişiniz yola çıktı.", "sample_rate": 24000}' -o akis.pcm
```

İlk akış parçası yaklaşık 1 saniyelik sestir, sonrakiler 4'er saniyelik gelir. İstemci bağlantıyı kesince kalan iş bırakılır.

### Komut satırı

```bash
python -m tts_app "Merhaba, nasılsınız?" -o merhaba.wav
python -m tts_app -f metin.txt -o kitap.wav --speed 1.1 --seed 0
echo "Randevunuz onaylandı." | python -m tts_app --play   # pip install sounddevice gerekir
```

### Testler

```bash
pip install -r requirements-dev.txt
pytest
```

Testler gerçek modeli indirmez, sahte bir model kullanır.

### Sorumlu kullanım

Model yalnızca Türkçe ve tek bir sesle konuşur. Üretilen sesi paylaşırken dinleyicilere yapay zekâ ile üretildiğini belirtin (ör. "Bu ses yapay zekâ ile üretilmiştir."). Sayılar, tarihler ve kısaltmalar otomatik normalleştirilir. Bankacılık, sağlık ve hukuk gibi kritik mesajlarda metni ve sesi bir insan kontrol etmelidir. Model Apache 2.0 lisanslıdır.
