// Prosedürel yardımcılar: renkli geometri birleştirme, çuval bezi dokusu, zemin gölgesi.
// (İnsan karakterleri js/avatars.js'te Rocketbox avatarlarından kurulur, çuval kumaşı js/sack.js içinde üretilir.)
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { assets } from './assets.js';

const _c = new THREE.Color();

// Geometriye tek renk boyar (vertex color) ve isteğe bağlı dönüşüm uygular
export function paint(geo, color, m4) {
  if (m4) geo.applyMatrix4(m4);
  _c.set(color);
  const n = geo.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = _c.r; arr[i * 3 + 1] = _c.g; arr[i * 3 + 2] = _c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

function ensureIndexed(g) {
  if (g.index) return g;
  const n = g.attributes.position.count, idx = [];
  for (let i = 0; i < n; i++) idx.push(i);
  g.setIndex(idx);
  return g;
}

export function merge(list) {
  const clean = list.map((g) => {
    ensureIndexed(g);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    return g;
  });
  return mergeGeometries(clean, false);
}

const M = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
  const m = new THREE.Matrix4();
  m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
  return m;
};

// Basit gürültü: kumaş kırışıkları için
export const MAT = {};
export function initMaterials() {
  MAT.vc = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0 });
  MAT.vcSoft = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
  MAT.vcShiny = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.65 });
  MAT.face = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4 });
  MAT.blush = new THREE.MeshBasicMaterial({ color: 0xff7a7a, transparent: true, opacity: 0.35, depthWrite: false });
}

// ---------- Çuval dokusu (çuval bezi + damga) ----------
export function sackTexture(stamp, num, inkColor = '#3b2a1e') {
  const img = assets.images.hessian;
  const cv = document.createElement('canvas'); cv.width = cv.height = 512;
  const x = cv.getContext('2d');
  x.drawImage(img, 0, 0, 512, 512);
  // hafif sarımsı, eski un çuvalı tonu
  x.fillStyle = 'rgba(214,180,120,0.18)'; x.fillRect(0, 0, 512, 512);
  x.save();
  x.translate(128, 250); x.rotate(-0.04);
  x.globalAlpha = 0.78;
  x.fillStyle = inkColor; x.strokeStyle = inkColor;
  x.lineWidth = 7;
  x.beginPath(); x.ellipse(0, 0, 98, 120, 0, 0, Math.PI * 2); x.stroke();
  x.lineWidth = 3;
  x.beginPath(); x.ellipse(0, 0, 86, 108, 0, 0, Math.PI * 2); x.stroke();
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = '900 30px Nunito, sans-serif';
  x.fillText(stamp[0], 0, -58);
  x.font = '400 92px "Lilita One", sans-serif';
  x.fillText(String(num), 0, 8);
  x.font = '900 24px Nunito, sans-serif';
  x.fillText(stamp[1], 0, 70);
  // ★ ve ☾ süslemesi
  x.font = '900 26px serif';
  x.fillText('☾✦', 0, -88);
  x.restore();
  // mürekkep aşınması
  x.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 900; i++) {
    x.fillStyle = `rgba(0,0,0,${Math.random() * 0.25})`;
    x.fillRect(Math.random() * 256, 100 + Math.random() * 300, 2 + Math.random() * 5, 1 + Math.random() * 3);
  }
  x.globalCompositeOperation = 'source-over';
  // çuval bezini damganın üzerine tekrar dokuyla kapla
  x.globalAlpha = 0.25; x.drawImage(img, 0, 0, 512, 512); x.globalAlpha = 1;
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

let _blobMat = null;
export function blobMaterial() {
  if (_blobMat) return _blobMat;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(20,14,8,0.6)'); g.addColorStop(0.55, 'rgba(20,14,8,0.28)'); g.addColorStop(1, 'rgba(20,14,8,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  _blobMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
  return _blobMat;
}

export function personMesh(parts, mat = MAT.vc) {
  const m = new THREE.Mesh(merge(parts), mat);
  m.castShadow = true;
  return m;
}
