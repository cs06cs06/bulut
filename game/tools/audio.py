# Converts the downloaded audio into web-friendly files (peak-normalised).
import subprocess, re, sys, os
A = sys.argv[1]; K = sys.argv[2]; OUT = 'public/assets/audio'
os.makedirs(OUT, exist_ok=True); os.makedirs('public/assets/music', exist_ok=True)
def peak(f):
    r = subprocess.run(['ffmpeg','-hide_banner','-i',f,'-af','volumedetect','-f','null','-'],capture_output=True,text=True).stderr
    m = re.search(r'max_volume: ([-\d.]+) dB', r); return float(m.group(1)) if m else 0
def conv(src, dst, mono=True, extra='', target=-1.0, trim=None):
    g = target - peak(src)
    af = f'volume={g:.2f}dB' + (','+extra if extra else '')
    cmd = ['ffmpeg','-y','-hide_banner','-loglevel','error','-i',src]
    if trim: cmd += ['-ss',str(trim[0]),'-t',str(trim[1])]
    cmd += ['-af',af] + (['-ac','1'] if mono else []) + ['-ar','44100']
    cmd += (['-c:a','libvorbis','-q:a','5'] if dst.endswith('.ogg') else ['-c:a','libmp3lame','-b:a','160k'])
    subprocess.run(cmd + [dst], check=True)
V, AM = A+'/vehicle/', A+'/ambience/'
sfx = {
 'engine_idle.ogg': V+'engine_idle_loop_richie.ogg', 'engine_low.ogg': V+'engine_loop_qubodup_48k.wav',
 'engine_mid.ogg': V+'engine_racing_loop_2.wav', 'engine_high.ogg': V+'engine_racing_loop_5.wav',
 'engine_diesel.ogg': V+'bus_engine_loop_qubodup.ogg',
 'gravel_loop.ogg': V+'gravel_road_driving.mp3', 'skid_dirt.ogg': V+'wheel_spin_gravel.mp3', 'skid_road.ogg': V+'tire_squeal_loop.wav',
 'wind_loop.ogg': AM+'wind_gentle_open_plain_loop.ogg', 'birds_loop.ogg': AM+'spring_birds_loop.ogg', 'countryside.ogg': AM+'countryside_brunoboselli.mp3',
 'wheat_field.ogg': AM+'wheat_field.mp3', 'cow_moo_1.ogg': AM+'cow_moo_felixblume.mp3', 'cow_moo_2.ogg': AM+'cow_moo_short.mp3',
 'rooster.ogg': AM+'rooster_crow_1.mp3', 'chickens.ogg': AM+'chicken_clucking.mp3', 'stream.ogg': AM+'stream_gentle.mp3',
 'crash_1.ogg': V+'crash_collision_qubodup.ogg', 'crash_2.ogg': V+'metal_bump_crash.mp3', 'crash_3.ogg': V+'clank_car_crash_qubodup.mp3',
 'impact_wood.ogg': V+'impact_wood.ogg', 'impact_metal.ogg': V+'impact_metal.ogg', 'impact_stone.ogg': V+'impact_stone.ogg',
 'land_thud.ogg': V+'body_fall_heavy_dirt.mp3', 'suspension.ogg': V+'suspension_creak.mp3', 'horn.ogg': V+'car_horn_keweldog.mp3',
 'gear.ogg': V+'gear_column_select_up.mp3', 'engine_start.ogg': V+'engine_start_a.wav', 'door_close.ogg': V+'door_close.wav',
 'ui_click.ogg': K+'/kenney_ui-audio/Audio/click3.ogg', 'ui_hover.ogg': K+'/kenney_ui-audio/Audio/rollover2.ogg', 'ui_switch.ogg': K+'/kenney_ui-audio/Audio/switch2.ogg',
 'discover.ogg': K+'/kenney_impact-sounds/Audio/impactBell_heavy_001.ogg',
}
for d, s in sfx.items():
    if not os.path.exists(s): print('MISSING', s); continue
    conv(s, f'{OUT}/{d}')
for f in ['hillbilly_swing','still_pickin','river_valley_breakdown','fireflies_and_stardust','bama_country','guts_and_bourbon','cc0_gone_fishin_memoraphile','cc0_komiku_down_the_river']:
    conv(f'{A}/music/{f}.mp3', f'public/assets/music/{f.replace("cc0_","")}.mp3', mono=False, target=-1.5)
print('done')

# AAC fallbacks for browsers without Ogg Vorbis (older Safari / iOS)
for f in os.listdir(OUT):
    if f.endswith('.ogg'):
        subprocess.run(['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', '-i', f'{OUT}/{f}', '-c:a', 'aac', '-b:a', '112k', f'{OUT}/{f[:-4]}.m4a'], check=True)
