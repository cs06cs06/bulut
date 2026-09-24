// 3D sahne: gökyüzü, ışıklar, bölüm blokları (InstancedMesh), dekor, arka plan ve kamera.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { T } from './level.js';
import { VIEW } from './config.js';

const THEMES = {
  day: {
    skyTop: '#3E9FEF',
    skyBottom: '#C4EAFF',
    fog: '#CDEBFF',
    hemiSky: '#E4F4FF',
    hemiGround: '#6A8F3C',
    hemi: 0.95,
    sun: '#FFF3DA',
    sunI: 2.3,
    hills: ['#79C850', '#5DB443', '#8FD35F'],
    meadow: '#6FBF4B',
    mountain: '#9EC2E2',
    cloudBand: [9, 13.5],
    lowClouds: false,
  },
  high: {
    skyTop: '#2A86E8',
    skyBottom: '#E2F5FF',
    fog: '#E8F6FF',
    hemiSky: '#F2F9FF',
    hemiGround: '#8FA9C8',
    hemi: 1.0,
    sun: '#FFFFFF',
    sunI: 2.4,
    hills: ['#BFE3F8', '#A9D6F3', '#D3ECFA'],
    meadow: null,
    mountain: '#C9E0F3',
    cloudBand: [8, 13.5],
    lowClouds: true,
  },
  dusk: {
    skyTop: '#2F2B6E',
    skyBottom: '#FF9D6C',
    fog: '#E7A27F',
    hemiSky: '#FFC9A8',
    hemiGround: '#4B3F5E',
    hemi: 0.75,
    sun: '#FFB27A',
    sunI: 2.0,
    hills: ['#6E8F4E', '#5A7D45', '#7FA05A'],
    meadow: '#5E8544',
    mountain: '#8C6FA3',
    cloudBand: [9, 13.5],
    lowClouds: false,
  },
};

function skyTexture(top, bottom) {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function rng(seed) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

const DYNAMIC_ASSET = { [T.BRICK]: 'block_brick', [T.MYSTERY]: 'block_mystery', [T.USED]: 'block_used' };

export class World {
  constructor(game) {
    this.game = game;
    this.assets = game.assets;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(VIEW.fov, 1, 0.5, 400);
    this.cam = { x: 0, y: 7, dist: 22, visW: 24, visH: 14 };

    // Metalik/PBR yüzeyler (altın, Meshy dokuları) için ortam yansıması
    const pmrem = new THREE.PMREMGenerator(game.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.35;
    pmrem.dispose();

    this.hemi = new THREE.HemisphereLight('#ffffff', '#666666', 1.2);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#ffffff', 2.2);
    this.sun.castShadow = true;
    const mobile = window.matchMedia?.('(pointer: coarse)').matches;
    this.sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
    Object.assign(this.sun.shadow.camera, { left: -22, right: 22, top: 15, bottom: -15, near: 0.5, far: 80 });
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun, this.sun.target);

    this.levelGroup = null;
    this.blocks = new Map();
    this.bumping = new Set();
    this.clouds = [];
    this.pulseMats = [];
    this.time = 0;
  }

  add(obj) {
    this.levelGroup.add(obj);
    return obj;
  }

  remove(obj) {
    obj?.parent?.remove(obj);
  }

  build(level, themeName) {
    if (this.levelGroup) {
      this.scene.remove(this.levelGroup);
      this.levelGroup.traverse((o) => o.isInstancedMesh && o.dispose());
    }
    this.level = level;
    this.levelGroup = new THREE.Group();
    this.scene.add(this.levelGroup);
    this.blocks.clear();
    this.bumping.clear();
    this.clouds = [];

    const theme = THEMES[themeName] || THEMES.day;
    this.theme = theme;
    this.scene.background = skyTexture(theme.skyTop, theme.skyBottom);
    this.scene.fog = new THREE.Fog(theme.fog, 45, 170);
    this.hemi.color.set(theme.hemiSky);
    this.hemi.groundColor.set(theme.hemiGround);
    this.hemi.intensity = theme.hemi;
    this.sun.color.set(theme.sun);
    this.sun.intensity = theme.sunI;

    // --- Bloklar
    const lists = { block_ground_top: [], block_ground_fill: [], block_stone: [], cloud_platform: [] };
    const put = (id, x, y, z) => lists[id].push(new THREE.Matrix4().makeTranslation(x, y, z));
    for (let ty = 0; ty < level.height; ty++) {
      for (let tx = 0; tx < level.width; tx++) {
        const t = level.get(tx, ty);
        const x = tx + 0.5;
        const y = ty + 0.5;
        if (t === T.GROUND) {
          const id = level.get(tx, ty + 1) === T.GROUND ? 'block_ground_fill' : 'block_ground_top';
          for (const z of [0, -1, -2]) {
            put(id, x, y, z);
            if (ty === 0) {
              put('block_ground_fill', x, -0.5, z);
              put('block_ground_fill', x, -1.5, z);
            }
          }
        } else if (t === T.STONE) put('block_stone', x, y, 0);
        else if (t === T.PLATFORM) put('cloud_platform', x, y, 0);
        else if (DYNAMIC_ASSET[t]) this.setBlock(tx, ty, t);
      }
    }
    for (const [id, mats] of Object.entries(lists)) this.#addInstanced(id, mats);

    const mystery = this.assets.parts('block_mystery');
    this.pulseMats = [...new Set(mystery.map((p) => p.material).flat())].filter((m) => m.emissive);

    // --- Dekor
    for (const d of level.decor) {
      const obj = this.assets.instance(d.type).object;
      obj.position.set(d.x, d.y, d.type === 'tree' ? -2.2 : -1.4);
      obj.rotation.y = ((d.x * 1.7) % 0.6) - 0.3;
      this.add(obj);
    }
    if (level.flag) {
      const f = this.assets.instance('flag').object;
      f.position.set(level.flag.x, level.flag.y, 0);
      this.add(f);
      this.flagCloth = f.getObjectByName('flag');
      this.flagClothTop = this.flagCloth?.position.y;
    }
    if (level.tower) {
      const tw = this.assets.instance('tower').object;
      tw.position.set(level.tower.x, level.tower.y, -1.3);
      this.add(tw);
    }

    this.#buildBackground(level, theme);
  }

  #addInstanced(id, matrices) {
    if (!matrices.length) return;
    const m = new THREE.Matrix4();
    for (const part of this.assets.parts(id)) {
      const im = new THREE.InstancedMesh(part.geometry, part.material, matrices.length);
      matrices.forEach((mat, i) => im.setMatrixAt(i, m.multiplyMatrices(mat, part.matrix)));
      im.castShadow = true;
      im.receiveShadow = true;
      im.computeBoundingSphere();
      this.add(im);
    }
  }

  #buildBackground(level, theme) {
    const r = rng(level.width * 31 + level.def.id.length);
    const W = level.width;

    if (theme.meadow) {
      const meadow = new THREE.Mesh(
        new THREE.PlaneGeometry(W + 160, 70),
        new THREE.MeshStandardMaterial({ color: theme.meadow, roughness: 1 }),
      );
      meadow.rotation.x = -Math.PI / 2;
      meadow.position.set(W / 2, 1.97, -37.6);
      meadow.receiveShadow = true;
      this.add(meadow);
    }

    const hillMats = theme.hills.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, flatShading: true }));
    for (let x = -20; x < W + 30; x += 7 + r() * 9) {
      const rad = 3.5 + r() * 6;
      const z = -9 - r() * 12;
      const hill = new THREE.Mesh(new THREE.IcosahedronGeometry(rad, 2), hillMats[Math.floor(r() * hillMats.length)]);
      hill.scale.set(1.3, 0.75, 0.8);
      hill.position.set(x, theme.meadow ? 2 - rad * 0.2 : -3 - r() * 3, z);
      this.add(hill);
    }

    const mountainMat = new THREE.MeshStandardMaterial({ color: theme.mountain, roughness: 1, flatShading: true });
    for (let x = -60; x < W + 60; x += 18 + r() * 16) {
      const h = 18 + r() * 18;
      const m = new THREE.Mesh(new THREE.ConeGeometry(h * 0.8, h, 6 + Math.floor(r() * 3)), mountainMat);
      m.position.set(x, h / 2 - 2, -60 - r() * 15);
      m.rotation.y = r() * Math.PI;
      this.add(m);
    }

    const [cy0, cy1] = theme.cloudBand;
    for (let x = -10; x < W + 20; x += 8 + r() * 10) {
      const c = this.assets.instance('cloud').object;
      const s = 0.7 + r() * 0.8;
      c.scale.setScalar(s);
      c.position.set(x, cy0 + r() * (cy1 - cy0), -12 - r() * 14);
      this.add(c);
      this.clouds.push({ obj: c, speed: 0.2 + r() * 0.4 });
    }
    if (theme.lowClouds) {
      for (let x = -10; x < W + 20; x += 4 + r() * 5) {
        const c = this.assets.instance('cloud').object;
        c.scale.setScalar(1 + r() * 0.9);
        c.position.set(x, -1.5 + r() * 2, -3.5 - r() * 8);
        this.add(c);
        this.clouds.push({ obj: c, speed: 0.1 + r() * 0.2 });
      }
    }
  }

  // Tuğla / sürpriz / kullanılmış blokları tek tek nesne olarak tut (kırılabilir, zıplar)
  setBlock(tx, ty, type) {
    const key = ty * this.level.width + tx;
    const old = this.blocks.get(key);
    if (old) {
      this.remove(old.obj);
      this.blocks.delete(key);
      this.bumping.delete(old);
    }
    const id = DYNAMIC_ASSET[type];
    if (!id) return;
    const obj = this.assets.instance(id).object;
    obj.position.set(tx + 0.5, ty + 0.5, 0);
    this.add(obj);
    const b = { obj, baseY: ty + 0.5, t: 0 };
    this.blocks.set(key, b);
    return b;
  }

  bump(tx, ty) {
    const b = this.blocks.get(ty * this.level.width + tx);
    if (!b) return;
    b.t = 0;
    this.bumping.add(b);
  }

  setFlagProgress(p) {
    if (!this.flagCloth) return;
    this.flagCloth.position.y = THREE.MathUtils.lerp(this.flagClothTop, 1.1, p);
  }

  update(dt) {
    this.time += dt;
    for (const b of this.bumping) {
      b.t += dt;
      const k = b.t / 0.2;
      if (k >= 1) {
        b.obj.position.y = b.baseY;
        this.bumping.delete(b);
      } else b.obj.position.y = b.baseY + Math.sin(k * Math.PI) * 0.35;
    }
    const pulse = 0.25 + 0.2 * (0.5 + 0.5 * Math.sin(this.time * 4));
    for (const m of this.pulseMats) m.emissiveIntensity = pulse;
    const W = this.level?.width ?? 100;
    for (const c of this.clouds) {
      c.obj.position.x += c.speed * dt;
      if (c.obj.position.x > W + 25) c.obj.position.x = -15;
    }
  }

  resize(w, h) {
    const aspect = w / h;
    const tan = Math.tan(THREE.MathUtils.degToRad(VIEW.fov / 2));
    const dist = Math.max(VIEW.minTilesHigh / (2 * tan), VIEW.minTilesWide / (2 * tan * aspect));
    this.cam.dist = dist;
    this.cam.visH = 2 * dist * tan;
    this.cam.visW = this.cam.visH * aspect;
    this.camera.aspect = aspect;
    this.camera.far = dist + 140;
    this.camera.updateProjectionMatrix();
  }

  // target: { x, y, facing }
  updateCamera(dt, target, snap = false) {
    const { visW, visH } = this.cam;
    const W = this.level.width;
    const lead = (target.facing || 0) * 1.5;
    let desiredX = target.x + lead;
    desiredX = visW >= W ? W / 2 : THREE.MathUtils.clamp(desiredX, visW / 2, W - visW / 2);
    const baseY = visH / 2 - 0.1;
    let desiredY = Math.max(baseY, target.y + 3.2 - visH / 2);
    desiredY = Math.max(baseY, Math.min(desiredY, 16.5 - visH / 2));
    if (snap) {
      this.cam.x = desiredX;
      this.cam.y = desiredY;
    } else {
      this.cam.x = THREE.MathUtils.damp(this.cam.x, desiredX, 4.5, dt);
      this.cam.y = THREE.MathUtils.damp(this.cam.y, desiredY, 3, dt);
    }
    this.camera.position.set(this.cam.x, this.cam.y + 1.4, this.cam.dist);
    this.camera.lookAt(this.cam.x, this.cam.y, 0);
    this.sun.target.position.set(this.cam.x, 4, 0);
    this.sun.position.set(this.cam.x + 7, 20, 14);
  }

  visibleRange() {
    return { x0: this.cam.x - this.cam.visW / 2 - 2, x1: this.cam.x + this.cam.visW / 2 + 2 };
  }
}
