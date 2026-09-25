import * as THREE from 'three';

// Meshy'nin rigging servisi yalnızca insansı karakterleri desteklediği için
// yatay uçan kuşun kanat iskeletini burada kuruyoruz:
//  1. Geometri analiz edilip kanatların gövdeden ayrıldığı omuz noktası bulunur
//     (gövde kalın, kanat ince olduğu için dikey kalınlığın düştüğü yer).
//  2. Her kanada omuzda bir "kanat", ortasında bir "uç" kemiği eklenir.
//  3. Köşe ağırlıkları omuz ve kanat ortasında yumuşak geçişle hesaplanır.
//  4. Kanat çırpma, düşme ve dinlenme klipleri kemik dönüşleriyle üretilir.
//
// Model ekseni (Meshy): +Z ileri (gaga), +Y yukarı, kanatlar ±X yönünde.

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function bakeGeometry(root) {
  root.updateMatrixWorld(true);
  let mesh = null;
  root.traverse((o) => {
    if (!mesh && o.isMesh) mesh = o;
  });
  const geo = mesh.geometry.clone();
  geo.applyMatrix4(mesh.matrixWorld);
  // İç içe (interleaved) öznitelikleri düz dizilere çevir; skin öznitelikleri
  // eklenecek ve konumlar yeniden yazılacak.
  const flat = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(geo.attributes)) {
    const arr = new Float32Array(attr.count * attr.itemSize);
    for (let i = 0; i < attr.count; i++) {
      for (let c = 0; c < attr.itemSize; c++) arr[i * attr.itemSize + c] = attr.getComponent(i, c);
    }
    flat.setAttribute(name, new THREE.BufferAttribute(arr, attr.itemSize));
  }
  if (geo.index) flat.setIndex(new THREE.BufferAttribute(geo.index.array.slice(), 1));
  return { geo: flat, material: mesh.material };
}

// |x| dilimlerinde dikey kalınlığı ölçerek omuz konumunu bulur.
function findShoulder(pos, halfSpan) {
  const BINS = 48;
  const minY = new Float32Array(BINS).fill(Infinity);
  const maxY = new Float32Array(BINS).fill(-Infinity);
  for (let i = 0; i < pos.count; i++) {
    const b = Math.min(BINS - 1, Math.floor((Math.abs(pos.getX(i)) / halfSpan) * BINS));
    minY[b] = Math.min(minY[b], pos.getY(i));
    maxY[b] = Math.max(maxY[b], pos.getY(i));
  }
  const thick = Array.from(minY, (m, b) => (maxY[b] > m ? maxY[b] - m : 0));
  let peak = 0;
  for (let b = 1; b < BINS / 3; b++) if (thick[b] > thick[peak]) peak = b;
  for (let b = peak; b < BINS; b++) {
    if (thick[b] < thick[peak] * 0.45) return ((b + 0.5) / BINS) * halfSpan;
  }
  return halfSpan * 0.3;
}

function quatTrack(boneName, times, anglesZ) {
  const q = new THREE.Quaternion();
  const axis = new THREE.Vector3(0, 0, 1);
  const values = [];
  for (const a of anglesZ) values.push(...q.setFromAxisAngle(axis, a).toArray());
  return new THREE.QuaternionKeyframeTrack(`${boneName}.quaternion`, times, values);
}

// Sol kanat (+X) için açıyı alır, sağ kanada aynalar.
function wingClip(name, duration, samples, fn) {
  const times = [];
  const wing = [];
  const tip = [];
  for (let i = 0; i <= samples; i++) {
    const t = (i / samples) * duration;
    const [w, k] = fn(i / samples);
    times.push(t);
    wing.push(w);
    tip.push(k);
  }
  return new THREE.AnimationClip(name, duration, [
    quatTrack('wingL', times, wing),
    quatTrack('tipL', times, tip),
    quatTrack('wingR', times, wing.map((a) => -a)),
    quatTrack('tipR', times, tip.map((a) => -a)),
  ]);
}

const deg = THREE.MathUtils.degToRad;

function makeClips() {
  // Aşağı vuruş (güç) yukarı vuruştan hızlıdır: fazı 0.42'de kırıyoruz.
  const warp = (t) => (t < 0.42 ? (t / 0.42) * 0.5 : 0.5 + ((t - 0.42) / 0.58) * 0.5);
  const flap = wingClip('flap', 1, 24, (t) => {
    const p = warp(t) * Math.PI * 2;
    const wing = deg(8) + deg(48) * Math.cos(p);
    const tip = deg(6) + deg(26) * Math.cos(p - 0.9); // uç kanat geriden gelir (kamçı etkisi)
    return [wing, tip];
  });
  const fall = wingClip('fall', 0.5, 16, (t) => {
    const p = t * Math.PI * 2;
    return [deg(58) + deg(22) * Math.sin(p * 2), deg(18) + deg(30) * Math.sin(p * 2 + 1.3)];
  });
  const rest = wingClip('rest', 1, 2, () => [deg(-12), deg(-18)]);
  return { flap, fall, rest };
}

export function rigBird(gltf, length) {
  const { geo, material } = bakeGeometry(gltf.scene);
  const pos = geo.attributes.position;

  // Ölçek: gagadan kuyruğa `length` birim.
  geo.computeBoundingBox();
  const bb0 = geo.boundingBox.clone();
  const s = length / (bb0.max.z - bb0.min.z);
  geo.translate(-(bb0.min.x + bb0.max.x) / 2, 0, 0);
  geo.scale(s, s, s);

  geo.computeBoundingBox();
  const halfSpan = Math.max(-geo.boundingBox.min.x, geo.boundingBox.max.x);
  const shoulderX = findShoulder(pos, halfSpan);

  // Gövdenin merkezini (kanatlar hariç) orijine taşı.
  const body = new THREE.Box3();
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    if (Math.abs(v.x) < shoulderX) body.expandByPoint(v);
  }
  const center = body.getCenter(new THREE.Vector3());
  geo.translate(0, -center.y, -center.z);
  const bodySize = body.getSize(new THREE.Vector3());

  // Omuz ekseni: kanat kökündeki köşelerin ortalama yüksekliği ve derinliği.
  let py = 0;
  let pz = 0;
  let n = 0;
  for (let i = 0; i < pos.count; i++) {
    const ax = Math.abs(pos.getX(i));
    if (ax > shoulderX && ax < shoulderX + halfSpan * 0.12) {
      py += pos.getY(i);
      pz += pos.getZ(i);
      n++;
    }
  }
  py = n ? py / n : 0;
  pz = n ? pz / n : 0;
  const tipX = shoulderX + (halfSpan - shoulderX) * 0.45;

  // Kemikler
  const root = new THREE.Bone();
  root.name = 'root';
  const bones = [root];
  const sides = [
    ['L', 1],
    ['R', -1],
  ];
  for (const [side, sign] of sides) {
    const wing = new THREE.Bone();
    wing.name = `wing${side}`;
    wing.position.set(sign * shoulderX, py, pz);
    const tip = new THREE.Bone();
    tip.name = `tip${side}`;
    tip.position.set(sign * (tipX - shoulderX), 0, 0);
    root.add(wing);
    wing.add(tip);
    bones.push(wing, tip);
  }

  // Ağırlıklar: 0 root, 1 wingL, 2 tipL, 3 wingR, 4 tipR
  const skinIndex = new Uint16Array(pos.count * 4);
  const skinWeight = new Float32Array(pos.count * 4);
  const S = halfSpan;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const ax = Math.abs(x);
    let w = smoothstep(shoulderX - 0.05 * S, shoulderX + 0.07 * S, ax);
    // Omuz yakınında kanat hizasından uzak köşeler (göğüs, karın) gövdede kalsın.
    const dy = Math.abs(pos.getY(i) - py) / S;
    const nearBody = 1 - smoothstep(shoulderX + 0.1 * S, shoulderX + 0.25 * S, ax);
    w *= 1 - nearBody * smoothstep(0.1, 0.22, dy);
    const k = smoothstep(tipX - 0.09 * S, tipX + 0.09 * S, ax);
    const base = x >= 0 ? 1 : 3;
    skinIndex.set([0, base, base + 1, 0], i * 4);
    skinWeight.set([1 - w, w * (1 - k), w * k, 0], i * 4);
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
  geo.computeBoundingSphere();

  const mesh = new THREE.SkinnedMesh(geo, material);
  mesh.name = 'bird';
  mesh.frustumCulled = false;
  mesh.add(root);
  mesh.bind(new THREE.Skeleton(bones));

  return {
    mesh,
    clips: makeClips(),
    // Çarpışma için gövde ölçüleri (kanatlar hariç).
    bodyHeight: bodySize.y,
    bodyLength: bodySize.z,
  };
}
