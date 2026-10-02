# Mozart KV 331/3 "Rondo alla Turca" (Mutopia, kamu malı MIDI) -> "alla turca" bando düzenlemesi
# Sağ el: klarnet + şehnay (zurna rengi), sol el: pizzicato yaylılar + fagot,
# yeniçeri vurmalıları: büyük davul, zil, üçgen (A majör "marş" bölümlerinde coşar).
import mido, random
random.seed(7)
import sys
src = mido.MidiFile(sys.argv[1] if len(sys.argv) > 1 else 'KV331_3_RondoAllaTurca.mid')
TPB = src.ticks_per_beat; BPM = 126
out = mido.MidiFile(type=1, ticks_per_beat=TPB)

def abs_events(track):
    t = 0; ev = []
    for x in track:
        t += x.time
        if x.type in ('note_on', 'note_off'): ev.append((t, x))
    return ev

def to_track(events, name):
    tr = mido.MidiTrack(); tr.append(mido.MetaMessage('track_name', name=name, time=0))
    events.sort(key=lambda e: (e[0], 0 if e[1].type == 'note_off' or (e[1].type == 'note_on' and e[1].velocity == 0) else 1))
    last = 0
    for t, m in events:
        m = m.copy(time=t - last); last = t; tr.append(m)
    tr.append(mido.MetaMessage('end_of_track', time=0)); return tr

ctl = mido.MidiTrack()
ctl.append(mido.MetaMessage('time_signature', numerator=2, denominator=4, time=0))
ctl.append(mido.MetaMessage('set_tempo', tempo=mido.bpm2tempo(BPM), time=0))
ctl.append(mido.MetaMessage('end_of_track', time=0))
out.tracks.append(ctl)

MAJOR = [(48, 128), (176, 256)]
inMajor = lambda b: any(a <= b < z for a, z in MAJOR)
def dyn(t, base):
    b = t / TPB; pos = (b - 1) % 2  # 2/4 ölçü; ilk vuruş beat 1
    acc = 12 if abs(pos) < 1e-6 else 4 if abs(pos - 1) < 1e-6 else -6
    return max(30, min(127, int(base + acc + (8 if inMajor(b) else 0) + random.randint(-4, 4))))

def voice(track, ch, prog, vscale, transpose=0, pan=64, vol=100, name=''):
    ev = [(0, mido.Message('program_change', channel=ch, program=prog)),
          (0, mido.Message('control_change', channel=ch, control=10, value=pan)),
          (0, mido.Message('control_change', channel=ch, control=7, value=vol)),
          (0, mido.Message('control_change', channel=ch, control=91, value=50))]
    for t, m in abs_events(track):
        n = m.note + transpose
        if m.type == 'note_on' and m.velocity > 0:
            ev.append((t, mido.Message('note_on', channel=ch, note=n, velocity=max(1, min(127, int(dyn(t, 84) * vscale))))))
        else:
            ev.append((t, mido.Message('note_off', channel=ch, note=n, velocity=0)))
    out.tracks.append(to_track(ev, name))

RH, LH = src.tracks[1], src.tracks[2]
voice(RH, 0, 71, 1.0, 0, 50, 110, 'klarnet')       # Clarinet
voice(RH, 1, 111, 0.62, 0, 80, 92, 'sehnay')       # Shanai (zurna rengi)
voice(RH, 2, 72, 0.45, 12, 70, 70, 'pikolo')       # Piccolo, oktav üstü, hafif
voice(LH, 3, 45, 1.0, 0, 64, 118, 'pizzicato')     # Pizzicato strings
voice(LH, 4, 70, 0.55, -12, 58, 85, 'fagot')       # Bassoon, oktav altı

# yeniçeri vurmalıları (kanal 10 = 9)
end_beat = 255
P = []
def hit(beat, note, vel, dur=0.1):
    t = int(beat * TPB)
    P.append((t, mido.Message('note_on', channel=9, note=note, velocity=vel)))
    P.append((t + int(dur * TPB), mido.Message('note_off', channel=9, note=note, velocity=0)))
P.append((0, mido.Message('control_change', channel=9, control=7, value=105)))
P.append((0, mido.Message('control_change', channel=9, control=91, value=60)))
b = 1.0
while b < end_beat - 0.5:
    bar = int((b - 1) // 2); maj = inMajor(b)
    hit(b, 35, 112 if maj else 96)                       # büyük davul, ilk vuruş
    hit(b + 1, 35, 84 if maj else 70)                    # ikinci vuruş
    if maj:
        hit(b + 0.5, 81, 46); hit(b + 1.5, 81, 46)       # üçgen ara vuruşlar
        if bar % 2 == 0: hit(b, 49 if bar % 8 == 0 else 55, 78)  # zil
        hit(b + 1, 39, 50)                               # el çırpma hissi
    else:
        if bar % 4 == 0: hit(b, 55, 58)                  # splash, seyrek
        hit(b + 1.5, 42, 40)                             # kapalı hi-hat, hafif
    b += 2
hit(end_beat - 1, 49, 100, 1.5); hit(end_beat - 1, 35, 120, 1)
out.tracks.append(to_track(P, 'vurmali'))
out.save(sys.argv[2] if len(sys.argv) > 2 else 'tema.mid')
print('ok', out.length)
