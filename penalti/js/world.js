// Assembles the night stadium: sky/IBL, flood-lights with shadows, pitch, goal, stands.
import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { PITCH, loadTurfTextures, createTurfMaterial, buildMarkings, buildGround } from './pitch.js';
import { Goal } from './goal.js';
import { Stadium } from './stadium.js';
import { QUALITY } from './fx.js';

export class World {
  constructor(renderer, quality = 'high') {
    this.renderer = renderer;
    this.quality = quality;
    this.scene = new THREE.Scene();
    this.spots = [];
    this.time = 0;
  }
  async load(onProgress) {
    const r = this.renderer, scene = this.scene;
    const q = QUALITY[this.quality];
    // ---- sky / environment
    const hdr = await new HDRLoader().loadAsync('./assets/hdri/night_sky_2k.hdr');
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    onProgress && onProgress(0.15);
    scene.background = hdr; scene.backgroundIntensity = 0.85; scene.backgroundBlurriness = 0.0;
    scene.fog = new THREE.FogExp2(0x0b1224, 0.0030);

    // ---- pitch
    const tex = await loadTurfTextures(r);
    for (const t of Object.values(tex)) t.anisotropy = q.anisotropy;
    this.turfMat = createTurfMaterial(tex);
    const paintMat = createTurfMaterial(tex, { paint: true });
    paintMat.polygonOffset = true; paintMat.polygonOffsetFactor = -2; paintMat.polygonOffsetUnits = -2;
    paintMat.roughness = 0.9;
    this.ground = buildGround(this.turfMat);
    scene.add(this.ground);
    this.markings = buildMarkings(paintMat);
    scene.add(this.markings);
    onProgress && onProgress(0.35);

    // ---- goal
    this.goal = new Goal(r);
    scene.add(this.goal.group);
    // second goal at far end (facing the other way) for replay / orbit shots
    this.goal2 = new Goal(r);
    this.goal2.group.rotation.y = Math.PI; this.goal2.group.position.z = PITCH.l;
    scene.add(this.goal2.group);

    // ---- stadium
    this.stadium = new Stadium(r, { crowdDensity: q.crowd });
    scene.add(this.stadium.group);
    onProgress && onProgress(0.6);

    // ---- lights
    this.buildLights(q);
    // ---- environment map from a synthetic floodlit stadium
    this.buildEnvironment(hdr);
    onProgress && onProgress(0.8);

    // ---- corner flags
    this.buildCornerFlags();
  }

  buildLights(q) {
    const scene = this.scene;
    this.hemi = new THREE.HemisphereLight(0x5f78b8, 0x14301a, 0.18);
    scene.add(this.hemi);
    const pos = [[-40, 33, -9], [40, 33, -9], [-40, 33, 74], [40, 33, 74]];
    const target = new THREE.Object3D(); target.position.set(0, 0, 14); scene.add(target);
    pos.forEach((p, i) => {
      const s = new THREE.SpotLight(0xfff1dc, 5200, 0, THREE.MathUtils.degToRad(i < 2 ? 30 : 30), 0.65, 2);
      s.position.set(...p); s.target = target;
      const cast = i < q.shadowLights;
      s.castShadow = cast;
      if (cast) {
        s.shadow.mapSize.set(q.shadow, q.shadow);
        s.shadow.camera.near = 20; s.shadow.camera.far = 120;
        s.shadow.bias = -0.00035; s.shadow.normalBias = 0.03; s.shadow.radius = 3.5;
      }
      scene.add(s); this.spots.push(s);
    });
    // wide fill so that the rest of the pitch and the stands read as lit
    const fill = new THREE.SpotLight(0xdfe8ff, 1000, 0, THREE.MathUtils.degToRad(62), 0.9, 2);
    fill.position.set(0, 40, 90); fill.target.position.set(0, 0, 40); scene.add(fill); scene.add(fill.target);
    this.fill = fill;
    // stand wash (no shadows): broad lights aimed at each stand
    const wash = [[[0, 30, 22], [0, 9, -30]], [[0, 30, 84], [0, 9, 136]], [[-14, 30, 52], [-58, 9, 52]], [[14, 30, 52], [58, 9, 52]]];
    for (const [pp, tt] of wash) {
      const s = new THREE.SpotLight(0xffe9c8, 1500, 0, THREE.MathUtils.degToRad(46), 0.9, 2);
      s.position.set(...pp); s.target.position.set(...tt); scene.add(s); scene.add(s.target);
    }
  }

  applyQuality(name) {
    const q = QUALITY[name]; this.quality = name;
    this.spots.forEach((s, i) => {
      const cast = i < q.shadowLights; s.castShadow = cast;
      if (cast) { s.shadow.mapSize.set(q.shadow, q.shadow); if (s.shadow.map) { s.shadow.map.dispose(); s.shadow.map = null; } }
    });
    const st = this.stadium;
    st.crowd.geometry.instanceCount = Math.floor(st.crowdN * q.crowd);
    if (this.turfMat && this.turfMat.map) for (const k of ['map', 'normalMap', 'roughnessMap', 'aoMap']) if (this.turfMat[k]) this.turfMat[k].anisotropy = q.anisotropy;
  }

  buildEnvironment(hdr) {
    const r = this.renderer;
    const env = new THREE.Scene();
    const sky = new THREE.Mesh(new THREE.SphereGeometry(200, 48, 24), new THREE.MeshBasicMaterial({ map: hdr, side: THREE.BackSide, color: new THREE.Color(0.9, 0.9, 1.0) }));
    env.add(sky);
    // pitch bounce
    const gr = new THREE.Mesh(new THREE.CircleGeometry(80, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.10, 0.34, 0.10).multiplyScalar(2.4) }));
    gr.rotation.x = -Math.PI / 2; gr.position.y = 0; env.add(gr);
    // stands ring
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(70, 60, 26, 48, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 0.22, 0.24), side: THREE.BackSide }));
    ring.position.y = 13; env.add(ring);
    // roof underside
    const roof = new THREE.Mesh(new THREE.RingGeometry(38, 72, 48), new THREE.MeshBasicMaterial({ color: 0x151820, side: THREE.DoubleSide }));
    roof.rotation.x = Math.PI / 2; roof.position.y = 27; env.add(roof);
    // floodlight banks
    const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.95, 0.85).multiplyScalar(90) });
    const N = 20;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(9, 5), lampMat);
      m.position.set(Math.cos(a) * 52, 25, Math.sin(a) * 40 + 0);
      m.lookAt(0, 4, 0); env.add(m);
    }
    const pm = new THREE.PMREMGenerator(r);
    const rt = pm.fromScene(env, 0.02, 0.1, 400);
    this.scene.environment = rt.texture;
    this.scene.environmentIntensity = 0.45;
    pm.dispose();
    env.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  }

  buildCornerFlags() {
    const g = new THREE.Group();
    const poleMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
    const flagMat = new THREE.MeshStandardMaterial({ color: 0xffd400, roughness: 0.7, side: THREE.DoubleSide });
    this.flags = [];
    for (const x of [-PITCH.halfW, PITCH.halfW]) for (const z of [0, PITCH.l]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.5, 8), poleMat); pole.position.set(x, 0.75, z); pole.castShadow = true;
      const fg = new THREE.PlaneGeometry(0.4, 0.3, 6, 1); fg.translate(0.2, 0, 0);
      const flag = new THREE.Mesh(fg, flagMat); flag.position.set(x, 1.32, z); flag.castShadow = true;
      flag.userData.base = fg.attributes.position.array.slice();
      g.add(pole, flag); this.flags.push(flag);
    }
    this.scene.add(g);
  }

  update(dt, t) {
    this.time = t;
    this.goal.update(dt); this.goal2.update(dt);
    this.stadium.update(dt, t);
    for (const f of this.flags || []) {
      const p = f.geometry.attributes.position, b = f.userData.base;
      for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(b[i * 3] * 12 - t * 6) * 0.06 * b[i * 3] * 3);
      p.needsUpdate = true;
    }
  }
}
