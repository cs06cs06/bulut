// Çuvallı yarışmacı: iskeletli karakter + PBR çuval bezi.
// Animasyon kütüphanesi gövdeyi canlandırır; bacaklar çuvalın içinde sabitlenir, eller IK ile çuval ağzını tutar.
import * as THREE from 'three';
import { createCharacter, solveArmIK } from './characters.js';
import { sackTexture, sackGeometry, blobMaterial } from './people.js';
import { assets } from './assets.js';

const LEG_BONES = ['thigh_l', 'calf_l', 'foot_l', 'ball_l', 'thigh_r', 'calf_r', 'foot_r', 'ball_r'];
const _t = new THREE.Vector3(), _p = new THREE.Vector3(), _ax = new THREE.Vector3(), _q = new THREE.Quaternion(), _qw = new THREE.Quaternion(), _qp = new THREE.Quaternion();

function rotateWorld(bone, axis, angle) {
  _q.setFromAxisAngle(axis, angle);
  bone.getWorldQuaternion(_qw).premultiply(_q);
  bone.parent.getWorldQuaternion(_qp).invert();
  bone.quaternion.copy(_qp.multiply(_qw));
}

export function buildRacer(def, num, lod = false) {
  const look = def.look, b = look.build;
  const root = new THREE.Group();
  const hop = new THREE.Group(); root.add(hop);
  const tilt = new THREE.Group(); hop.add(tilt);

  // çuval
  const tex = sackTexture(def.family === 'Tellioğlu' ? ['TELLİOĞLU', 'UN • İSKENDERİYE'] : ['SEFEROĞLU', 'BUĞDAY • MISIR'], num,
    def.family === 'Tellioğlu' ? '#5a1a12' : '#14304d');
  tex.repeat.set(2, 1);
  const sackMat = new THREE.MeshStandardMaterial({
    map: tex, normalMap: assets.tex.hessianNor, roughnessMap: assets.tex.hessianArm,
    roughness: 1, metalness: 0, side: THREE.DoubleSide, normalScale: new THREE.Vector2(0.9, 0.9),
  });
  const sack = new THREE.Mesh(sackGeometry(b), sackMat);
  sack.castShadow = true; sack.receiveShadow = true;
  sack.rotation.y = Math.PI * 0.75;
  sack.scale.y = 1.06;
  tilt.add(sack);
  const inner = new THREE.Mesh(new THREE.CircleGeometry(0.3 * (0.92 + b * 0.12), 20), new THREE.MeshBasicMaterial({ color: 0x1a120a }));
  inner.rotation.x = -Math.PI / 2; inner.position.y = 0.9; sack.add(inner);

  // karakter
  const ch = createCharacter({ sex: 'f', lod, main: look.dress, trim: look.trim, scarf: look.scarf, skin: look.skinTint ?? 0xffffff, hideLegs: true });
  ch.root.rotation.y = Math.PI;
  const wide = 1 + (b - 1) * 0.45;
  ch.root.scale.set(wide, look.height ?? 1, wide);
  tilt.add(ch.root);
  ch.play('Idle_Loop');
  const rimR = 0.39 * (0.92 + b * 0.12);

  const blob = new THREE.Mesh(new THREE.CircleGeometry(0.5, 24), blobMaterial());
  blob.rotation.x = -Math.PI / 2; blob.position.y = 0.015; blob.renderOrder = 2;
  root.add(blob);
  const tagAnchor = new THREE.Object3D(); tagAnchor.position.y = 2.05; root.add(tagAnchor);

  const B = ch.bones;
  const hands = [['upperarm_l', 'lowerarm_l', 'hand_l'], ['upperarm_r', 'lowerarm_r', 'hand_r']].map((n) => n.map((k) => B[k]));
  let mode = null;
  const want = (clip, o) => { if (mode !== clip) { mode = clip; ch.play(clip, o); } };

  return {
    root, hop, tilt, sack, ch, blob, tagAnchor,
    setFace() {},
    // racer.js her karede çağırır
    pose(r, dt) {
      if (r.state === 'finished') want('Dance_Loop', { fade: 0.3 });
      else if (r.state === 'fallen') want('Hit_Chest', { loop: false, fade: 0.1 });
      else if (r.state === 'air') want('Jump_Loop', { fade: 0.12, speed: 1.2 });
      else if (r.started) want('Idle_Loop', { fade: 0.18, speed: 1.4 });
      else want(r.idleClip || 'Idle_Loop', { fade: 0.4 });
      ch.update(dt);
      // bacaklar çuvalın içinde: dinlenme pozu, hafif diz kırımı
      // çuval beline çekilene kadar bacaklar görünür, sonra çuvalın içinde kalır (çizilmez)
      const inSack = (r.sackRise ?? 1) > 0.9;
      if (inSack !== this._inSack) { this._inSack = inSack; ch.showLegs(!inSack); }
      for (const n of LEG_BONES) B[n].quaternion.copy(ch.rest[n]);
      // zıplama animasyonu leğeni indirir; çuvalın içinde gövde boyu sabit kalmalı
      B.pelvis.position.copy(ch.restPos.pelvis);
      ch.root.updateMatrixWorld(true);
      // gövdeyi ileri eğ (havada daha çok)
      _ax.set(1, 0, 0).applyQuaternion(root.getWorldQuaternion(_qw));
      rotateWorld(B.spine_01, _ax, -r.lean * 0.9);
      ch.root.updateMatrixWorld(true);
      if (r.state === 'finished' || r.state === 'fallen') return;
      // eller çuvalın ağzını kavrar (çuval ağzı zıplarken yukarı çekilir)
      const rimY = 1.0 * sack.scale.y * (r.sackRise ?? 1) - 0.02;
      const pull = r.state === 'air' ? Math.sin(Math.min(1, r.t / r.airTime) * Math.PI) * 0.05 : 0;
      for (const [up, lo, ha] of hands) {
        ha.getWorldPosition(_p);
        tilt.worldToLocal(_p);
        const side = Math.sign(_p.x) || 1;
        _t.set(side * rimR * 0.94 + Math.sin(r.t * 9 + side) * r.wobble * 0.04, rimY + pull, -0.03);
        tilt.localToWorld(_t);
        const pole = tilt.localToWorld(new THREE.Vector3(side * 0.9, 1.05, 0.5));
        solveArmIK(up, lo, ha, _t, pole);
      }
    },
  };
}
