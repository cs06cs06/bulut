// Meshy modeli henüz üretilmemiş varlıklar için prosedürel low-poly modeller.
// Hepsi +Z yönüne (kameraya) bakar; ölçekleme assets.js içinde manifest'teki 'fit' ile yapılır.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const materialCache = new Map();

function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!materialCache.has(key)) {
    materialCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.65, metalness: 0, ...opts }));
  }
  return materialCache.get(key);
}

function mesh(geo, material, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(...pos);
  m.rotation.set(...rot);
  m.scale.set(...scale);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function group(name, ...children) {
  const g = new THREE.Group();
  if (name) g.name = name;
  for (const c of children) g.add(c);
  return g;
}

// Tekrarlanabilir rastgelelik (dokular her açılışta aynı görünsün)
function rng(seed) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

function canvasTexture(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function cloudPath(ctx, cx, cy, r) {
  ctx.beginPath();
  ctx.arc(cx - r * 0.9, cy + r * 0.2, r * 0.6, 0, Math.PI * 2);
  ctx.arc(cx, cy - r * 0.15, r * 0.8, 0, Math.PI * 2);
  ctx.arc(cx + r * 0.9, cy + r * 0.2, r * 0.6, 0, Math.PI * 2);
  ctx.rect(cx - r * 0.9, cy + r * 0.2, r * 1.8, r * 0.6);
}

function rivets(ctx, s, color) {
  const d = s * 0.14;
  for (const [x, y] of [
    [d, d],
    [s - d, d],
    [d, s - d],
    [s - d, s - d],
  ]) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.arc(x + 1.5, y + 1.5, s * 0.045, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, s * 0.045, 0, Math.PI * 2);
    ctx.fill();
  }
}

function bevelFrame(ctx, s, light, dark, w) {
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, s, w);
  ctx.fillRect(0, 0, w, s);
  ctx.fillStyle = dark;
  ctx.fillRect(0, s - w, s, w);
  ctx.fillRect(s - w, 0, w, s);
}

const DRAW = {
  dirt(ctx, s) {
    ctx.fillStyle = '#9A6234';
    ctx.fillRect(0, 0, s, s);
    const r = rng(7);
    for (let i = 0; i < 26; i++) {
      ctx.fillStyle = r() > 0.5 ? '#7E4C27' : '#B47A47';
      ctx.beginPath();
      ctx.ellipse(r() * s, r() * s, 3 + r() * 5, 2 + r() * 3, r() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  },
  grassSide(ctx, s) {
    DRAW.dirt(ctx, s);
    ctx.fillStyle = '#4FAE3C';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(s, 0);
    for (let x = s; x >= 0; x -= s / 8) ctx.lineTo(x, s * 0.26 + ((x / (s / 8)) % 2 ? 7 : -3));
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#6FCB55';
    ctx.fillRect(0, 0, s, s * 0.07);
  },
  grassTop(ctx, s) {
    ctx.fillStyle = '#5DBB46';
    ctx.fillRect(0, 0, s, s);
    const r = rng(3);
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = r() > 0.5 ? '#6FCB55' : '#4FAE3C';
      ctx.fillRect(r() * s, r() * s, 3, 6);
    }
  },
  brick(ctx, s) {
    ctx.fillStyle = '#F1C79B';
    ctx.fillRect(0, 0, s, s);
    const rows = 4;
    const bh = s / rows;
    for (let row = 0; row < rows; row++) {
      const off = row % 2 ? s / 4 : 0;
      for (let x = -s / 2 + off; x < s; x += s / 2) {
        ctx.fillStyle = '#C8553D';
        ctx.fillRect(x + 3, row * bh + 3, s / 2 - 6, bh - 6);
        ctx.fillStyle = '#DD6A4C';
        ctx.fillRect(x + 3, row * bh + 3, s / 2 - 6, 4);
      }
    }
  },
  mystery(ctx, s) {
    ctx.fillStyle = '#FFC83D';
    ctx.fillRect(0, 0, s, s);
    bevelFrame(ctx, s, '#FFE08A', '#D9961F', 8);
    rivets(ctx, s, '#FFF1C2');
    ctx.fillStyle = '#1F2A44';
    cloudPath(ctx, s / 2 + 3, s / 2 + 3, s * 0.2);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    cloudPath(ctx, s / 2, s / 2, s * 0.2);
    ctx.fill();
  },
  used(ctx, s) {
    ctx.fillStyle = '#9C6B3F';
    ctx.fillRect(0, 0, s, s);
    bevelFrame(ctx, s, '#B5845A', '#6E4526', 8);
    rivets(ctx, s, '#C9A27E');
  },
  stone(ctx, s) {
    ctx.fillStyle = '#A7AFBA';
    ctx.fillRect(0, 0, s, s);
    bevelFrame(ctx, s, '#CDD3DB', '#7A838F', 10);
    ctx.strokeStyle = '#8B94A0';
    ctx.lineWidth = 3;
    ctx.strokeRect(s * 0.25, s * 0.25, s * 0.5, s * 0.5);
  },
  bee(ctx, s) {
    ctx.fillStyle = '#FFD23F';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#2A2238';
    for (const [a, b] of [
      [0.42, 0.52],
      [0.62, 0.72],
      [0.86, 1],
    ])
      ctx.fillRect(0, a * s, s, (b - a) * s);
  },
};

const textures = {};
function tex(name) {
  if (!textures[name]) textures[name] = canvasTexture(128, DRAW[name]);
  return textures[name];
}

function texMat(name, opts = {}) {
  const key = 'tex:' + name + JSON.stringify(opts);
  if (!materialCache.has(key)) {
    materialCache.set(key, new THREE.MeshStandardMaterial({ map: tex(name), roughness: 0.8, ...opts }));
  }
  return materialCache.get(key);
}

// ---------- Karakterler ----------

function player() {
  const hood = mat('#3E8EDE');
  const skin = mat('#FFD2B0');
  const pants = mat('#2B3A67');
  const boot = mat('#7A4A26');
  const white = mat('#FFFFFF');
  const ink = mat('#1F2A44', { roughness: 0.3 });
  const red = mat('#E4483B');
  const cheek = mat('#FF9A9A');

  const legs = [];
  for (const side of [-1, 1]) {
    const leg = group(
      side < 0 ? 'legL' : 'legR',
      mesh(new THREE.CapsuleGeometry(0.075, 0.14, 4, 10), pants, [0, -0.13, 0]),
      mesh(new RoundedBoxGeometry(0.17, 0.11, 0.24, 2, 0.04), boot, [0, -0.29, 0.03]),
    );
    leg.position.set(side * 0.1, 0.35, 0);
    legs.push(leg);
  }

  const arms = [];
  for (const side of [-1, 1]) {
    const arm = group(
      side < 0 ? 'armL' : 'armR',
      mesh(new THREE.CapsuleGeometry(0.06, 0.13, 4, 10), hood, [0, -0.1, 0]),
      mesh(new THREE.SphereGeometry(0.065, 12, 10), skin, [0, -0.22, 0]),
    );
    arm.position.set(side * 0.2, 0.58, 0);
    arm.rotation.z = side * 0.25;
    arms.push(arm);
  }

  const earPuffs = [];
  for (const side of [-1, 1]) {
    earPuffs.push(
      mesh(new THREE.SphereGeometry(0.075, 12, 10), white, [side * 0.14, 1.05, -0.02]),
      mesh(new THREE.SphereGeometry(0.055, 12, 10), white, [side * 0.21, 1.01, -0.02]),
      mesh(new THREE.SphereGeometry(0.05, 12, 10), white, [side * 0.09, 1.0, 0.01]),
    );
  }

  const face = [];
  for (const side of [-1, 1]) {
    face.push(
      mesh(new THREE.CapsuleGeometry(0.028, 0.04, 4, 8), ink, [side * 0.085, 0.82, 0.275]),
      mesh(new THREE.SphereGeometry(0.011, 8, 6), white, [side * 0.085 + 0.01, 0.84, 0.3]),
      mesh(new THREE.SphereGeometry(0.035, 10, 8), cheek, [side * 0.15, 0.74, 0.25], [0, 0, 0], [1, 0.6, 0.4]),
    );
  }

  const upper = group(
    'upper',
    mesh(new THREE.CapsuleGeometry(0.17, 0.12, 6, 14), hood, [0, 0.47, 0]),
    mesh(new THREE.TorusGeometry(0.15, 0.05, 8, 20), red, [0, 0.63, 0], [Math.PI / 2, 0, 0]),
    mesh(new RoundedBoxGeometry(0.08, 0.18, 0.05, 2, 0.02), red, [0.09, 0.53, -0.16], [0.3, 0, 0.2]),
    mesh(new THREE.SphereGeometry(0.285, 20, 16), hood, [0, 0.82, -0.04]),
    mesh(new THREE.SphereGeometry(0.235, 20, 16), skin, [0, 0.8, 0.06]),
    ...earPuffs,
    ...face,
    ...arms,
  );
  return group('player', ...legs, upper);
}

function kestane() {
  const shell = mat('#8B4A2B', { roughness: 0.35 });
  const pale = mat('#E2B07A');
  const white = mat('#FFFFFF');
  const ink = mat('#231710', { roughness: 0.3 });
  const eyes = [];
  for (const side of [-1, 1]) {
    eyes.push(
      mesh(new THREE.SphereGeometry(0.1, 14, 10), white, [side * 0.13, 0.47, 0.31], [0, 0, 0], [1, 1.15, 0.6]),
      mesh(new THREE.SphereGeometry(0.05, 10, 8), ink, [side * 0.11, 0.45, 0.37]),
      mesh(new THREE.BoxGeometry(0.16, 0.04, 0.05), ink, [side * 0.13, 0.61, 0.34], [0, 0, side * 0.42]),
    );
  }
  const feet = [-1, 1].map((side) =>
    group(side < 0 ? 'footL' : 'footR', mesh(new THREE.SphereGeometry(0.12, 12, 8), ink, [0, 0, 0.04], [0, 0, 0], [1, 0.6, 1.4])),
  );
  feet[0].position.set(-0.18, 0.07, 0);
  feet[1].position.set(0.18, 0.07, 0);
  const body = group(
    'body',
    mesh(new THREE.SphereGeometry(0.4, 22, 16), shell, [0, 0.45, 0], [0, 0, 0], [1, 0.88, 0.95]),
    mesh(new THREE.SphereGeometry(0.37, 20, 12), pale, [0, 0.27, 0.02], [0, 0, 0], [1, 0.42, 0.95]),
    mesh(new THREE.ConeGeometry(0.08, 0.17, 10), pale, [0, 0.85, 0]),
    ...eyes,
  );
  return group('kestane', body, ...feet);
}

function kirpi() {
  const fur = mat('#C99A6B');
  const spike = mat('#5B3A24', { roughness: 0.5 });
  const snout = mat('#EBC7A2');
  const ink = mat('#1A1410', { roughness: 0.3 });
  const spikes = [];
  const cone = new THREE.ConeGeometry(0.06, 0.26, 6);
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < 9; i++) {
    for (let j = 0; j < 7; j++) {
      const theta = -Math.PI * 0.95 + (i / 8) * Math.PI * 1.25; // ön yüzü boş bırak
      const phi = 0.15 + (j / 6) * 1.35;
      const n = new THREE.Vector3(Math.sin(phi) * Math.sin(theta), Math.cos(phi), Math.sin(phi) * Math.cos(theta));
      if (n.z > 0.45) continue;
      const p = new THREE.Vector3(n.x * 0.34, 0.36 + n.y * 0.3, n.z * 0.44);
      const s = mesh(cone, spike, [p.x, p.y, p.z]);
      s.quaternion.setFromUnitVectors(
        up,
        n
          .clone()
          .multiply(new THREE.Vector3(1, 0.9, 1))
          .normalize(),
      );
      spikes.push(s);
    }
  }
  const legs = [];
  for (const [x, z] of [
    [-0.18, 0.2],
    [0.18, 0.2],
    [-0.18, -0.2],
    [0.18, -0.2],
  ]) {
    legs.push(mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.12, 8), ink, [x, 0.06, z]));
  }
  const body = group(
    'body',
    mesh(new THREE.SphereGeometry(0.4, 22, 16), fur, [0, 0.36, 0], [0, 0, 0], [0.85, 0.75, 1.1]),
    mesh(new THREE.ConeGeometry(0.13, 0.3, 14), snout, [0, 0.3, 0.5], [Math.PI / 2, 0, 0]),
    mesh(new THREE.SphereGeometry(0.05, 10, 8), ink, [0, 0.3, 0.66]),
    mesh(new THREE.SphereGeometry(0.04, 10, 8), ink, [-0.13, 0.42, 0.38]),
    mesh(new THREE.SphereGeometry(0.04, 10, 8), ink, [0.13, 0.42, 0.38]),
    ...spikes,
  );
  return group('kirpi', body, ...legs);
}

function ari() {
  const yellow = mat('#FFD23F');
  const ink = mat('#2A2238', { roughness: 0.4 });
  const white = mat('#FFFFFF');
  const wing = new THREE.MeshStandardMaterial({
    color: '#EAF6FF',
    transparent: true,
    opacity: 0.7,
    side: THREE.DoubleSide,
    roughness: 0.2,
  });
  const striped = new THREE.MeshStandardMaterial({ map: tex('bee'), roughness: 0.55 });
  const wings = [-1, 1].map((side) => {
    const w = group(
      side < 0 ? 'wingL' : 'wingR',
      mesh(new THREE.CircleGeometry(0.2, 16), wing, [side * 0.16, 0.12, 0], [0, 0, 0], [1, 0.6, 1]),
    );
    w.position.set(side * 0.08, 0.66, -0.05);
    w.rotation.set(-0.3, 0, side * 0.35);
    return w;
  });
  const face = [];
  for (const side of [-1, 1]) {
    face.push(
      mesh(new THREE.SphereGeometry(0.065, 12, 10), ink, [side * 0.09, 0.5, 0.45]),
      mesh(new THREE.SphereGeometry(0.02, 8, 6), white, [side * 0.09 + 0.02, 0.53, 0.5]),
      mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.2, 5), ink, [side * 0.07, 0.72, 0.36], [0.5, 0, side * -0.3]),
      mesh(new THREE.SphereGeometry(0.03, 8, 6), ink, [side * 0.1, 0.81, 0.42]),
    );
  }
  const body = group(
    'body',
    mesh(new THREE.SphereGeometry(0.32, 22, 16), striped, [0, 0.4, -0.05], [Math.PI / 2, 0, 0], [1, 1.25, 0.9]),
    mesh(new THREE.SphereGeometry(0.21, 18, 14), yellow, [0, 0.47, 0.3]),
    mesh(new THREE.ConeGeometry(0.05, 0.14, 8), ink, [0, 0.36, -0.47], [-Math.PI / 2, 0, 0]),
    ...face,
    ...wings,
  );
  return group('ari', body);
}

// ---------- Eşyalar ----------

function coin() {
  const gold = mat('#FFC83D', { metalness: 0.45, roughness: 0.3, emissive: '#8A5A00', emissiveIntensity: 0.5 });
  const light = mat('#FFE38A', { metalness: 0.4, roughness: 0.3, emissive: '#8A6A00', emissiveIntensity: 0.5 });
  const puffs = [];
  for (const z of [-0.055, 0.055]) {
    for (const [x, y, r] of [
      [-0.12, -0.02, 0.08],
      [0, 0.04, 0.11],
      [0.12, -0.02, 0.08],
    ]) {
      puffs.push(mesh(new THREE.SphereGeometry(r, 12, 8), light, [x, y, z], [0, 0, 0], [1, 1, 0.3]));
    }
  }
  return group(
    'coin',
    mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.09, 28), gold, [0, 0, 0], [Math.PI / 2, 0, 0]),
    mesh(new THREE.TorusGeometry(0.37, 0.04, 8, 28), light),
    ...puffs,
  );
}

function simit() {
  const crust = mat('#C77A36', { roughness: 0.45 });
  const sesame = mat('#F6E6BC', { roughness: 0.6 });
  const seedGeo = new THREE.SphereGeometry(0.02, 6, 4);
  seedGeo.scale(1.4, 0.7, 0.7);
  const seeds = [];
  const r = rng(11);
  const R = 0.27;
  const tube = 0.11;
  for (let i = 0; i < 110; i++) {
    const u = r() * Math.PI * 2;
    const v = (r() - 0.5) * Math.PI * 1.6; // ön-arka yüzeyler
    const cx = Math.cos(u) * (R + tube * Math.cos(v));
    const cy = Math.sin(u) * (R + tube * Math.cos(v));
    const cz = tube * Math.sin(v);
    const g = seedGeo.clone();
    g.rotateZ(u + r());
    g.translate(cx * 1.02, cy * 1.02, cz * 1.08);
    seeds.push(g);
  }
  const seedMesh = mesh(mergeGeometries(seeds), sesame);
  return group('simit', mesh(new THREE.TorusGeometry(R, tube, 14, 32), crust), seedMesh);
}

function nazar() {
  const glass = (c) => mat(c, { roughness: 0.12, metalness: 0.05 });
  const disc = (r, d, z, c) => mesh(new THREE.CylinderGeometry(r, r, d, 32), glass(c), [0, 0, z], [Math.PI / 2, 0, 0]);
  return group(
    'nazar',
    disc(0.4, 0.12, 0, '#1446A0'),
    disc(0.29, 0.12, 0.018, '#FFFFFF'),
    disc(0.2, 0.12, 0.034, '#6EC1F0'),
    disc(0.1, 0.12, 0.05, '#101418'),
    mesh(new THREE.SphereGeometry(0.035, 10, 8), mat('#FFFFFF', { emissive: '#FFFFFF', emissiveIntensity: 0.6 }), [0.1, 0.12, 0.11]),
    mesh(new THREE.TorusGeometry(0.06, 0.018, 8, 16), mat('#D9B45A', { metalness: 0.8, roughness: 0.3 }), [0, 0.44, 0]),
  );
}

// ---------- Bloklar ----------

function groundTop() {
  const side = texMat('grassSide');
  const top = texMat('grassTop');
  const bottom = texMat('dirt');
  return group('ground_top', mesh(new THREE.BoxGeometry(1, 1, 1), [side, side, top, bottom, side, side]));
}

function groundFill() {
  return group('ground_fill', mesh(new THREE.BoxGeometry(1, 1, 1), texMat('dirt')));
}

function roundedBlock(name, texture, opts) {
  return group(name, mesh(new RoundedBoxGeometry(1, 1, 1, 3, 0.07), texMat(texture, opts)));
}

function cloudPlatform() {
  const white = mat('#FFFFFF', { roughness: 0.9, emissive: '#DDE8F5', emissiveIntensity: 0.25 });
  const s = new THREE.SphereGeometry(0.3, 14, 10);
  return group(
    'cloud_platform',
    mesh(s, white, [-0.3, 0, 0], [0, 0, 0], [1.1, 0.7, 1.3]),
    mesh(s, white, [0.05, 0.03, 0.1], [0, 0, 0], [1.2, 0.8, 1.3]),
    mesh(s, white, [0.35, 0, -0.05], [0, 0, 0], [1.1, 0.7, 1.3]),
    mesh(new THREE.CylinderGeometry(0.5, 0.45, 0.1, 18), white, [0, 0.13, 0], [0, 0, 0], [1.05, 1, 1.3]),
  );
}

// ---------- Dekor ----------

function flag() {
  const pole = mat('#EEF3F8', { metalness: 0.3, roughness: 0.35 });
  const gold = mat('#FFC83D', { metalness: 0.7, roughness: 0.3 });
  const cloth = new THREE.MeshStandardMaterial({ color: '#FFFFFF', side: THREE.DoubleSide, roughness: 0.8 });
  const blue = new THREE.MeshStandardMaterial({ color: '#3E8EDE', side: THREE.DoubleSide, roughness: 0.8 });
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(-1.4, -0.45);
  shape.lineTo(0, -0.9);
  shape.closePath();
  const emblem = new THREE.Shape();
  emblem.absarc(-0.45, -0.45, 0.16, 0, Math.PI * 2);
  const flagGroup = group(
    'flag',
    mesh(new THREE.ShapeGeometry(shape), cloth),
    mesh(new THREE.ShapeGeometry(emblem), blue, [0, 0, 0.01]),
    mesh(new THREE.ShapeGeometry(emblem), blue, [0, 0, -0.01]),
  );
  flagGroup.position.set(-0.06, 7.75, 0);
  return group(
    'flagpole',
    mesh(new THREE.CylinderGeometry(0.06, 0.06, 8, 12), pole, [0, 4, 0]),
    mesh(new THREE.SphereGeometry(0.2, 16, 12), gold, [0, 8.1, 0]),
    flagGroup,
  );
}

function tower() {
  const stone = mat('#CFC7B8', { roughness: 0.85 });
  const darkStone = mat('#A89F90', { roughness: 0.85 });
  const roof = mat('#D9483B', { roughness: 0.6 });
  const wood = mat('#6E4526');
  const ink = mat('#1F2A44');
  const crenels = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    crenels.push(mesh(new THREE.BoxGeometry(0.34, 0.34, 0.3), darkStone, [Math.sin(a) * 1.18, 3.17, Math.cos(a) * 1.18], [0, a, 0]));
  }
  return group(
    'tower',
    mesh(new THREE.CylinderGeometry(1.2, 1.3, 3, 20), stone, [0, 1.5, 0]),
    mesh(new THREE.CylinderGeometry(1.32, 1.32, 0.2, 20), darkStone, [0, 3.0, 0]),
    ...crenels,
    mesh(new THREE.ConeGeometry(1.1, 1.5, 20), roof, [0, 4.05, 0]),
    mesh(new RoundedBoxGeometry(0.7, 1.1, 0.2, 2, 0.08), wood, [0, 0.55, 1.2]),
    mesh(new RoundedBoxGeometry(0.34, 0.44, 0.1, 2, 0.05), ink, [0, 2.15, 1.2]),
    mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.6, 6), wood, [0, 5.05, 0]),
    mesh(new THREE.BoxGeometry(0.34, 0.2, 0.02), mat('#3E8EDE'), [0.17, 5.25, 0]),
  );
}

function tree() {
  const bark = mat('#7A4A26');
  const leafA = mat('#4CAF50', { flatShading: true });
  const leafB = mat('#3E9A45', { flatShading: true });
  return group(
    'tree',
    mesh(new THREE.CylinderGeometry(0.16, 0.24, 1.5, 8), bark, [0, 0.75, 0]),
    mesh(new THREE.IcosahedronGeometry(0.95, 1), leafA, [0, 2.2, 0]),
    mesh(new THREE.IcosahedronGeometry(0.7, 1), leafB, [0.62, 1.75, 0.15]),
    mesh(new THREE.IcosahedronGeometry(0.65, 1), leafB, [-0.6, 1.85, -0.1]),
  );
}

function bush() {
  const leaf = mat('#5DBB46', { flatShading: true });
  const dark = mat('#4AA23A', { flatShading: true });
  return group(
    'bush',
    mesh(new THREE.IcosahedronGeometry(0.45, 1), leaf, [0, 0.4, 0]),
    mesh(new THREE.IcosahedronGeometry(0.34, 1), dark, [-0.48, 0.28, 0.05]),
    mesh(new THREE.IcosahedronGeometry(0.34, 1), dark, [0.48, 0.28, 0.02]),
  );
}

function cloud() {
  const white = mat('#FFFFFF', { roughness: 1, emissive: '#FFFFFF', emissiveIntensity: 0.35 });
  const s = new THREE.SphereGeometry(0.5, 16, 12);
  return group(
    'cloud',
    mesh(s, white, [-0.95, -0.05, 0], [0, 0, 0], [1, 0.8, 0.8]),
    mesh(s, white, [-0.35, 0.25, 0], [0, 0, 0], [1.2, 1.1, 0.9]),
    mesh(s, white, [0.35, 0.3, 0], [0, 0, 0], [1.3, 1.2, 0.9]),
    mesh(s, white, [0.95, 0, 0], [0, 0, 0], [1, 0.8, 0.8]),
    mesh(s, white, [0, -0.12, 0.1], [0, 0, 0], [2.2, 0.6, 0.8]),
  );
}

const BUILDERS = {
  player,
  kestane,
  kirpi,
  ari,
  coin,
  simit,
  nazar,
  block_ground_top: groundTop,
  block_ground_fill: groundFill,
  block_brick: () => group('brick', mesh(new THREE.BoxGeometry(1, 1, 1), texMat('brick'))),
  block_mystery: () => roundedBlock('mystery', 'mystery', { emissive: '#7A4A00', emissiveIntensity: 0.3, roughness: 0.45 }),
  block_used: () => roundedBlock('used', 'used'),
  block_stone: () => roundedBlock('stone', 'stone'),
  cloud_platform: cloudPlatform,
  flag,
  tower,
  tree,
  bush,
  cloud,
};

export function createPlaceholder(id) {
  const build = BUILDERS[id];
  if (!build) return group(id, mesh(new THREE.BoxGeometry(1, 1, 1), mat('#FF00FF')));
  return build();
}
