// İskeletli (rigged) modeller için animasyon geçişleri. Meshy rigging'den gelen
// yürüme/koşma klipleri ve animasyon kütüphanesinden seçilen klipler burada oynatılır.
import * as THREE from 'three';

function canonicalName(name) {
  const n = name.toLowerCase();
  if (['idle', 'walk', 'run', 'jump', 'victory'].includes(n)) return n;
  if (/jump/.test(n)) return 'jump';
  if (/run|sprint/.test(n)) return 'run';
  if (/walk/.test(n)) return 'walk';
  if (/idle|survey|stand|breath/.test(n)) return 'idle';
  if (/victory|cheer|win/.test(n)) return 'victory';
  return n;
}

// Kök kemiğin yatay hareketini (root motion) sıfırla; karakter olduğu yerde yürüsün.
function removeRootMotion(clip) {
  const c = clip.clone();
  for (const track of c.tracks) {
    if (!track.name.endsWith('.position')) continue;
    const bone = track.name.slice(0, -'.position'.length).toLowerCase();
    if (!/hips|pelvis|root|armature/.test(bone)) continue;
    const v = track.values;
    const x0 = v[0];
    const z0 = v[2];
    for (let i = 0; i < v.length; i += 3) {
      v[i] = x0;
      v[i + 2] = z0;
    }
  }
  return c;
}

export class Animator {
  constructor(root, clips) {
    this.mixer = new THREE.AnimationMixer(root);
    this.actions = new Map();
    this.current = null;
    this.currentName = null;
    for (const clip of clips) {
      const name = canonicalName(clip.name);
      if (this.actions.has(name)) continue;
      this.actions.set(name, this.mixer.clipAction(removeRootMotion(clip)));
    }
  }

  get empty() {
    return this.actions.size === 0;
  }

  has(name) {
    return this.actions.has(name);
  }

  play(name, { fade = 0.18, loop = true, timeScale = 1, startAt = 0 } = {}) {
    const action = this.actions.get(name);
    if (!action) return false;
    if (this.current === action) {
      action.timeScale = timeScale;
      return true;
    }
    action.reset();
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    action.clampWhenFinished = !loop;
    action.timeScale = timeScale;
    action.time = startAt * action.getClip().duration;
    action.enabled = true;
    action.setEffectiveWeight(1);
    if (this.current) action.crossFadeFrom(this.current, fade, false);
    action.play();
    this.current = action;
    this.currentName = name;
    return true;
  }

  update(dt) {
    this.mixer.update(dt);
  }
}
