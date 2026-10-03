// Halat çekme: filmdeki kır eğlencesinde Tellioğulları'nın kaybettiği tek oyun.
// Dörder delikanlı ipe asılır. Oyuncu Tellioğulları'nı yönetir: davulun "güm"üne denk dokunmak
// tam güç verir, vuruşu kaçırmak ya da üst üste basmak nefesi tüketir. Mükemmel çekişler
// "HEP BERABER!" göstergesini doldurur. Seferoğulları ara ara toplu asılır.
import * as THREE from 'three';
import { createCharacter, solveArmIK } from './avatars.js';

export const TUG = {
  z: -25,            // pistin ortası (iki çamur kuşağının arası)
  win: 1.6,          // kurdele bu çizgiyi geçince oyun biter
  bpm: 132,          // davul-zurna temposu; "güm" her 4 sekizlikte bir
  timeLimit: 40,
};
// Tellioğlu delikanlıları (Şaban filmdeki karakterdir; diğer adlar oyun için uyduruldu)
export const TUG_TEAMS = {
  telli: { name: 'TELLİOĞULLARI', men: ['Şaban', 'Cemil', 'Rıza', 'Hüsnü'], main: 0x8a1f1a, trim: 0xd9a441, sash: 0xd9a441, pants: 0x2a2320 },
  sefer: { name: 'SEFEROĞULLARI', men: ['Necati', 'Fikri', 'Halim', 'Nuri'], main: 0x1f3a5a, trim: 0xc9d1d9, sash: 0xc9d1d9, pants: 0x222630 },
};
const AI = [ // zorluk: güç, isabet, toplu asılma sıklığı (sn)
  { strength: 0.92, skill: 0.62, surge: [13, 18] },
  { strength: 1.08, skill: 0.8, surge: [10, 14] },
  { strength: 1.2, skill: 0.9, surge: [8, 11] },
];
const SPACING = 0.95, FIRST = 1.05, ROPE_Y = 0.9, K_IMP = 0.72;
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _ax = new THREE.Vector3();
const AX = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
const rotLocal = (bone, axis, a) => { _q.setFromAxisAngle(AX[axis], a); bone.quaternion.multiply(_q); };
// kemiği karakter kökünün eksenlerinde kaydır (ebeveyn çerçevesi ne olursa olsun)
const _m3 = new THREE.Matrix3(), _m4 = new THREE.Matrix4();
function offsetInRoot(root, bone, x, y, z) {
  _v.set(x, y, z).applyMatrix3(_m3.setFromMatrix4(root.matrixWorld));
  _v.applyMatrix3(_m3.setFromMatrix4(_m4.copy(bone.parent.matrixWorld).invert()));
  bone.position.add(_v);
}

// ---------- İp: kenetli lif dokulu, her karede yeniden kurulan tüp ----------
class Rope {
  constructor(scene, segs = 150, radial = 8) {
    this.segs = segs; this.radial = radial;
    const nv = (segs + 1) * (radial + 1);
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(nv * 3); this.nor = new Float32Array(nv * 3);
    const uv = new Float32Array(nv * 2), idx = [];
    for (let i = 0; i <= segs; i++) for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j; uv[k * 2] = i / segs; uv[k * 2 + 1] = j / radial;
      if (i < segs && j < radial) { const a = k, b = k + radial + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    }
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nor, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    const mat = new THREE.MeshStandardMaterial({ color: 0xc9a46a, roughness: 0.85 });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vRUv;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvRUv = uv;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vRUv;')
        .replace('#include <map_fragment>', `#include <map_fragment>
        { float tw = fract(vRUv.x * 420.0 + vRUv.y * 3.0); float strand = smoothstep(0.0, 0.18, tw) * (1.0 - smoothstep(0.82, 1.0, tw));
          diffuseColor.rgb *= 0.72 + 0.38 * strand; }`);
    };
    mat.customProgramCacheKey = () => 'tug-rope';
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.castShadow = true; this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }
  update(points, r = 0.019) {
    const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
    const P = curve.getSpacedPoints(this.segs);
    const T = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3();
    for (let i = 0; i <= this.segs; i++) {
      const a = P[Math.max(0, i - 1)], b = P[Math.min(this.segs, i + 1)];
      T.subVectors(b, a).normalize();
      N.crossVectors(T, AX.y); if (N.lengthSq() < 1e-4) N.set(0, 0, 1); N.normalize();
      B.crossVectors(N, T).normalize();
      for (let j = 0; j <= this.radial; j++) {
        const ang = (j / this.radial) * Math.PI * 2, c = Math.cos(ang), s = Math.sin(ang);
        const nx = N.x * c + B.x * s, ny = N.y * c + B.y * s, nz = N.z * c + B.z * s;
        const k = (i * (this.radial + 1) + j) * 3;
        this.pos[k] = P[i].x + nx * r; this.pos[k + 1] = P[i].y + ny * r; this.pos[k + 2] = P[i].z + nz * r;
        this.nor[k] = nx; this.nor[k + 1] = ny; this.nor[k + 2] = nz;
      }
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.normal.needsUpdate = true;
    return curve;
  }
}

export class TugOfWar {
  constructor(scene, quality) {
    this.scene = scene;
    this.group = new THREE.Group(); this.group.visible = false;
    scene.add(this.group);
    this.zc = TUG.z;
    // kireç çizgileri: orta ve iki kazanma çizgisi
    const chalk = new THREE.MeshStandardMaterial({ color: 0xf6f2e6, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 });
    for (const [x, w] of [[0, 0.09], [-TUG.win, 0.07], [TUG.win, 0.07]]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 2.4), chalk);
      m.rotation.x = -Math.PI / 2; m.position.set(x, 0.013, this.zc); m.receiveShadow = true;
      this.group.add(m);
    }
    // ortadaki kurdele
    const rib = new THREE.PlaneGeometry(0.07, 0.34, 1, 6); rib.translate(0, -0.17, 0);
    this.ribbon = new THREE.Mesh(rib, new THREE.MeshStandardMaterial({ color: 0xc0182a, roughness: 0.6, side: THREE.DoubleSide }));
    this.ribbon.castShadow = true;
    this.group.add(this.ribbon);
    this.rope = new Rope(this.group, quality === 'low' ? 90 : 150);
    // takımlar
    this.teams = {};
    for (const [key, side] of [['telli', -1], ['sefer', 1]]) {
      const T = TUG_TEAMS[key];
      const men = T.men.map((name, i) => {
        const ch = createCharacter({ sex: 'm', outfit: 'villager', pick: i, fez: true, sash: T.main });
        ch.play('Idle_Loop');
        this.group.add(ch.root);
        return { ch, name, i, phase: Math.random() * 6 };
      });
      this.teams[key] = { key, side, men, lean: 0.4, pulse: 0, fall: 0 };
    }
    this.reset(1);
  }

  setVisible(v) { this.group.visible = v; }

  reset(diff = 1) {
    this.ai = AI[diff];
    this.x = 0; this.vel = 0;
    this.time = 0; this.beat0 = 0; this.period = (4 * 30) / TUG.bpm;
    this.stamina = 1; this.combo = 0; this.power = 0; this.together = 0; // "HEP BERABER!" kalan vuruş
    this.lastPullBeat = -99; this.lastMissCheck = 0; this.aiBeat = -1;
    this.surge = 0; this.nextSurge = this.ai.surge[0] + Math.random() * (this.ai.surge[1] - this.ai.surge[0]);
    this.state = 'idle';     // idle | pull | end
    this.winner = null; this.endT = 0;
    this.lastJudge = null;
    this.form = 1; this.formT = 3;     // rakibin anlık formu: birkaç saniyede bir değişir
    for (const t of Object.values(this.teams)) { t.lean = 0.35; t.pulse = 0; t.fall = 0; }
    this.place(0);
  }

  // oyun başlar: ilk "güm" delay saniye sonra
  start(delay = 0.08) { this.state = 'pull'; this.beat0 = this.time + delay; }

  beatIndex(t = this.time) { return Math.round((t - this.beat0) / this.period); }
  beatPhase(t = this.time) { const u = (t - this.beat0) / this.period; return u - Math.floor(u); }

  // oyuncu dokundu: 'mukemmel' | 'iyi' | 'kacti' | 'telas' | null
  press() {
    if (this.state !== 'pull') return null;
    const u = (this.time - this.beat0) / this.period, bi = Math.round(u), off = Math.abs(u - bi) * this.period;
    let j;
    if (bi === this.lastPullBeat) { j = 'telas'; this.stamina = Math.max(0, this.stamina - 0.07); this.combo = 0; }
    else {
      this.lastPullBeat = bi;
      j = this.together > 0 ? 'mukemmel' : off <= 0.085 ? 'mukemmel' : off <= 0.17 ? 'iyi' : 'kacti';
      const q = j === 'mukemmel' ? 1 : j === 'iyi' ? 0.62 : 0.18;
      if (j === 'mukemmel') { this.combo = Math.min(8, this.combo + 1); this.power = Math.min(1, this.power + 0.13); } else if (j === 'kacti') this.combo = 0;
      const cost = this.together > 0 ? 0 : j === 'mukemmel' ? 0.035 : j === 'iyi' ? 0.05 : 0.08;
      this.stamina = Math.max(0, this.stamina - cost);
      const imp = q * (0.45 + 0.55 * this.stamina) * (1 + this.combo * 0.045) * (this.together > 0 ? 1.45 : 1);
      this.vel -= imp * K_IMP;                    // Tellioğulları solda: ip sola (−x) çekilir
      this.teams.telli.pulse = Math.min(1.2, 0.5 + q * 0.6);
    }
    this.lastJudge = j;
    return j;
  }

  activateTogether() {
    if (this.state !== 'pull' || this.power < 1 || this.together > 0) return false;
    this.together = 5; this.power = 0; this.stamina = Math.min(1, this.stamina + 0.25);
    return true;
  }

  update(dt, events) {
    this.time += dt;
    const telli = this.teams.telli, sefer = this.teams.sefer;
    if (this.state === 'pull') {
      // YZ her "güm"de asılır
      const bi = Math.floor((this.time - this.beat0) / this.period + 0.5);
      if (bi > this.aiBeat && this.time - this.beat0 >= bi * this.period - 0.02) {
        this.aiBeat = bi;
        if (bi >= 0) {
          const r = Math.random();
          const q = r < this.ai.skill ? 1 : r < this.ai.skill + (1 - this.ai.skill) * 0.7 ? 0.62 : 0.18;
          // önde olan YZ biraz gevşer, gerideyse hırslanır (lastik bant)
          const rubber = 1 + this.x * -0.06;
          const imp = q * this.ai.strength * this.form * rubber * (this.surge > 0 ? 1.5 : 1);
          this.vel += imp * K_IMP;
          sefer.pulse = Math.min(1.2, 0.5 + q * 0.6);
          if (this.surge > 0 && --this.surge === 0) events?.('surgeEnd');
          if (this.together > 0 && --this.together === 0) events?.('togetherEnd');
          // oyuncu bir önceki vuruşu kaçırdıysa kombo düşer
          if (bi - 1 > this.lastPullBeat && bi > 1) { if (this.combo > 0) events?.('missBeat'); this.combo = Math.max(0, this.combo - 2); }
          events?.('beat', bi);
        }
      }
      this.formT -= dt;
      if (this.formT <= 0) { this.formT = 2.5 + Math.random() * 3; this.form = 0.82 + Math.random() * 0.36; }
      // toplu asılma
      this.nextSurge -= dt;
      if (this.nextSurge <= 0 && this.surge === 0) {
        this.surge = 4; this.nextSurge = this.ai.surge[0] + Math.random() * (this.ai.surge[1] - this.ai.surge[0]);
        events?.('surge');
      }
      this.stamina = Math.min(1, this.stamina + dt * 0.11);
      this.vel *= Math.exp(-dt * 2.4);
      this.x += this.vel * dt;
      if (this.x <= -TUG.win) this.finish('telli', events);
      else if (this.x >= TUG.win) this.finish('sefer', events);
      else if (this.time - this.beat0 > TUG.timeLimit) this.finish(this.x <= 0 ? 'telli' : 'sefer', events);
    } else if (this.state === 'end') {
      this.endT += dt;
      // kazananlar ipi kendine çeker, kaybedenler sürüklenir
      const dir = this.winner === 'telli' ? -1 : 1;
      this.vel = dir * Math.max(0, 1.2 - this.endT * 0.8);
      this.x += this.vel * dt;
    }
    for (const t of [telli, sefer]) {
      t.pulse = Math.max(0, t.pulse - dt * 3.2);
      const base = this.state === 'idle' ? 0.25 : 0.42;
      t.lean += (base + t.pulse * 0.35 - t.lean) * Math.min(1, dt * 10);
    }
    this.place(dt);
  }

  finish(winner, events) {
    this.state = 'end'; this.winner = winner; this.endT = 0;
    events?.('end', winner);
  }

  // karakter pozları, ip ve kurdele
  place(dt) {
    const pts = [];
    for (const t of [this.teams.telli, this.teams.sefer]) {
      const f = -t.side; // bakış yönü: soldakiler +x'e bakar
      const lost = this.state === 'end' && this.winner !== t.key, won = this.state === 'end' && this.winner === t.key;
      for (const m of t.men) {
        const { ch } = m, B = ch.bones;
        const bx = t.side * (FIRST + m.i * SPACING) + this.x;
        // kaybedenler öne tökezler, kazananlar geriye oturur
        let fall = 0;
        if (this.state === 'end') fall = Math.min(1, Math.max(0, (this.endT - 0.25 - m.i * 0.08) / 0.5));
        ch.root.position.set(bx, 0, this.zc - 0.2);
        // gövde ipe doğru biraz döner (ip sağda/solda)
        ch.root.rotation.set(0, (f > 0 ? Math.PI / 2 : -Math.PI / 2) + (t.side < 0 ? -0.3 : 0.3), 0);
        ch.face(this.state === 'end' ? (won ? 'joy' : 'shock') : t.pulse > 0.3 ? 'strain' : 'neutral');
        // kazananlar ipi bırakıp sevinir
        if (won && fall >= 1) {
          if (m.clip !== 'Cheer') { m.clip = 'Cheer'; ch.play('Cheer', { fade: 0.25 }); }
          ch.update(dt);
          continue;
        }
        if (m.clip) { m.clip = null; ch.play('Idle_Loop', { fade: 0.1 }); }
        ch.update(dt);
        const lean = lost ? t.lean * (1 - fall) : t.lean;
        // leğen: çömel ve geri otur (karakter uzayında: -z geri), biped eksenlerinden bağımsız
        B.pelvis.position.copy(ch.restPos.pelvis);
        ch.root.updateMatrixWorld(true);
        offsetInRoot(ch.root, B.pelvis, 0, -(0.12 + lean * 0.06 - (lost ? fall * 0.05 : 0)), -(0.06 + lean * 0.12 - (lost ? fall * 0.12 : 0)));
        // biped omurgası: yerel z yan eksen (+ öne eğer)
        rotLocal(B.spine_01, 'z', -lean * 0.62 + (lost ? fall * 0.75 : 0));
        rotLocal(B.spine_02, 'z', -lean * 0.12);
        rotLocal(B.spine_03, 'z', 0.1);
        rotLocal(B.Head, 'z', 0.22 + lean * 0.25 - (lost ? fall * 0.3 : 0));
        ch.root.updateMatrixWorld(true);
        // ayaklar yere: öndeki ayak ileride, arkadaki geride (bacak IK)
        const step = Math.sin(this.time * 2 + m.phase) * 0.03;
        for (const [sd, fz, fx] of [['l', 0.3 + step, 0.13], ['r', -0.34 - step, -0.13]]) {
          const tgt = ch.root.localToWorld(_v.set(fx, 0.085, fz + (lost ? fall * 0.25 : 0)));
          tgt.y = Math.max(0.085, tgt.y);
          const pole = ch.root.localToWorld(_w.set(fx * 1.5, 0.5, fz + 0.8));
          solveArmIK(B[`thigh_${sd}`], B[`calf_${sd}`], B[`foot_${sd}`], tgt, pole);
        }
        // eller ipte: ipe yakın el kalça hizasında, uzaktaki öne uzanır
        const ry = ROPE_Y - lean * 0.08 - (lost ? fall * 0.15 : 0);
        const near = t.side < 0 ? 'r' : 'l', far = near === 'r' ? 'l' : 'r';
        const front = new THREE.Vector3(bx + f * 0.42, ry, this.zc), back = new THREE.Vector3(bx + f * 0.1, ry - 0.03, this.zc);
        for (const [sd, tgt] of [[far, front], [near, back]]) {
          const pole = _w.set(tgt.x - f * 0.3, tgt.y - 0.6, this.zc - 0.6);
          solveArmIK(B[`upperarm_${sd}`], B[`lowerarm_${sd}`], B[`hand_${sd}`], tgt, pole.clone());
        }
        m.front = front; m.back = back;
      }
    }
    // ip: soldaki kuyruk yerden yükselir, ellerden geçer, ortada gerginliğe göre sarkar
    const L = this.teams.telli.men, R = this.teams.sefer.men;
    const tension = Math.min(1, 0.55 + (this.teams.telli.pulse + this.teams.sefer.pulse) * 0.35);
    const lastL = L[L.length - 1], lastR = R[R.length - 1];
    pts.push(new THREE.Vector3(lastL.back.x - 1.5, 0.03, this.zc + 0.12), new THREE.Vector3(lastL.back.x - 0.9, 0.05, this.zc + 0.06), new THREE.Vector3(lastL.back.x - 0.35, 0.5, this.zc));
    for (let i = L.length - 1; i >= 0; i--) pts.push(L[i].back.clone(), L[i].front.clone());
    const cx = this.x, cy = ROPE_Y - 0.05 - (1 - tension) * 0.14;
    pts.push(new THREE.Vector3(cx, cy, this.zc));
    for (let i = 0; i < R.length; i++) pts.push(R[i].front.clone(), R[i].back.clone());
    pts.push(new THREE.Vector3(lastR.back.x + 0.35, 0.5, this.zc), new THREE.Vector3(lastR.back.x + 0.9, 0.05, this.zc + 0.06), new THREE.Vector3(lastR.back.x + 1.5, 0.03, this.zc + 0.12));
    this.rope.update(pts);
    this.ribbon.position.set(cx, cy - 0.01, this.zc);
    this.ribbon.rotation.set(Math.sin(this.time * 7) * 0.12, 0, Math.sin(this.time * 4.3) * 0.18 - this.vel * 0.25);
  }
}
