"""Komut satırından seslendirme.

    python -m tts_app "Merhaba, nasılsınız?" -o merhaba.wav
    python -m tts_app -f metin.txt -o kitap.wav --speed 1.1
    echo "Siparişiniz yola çıktı." | python -m tts_app --play
"""
import argparse
import sys

from .audio import to_wav
from .engine import get_tts


def parse_args(argv=None):
    p = argparse.ArgumentParser(prog="python -m tts_app", description="EMA Lightning ile Türkçe metinden sese.")
    p.add_argument("text", nargs="?", help="seslendirilecek metin (verilmezse -f veya standart girdi okunur)")
    p.add_argument("-f", "--file", help="metni bu dosyadan oku")
    p.add_argument("-o", "--output", help="WAV olarak kaydet")
    p.add_argument("--play", action="store_true", help="üretilirken hoparlörden çal (sounddevice gerekir)")
    p.add_argument("--speed", type=float, default=1.0, help="konuşma hızı, 0.25 ile 4 arası (varsayılan 1.0)")
    p.add_argument("--seed", type=int, help="aynı tohum aynı sesi verir")
    p.add_argument("--sample-rate", type=int, default=48000, choices=(48000, 24000, 16000, 8000))
    args = p.parse_args(argv)
    if not args.output and not args.play:
        args.output = "konusma.wav"
    return args


def read_text(args):
    if args.text:
        return args.text
    if args.file:
        with open(args.file, encoding="utf-8") as f:
            return f.read()
    return sys.stdin.read()


def main(argv=None):
    args = parse_args(argv)
    text = read_text(args)
    if not text.strip():
        sys.exit("Seslendirilecek metin boş.")
    tts = get_tts()

    if args.play:
        import numpy as np
        import sounddevice as sd

        parts = []
        with sd.OutputStream(samplerate=args.sample_rate, channels=1, dtype="float32") as speaker:
            for chunk in tts.stream(text, speed=args.speed, seed=args.seed, sample_rate=args.sample_rate):
                speaker.write(chunk)
                parts.append(chunk)
        audio = np.concatenate(parts) if parts else np.zeros(0, dtype=np.float32)
    else:
        speech = tts.say(text, speed=args.speed, seed=args.seed, sample_rate=args.sample_rate)
        audio = speech.audio
        print(f"{speech.duration:.2f} sn ses üretildi (tohum {speech.seed}).", file=sys.stderr)

    if args.output:
        with open(args.output, "wb") as f:
            f.write(to_wav(audio, args.sample_rate))
        print(f"Kaydedildi: {args.output}", file=sys.stderr)


if __name__ == "__main__":
    main()
