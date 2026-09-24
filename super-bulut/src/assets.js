// Varlık kütüphanesi: manifest.json'daki her varlık için Meshy'nin ürettiği GLB modelini
// (assets/generated.json'da kayıtlıysa) yükler, yoksa yer tutucu modeli kullanır.
// Her iki durumda da model manifest'teki 'fit' kuralıyla oyun ölçüsüne getirilir.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { createPlaceholder } from './placeholders.js';

const ASSET_ROOT = new URL('assets/', document.baseURI);

async function fetchJson(path, fallback) {
  try {
    const res = await fetch(new URL(path, ASSET_ROOT), { cache: 'no-cache' });
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    if (fallback !== undefined) return fallback;
    throw err;
  }
}

// Meshy bazen modelin altına bir kaide/zemin plakası ekler. Ağırlık merkezi alttaki
// 'frac' oranının (ör. 0.2 = en alttaki %20) altında kalan üçgenleri atar.
function trimBase(root, frac) {
  root.updateMatrixWorld(true);
  const meshes = [];
  root.traverse((o) => o.isMesh && !o.isSkinnedMesh && meshes.push(o));
  const v = new THREE.Vector3();
  let minY = Infinity;
  let maxY = -Infinity;
  for (const m of meshes) {
    const pos = m.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
      minY = Math.min(minY, v.y);
      maxY = Math.max(maxY, v.y);
    }
  }
  const limit = minY + (maxY - minY) * frac;
  for (const m of meshes) {
    const g = m.geometry;
    const pos = g.attributes.position;
    const index = g.index ? g.index.array : Array.from({ length: pos.count }, (_, i) => i);
    const ys = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) ys[i] = v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld).y;
    const kept = [];
    for (let t = 0; t < index.length; t += 3) {
      const a = index[t],
        b = index[t + 1],
        c = index[t + 2];
      if ((ys[a] + ys[b] + ys[c]) / 3 >= limit) kept.push(a, b, c);
    }
    const trimmed = g.clone();
    trimmed.setIndex(kept);
    m.geometry = trimmed.toNonIndexed(); // kullanılmayan köşeler de gitsin (sınır kutusu doğru olsun)
    m.geometry.computeBoundingBox();
    m.geometry.computeBoundingSphere();
  }
}

// Modeli sarmalayıp ölçekler: pivot → scaler (ölçek + konum) → rotator (Y dönüşü) → model
function normalize(root, fit = { mode: 'height', value: 1 }, rotationY = 0) {
  const pivot = new THREE.Group();
  const scaler = new THREE.Group();
  const rotator = new THREE.Group();
  rotator.rotation.y = THREE.MathUtils.degToRad(rotationY);
  rotator.add(root);
  scaler.add(rotator);
  pivot.add(scaler);
  pivot.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(rotator, true);
  if (box.isEmpty()) return pivot;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const s = new THREE.Vector3();
  if (fit.mode === 'box') {
    s.set(fit.size[0] / Math.max(size.x, 1e-6), fit.size[1] / Math.max(size.y, 1e-6), fit.size[2] / Math.max(size.z, 1e-6));
  } else if (fit.mode === 'width') {
    s.setScalar(fit.value / Math.max(size.x, 1e-6));
  } else {
    s.setScalar(fit.value / Math.max(size.y, 1e-6));
  }
  const off = fit.offset || [0, 0, 0];
  const anchorY = fit.anchor === 'center' ? center.y : box.min.y;
  scaler.scale.copy(s);
  scaler.position.set(off[0] - center.x * s.x, off[1] - anchorY * s.y, off[2] - center.z * s.z);
  pivot.updateMatrixWorld(true);
  return pivot;
}

export class Assets {
  constructor() {
    this.defs = {};
    this.templates = new Map();
    this.stats = { meshy: 0, placeholder: 0, failed: [] };
  }

  async load(onProgress) {
    const manifest = await fetchJson('manifest.json');
    const generated = await fetchJson('generated.json', { assets: {} });
    this.defs = manifest.assets;
    const ids = Object.keys(this.defs);
    const loader = new GLTFLoader();
    let done = 0;

    await Promise.all(
      ids.map(async (id) => {
        const def = this.defs[id];
        const gen = generated.assets?.[id];
        let tpl = null;
        if (gen?.model) {
          try {
            tpl = await this.#loadModel(loader, gen);
            this.stats.meshy++;
          } catch (err) {
            console.warn(`[assets] ${id} modeli yüklenemedi, yer tutucu kullanılıyor:`, err);
            this.stats.failed.push(id);
          }
        }
        if (!tpl) {
          tpl = { root: createPlaceholder(id), clips: [], source: 'placeholder' };
          this.stats.placeholder++;
        }
        if (tpl.source === 'meshy' && def.fit?.trimBase) trimBase(tpl.root, def.fit.trimBase);
        tpl.pivot = normalize(tpl.root, def.fit, def.rotationY || 0);
        tpl.skinned = false;
        tpl.pivot.traverse((o) => {
          if (o.isSkinnedMesh) tpl.skinned = true;
        });
        this.templates.set(id, tpl);
        onProgress?.(++done / ids.length);
      }),
    );
  }

  async #loadModel(loader, gen) {
    const gltf = await loader.loadAsync(new URL(gen.model, ASSET_ROOT).href);
    const clips = gltf.animations.slice();
    for (const [name, file] of Object.entries(gen.animations || {})) {
      try {
        const anim = await loader.loadAsync(new URL(file, ASSET_ROOT).href);
        if (anim.animations[0]) {
          const clip = anim.animations[0].clone();
          clip.name = name;
          clips.push(clip);
        }
      } catch (err) {
        console.warn(`[assets] animasyon yüklenemedi (${file}):`, err);
      }
    }
    gltf.scene.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = !o.isSkinnedMesh;
      }
    });
    return { root: gltf.scene, clips, source: 'meshy' };
  }

  source(id) {
    return this.templates.get(id)?.source ?? 'placeholder';
  }

  // Sahneye eklenecek yeni bir kopya (geometri ve malzemeler paylaşılır)
  instance(id) {
    const tpl = this.templates.get(id);
    const object = tpl.skinned ? cloneSkinned(tpl.pivot) : tpl.pivot.clone(true);
    return { object, clips: tpl.clips, source: tpl.source };
  }

  // InstancedMesh için parçalar: [{ geometry, material, matrix }]
  parts(id) {
    const tpl = this.templates.get(id);
    const out = [];
    tpl.pivot.traverse((o) => {
      if (o.isMesh && !o.isSkinnedMesh) out.push({ geometry: o.geometry, material: o.material, matrix: o.matrixWorld.clone() });
    });
    return out;
  }
}
