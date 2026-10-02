# Santuri Ethem Efendi (1855-1926), "Şehnaz Longa" -> fasıl topluluğu düzenlemesi (MIDI).
# Kaynak: SymbTr (MTG / M. K. Karaosmanoğlu) txt dosyası, CC BY-NC-SA 4.0.
# Perdeler 53 koma sisteminden pitch bend ile çalınır (Hicaz/Şehnaz aralıkları korunur).
# Keman + klarnet ezgide, arp (kanun) oktav üstte, naylon gitar (ud) oktav altta;
# darbuka + def Sofyan usulünü vurur.
# Kullanım: python3 tema-duzenle.py <symbtr.txt> <cikti.mid>
import csv, random, sys
import mido

random.seed(11)
src = sys.argv[1] if len(sys.argv) > 1 else 'sehnaz--longa--sofyan----santuri_ethem_efendi.txt'
dst = sys.argv[2] if len(sys.argv) > 2 else 'tema.mid'
rows = list(csv.DictReader(open(src, encoding='utf-8'), delimiter='\t'))

TPB, BPM = 480, 150
REF_KOMA, REF_MIDI = 305, 69          # La4 (dügâh) = A4 440 Hz
WHOLE = TPB * 4

notes, t = [], 0                     # (başlangıç, süre, koma, kod, bölüm)
section = ''
for r in rows:
    if r['Kod'] not in ('7', '9', '24'): continue
    dur = round(WHOLE * int(r['Pay']) / int(r['Payda']))
    if r['Soz1'].strip(): section = r['Soz1'].strip()
    k = int(r['Koma53'])
    if k > 0: notes.append((t, dur, k, r['Kod'], section))
    t += dur
END = t
print('ölçü', END / WHOLE, 'süre sn', END / TPB * 60 / BPM)

def pitch(k, transpose=0):
    cents = (k - REF_KOMA) * 1200 / 53
    m = REF_MIDI + cents / 100 + transpose
    n = round(m)
    return n, max(-8192, min(8191, round((m - n) / 2 * 8192)))  # ±2 yarım ses bükme aralığı

def beat_acc(t0):
    b = (t0 % WHOLE) / TPB
    return 10 if b == 0 else 6 if b == 2 else 2 if b in (1, 3) else -4

out = mido.MidiFile(type=1, ticks_per_beat=TPB)
ctl = mido.MidiTrack()
ctl += [mido.MetaMessage('time_signature', numerator=4, denominator=4, time=0),
        mido.MetaMessage('set_tempo', tempo=mido.bpm2tempo(BPM), time=0),
        mido.MetaMessage('end_of_track', time=END)]
out.tracks.append(ctl)

def to_track(ev, name):
    tr = mido.MidiTrack(); tr.append(mido.MetaMessage('track_name', name=name, time=0))
    ev.sort(key=lambda e: (e[0], e[1]))
    last = 0
    for tt, _, m in ev:
        tr.append(m.copy(time=tt - last)); last = tt
    tr.append(mido.MetaMessage('end_of_track', time=0))
    out.tracks.append(tr)

def melody(ch, prog, vel, transpose=0, pan=64, vol=100, legato=0.92, pluck=False, rev=45, name=''):
    ev = [(0, 0, mido.Message('program_change', channel=ch, program=prog)),
          (0, 0, mido.Message('control_change', channel=ch, control=10, value=pan)),
          (0, 0, mido.Message('control_change', channel=ch, control=7, value=vol)),
          (0, 0, mido.Message('control_change', channel=ch, control=91, value=rev))]
    for t0, d, k, kod, sec in notes:
        n, bend = pitch(k, transpose)
        v = vel + beat_acc(t0) + (6 if sec == 'TESLİM' else 0) + random.randint(-5, 5)
        L = d * (0.45 if kod == '7' else 0.6 if pluck else legato)
        ev.append((t0, 0, mido.Message('pitchwheel', channel=ch, pitch=bend)))
        if kod == '24' and d >= TPB:   # çarpma süsleme: üst komşu nota kısa vuruş
            n2, b2 = pitch(k + 9, transpose)
            ev.append((t0, 1, mido.Message('note_on', channel=ch, note=n2, velocity=max(1, min(127, v - 15)))))
            ev.append((t0 + TPB // 8, 0, mido.Message('note_off', channel=ch, note=n2)))
            t0 += TPB // 8; L -= TPB // 8
        ev.append((t0, 1, mido.Message('note_on', channel=ch, note=n, velocity=max(1, min(127, int(v))))))
        ev.append((t0 + max(20, int(L)), 0, mido.Message('note_off', channel=ch, note=n)))
    to_track(ev, name)

melody(0, 40, 92, 0, 72, 112, 0.95, name='keman')             # Violin
melody(1, 71, 78, 0, 48, 100, 0.9, name='klarnet')            # Clarinet
melody(2, 46, 70, 12, 88, 84, pluck=True, name='kanun (arp)')  # Orchestral harp, oktav üstü
melody(3, 24, 74, -12, 40, 96, pluck=True, name='ud (gitar)')  # Nylon guitar, oktav altı

# vurmalılar: darbuka (konga/bongo) + def (tef). Sofyan, sekizlik ızgarada.
P = [(0, 0, mido.Message('control_change', channel=9, control=7, value=112)),
     (0, 0, mido.Message('control_change', channel=9, control=91, value=35))]
def hit(tt, note, vel, dur=60):
    P.append((tt, 1, mido.Message('note_on', channel=9, note=note, velocity=max(1, min(127, vel + random.randint(-6, 6))))))
    P.append((tt + dur, 0, mido.Message('note_off', channel=9, note=note)))
DUM, TEK, KA, DEF, ZIL = 64, 63, 62, 54, 53   # Low conga, open hi conga, mute hi conga, tambourine, ride bell
pattern = ['D', '.', 't', 'k', 'D', 'k', 't', 'k']
eighth = TPB // 2
for bar in range(END // WHOLE):
    b0 = bar * WHOLE
    for i, p in enumerate(pattern):
        tt = b0 + i * eighth
        if p == 'D': hit(tt, DUM, 104 if i == 0 else 92)
        elif p == 't': hit(tt, TEK, 96)
        elif p == 'k': hit(tt, KA, 54)
        if i % 2 == 0: hit(tt, DEF, 70 if i in (2, 6) else 46)
    if bar % 8 == 0: hit(b0, ZIL, 64, 240)
hit(END - WHOLE, DUM, 118); hit(END - WHOLE, ZIL, 80, 480)
to_track(P, 'darbuka-def')
out.save(dst)
print('kaydedildi', dst, round(out.length, 2), 'sn')
