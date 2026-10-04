import * as THREE from 'three';

// Seats an animated Kenney character behind the wheel. `seat` is a fraction of the vehicle's
// bounding box (0..1 per axis, x = +left side for a car facing +Z), so one table fits every model.
export const SEATS = {
  pickup: [0.7, 0.3, 0.56], suv: [0.7, 0.3, 0.55], tractor_k: [0.5, 0.42, 0.36], jeep: [0.7, 0.24, 0.42], monster: [0.7, 0.46, 0.56],
  truck: [0.7, 0.42, 0.78], van: [0.7, 0.33, 0.72], tractor: [0.5, 0.5, 0.35],
  k_sedan: [0.7, 0.26, 0.5], k_hatchback: [0.7, 0.24, 0.48], k_police: [0.7, 0.26, 0.5], k_delivery: [0.7, 0.3, 0.7], k_taxi: [0.7, 0.26, 0.5],
};

export function seatDriver(lib, parent, box, seat, charId = 'char_m_b', scale = 0.62) {
  const o = lib.clone(charId);
  o.scale.multiplyScalar(scale); // a seated adult inside a low-poly cab
  const s = seat || [0.7, 0.3, 0.55];
  o.position.set(box.min.x + (box.max.x - box.min.x) * s[0],
    box.min.y + (box.max.y - box.min.y) * s[1], box.min.z + (box.max.z - box.min.z) * s[2]);
  o.traverse((m) => { if (m.isMesh) { m.castShadow = false; m.frustumCulled = false; } });
  parent.add(o);
  const mixer = new THREE.AnimationMixer(o);
  const clip = lib.gltf[charId].animations.find((a) => a.name === 'drive') || lib.gltf[charId].animations.find((a) => a.name === 'sit');
  if (clip) mixer.clipAction(clip).play();
  mixer.update(Math.random());
  return { o, mixer };
}

// tinted see-through glass so the driver shows (models with a separate window material)
export function glassify(root) {
  root.traverse((m) => {
    if (!m.isMesh) return;
    const fix = (mat) => {
      if (!/^windows$|glass/i.test(mat.name) || /untransparent/i.test(mat.name)) return mat;
      const g = mat.clone();
      g.transparent = true; g.opacity = 0.42; g.depthWrite = false; g.roughness = 0.1; g.metalness = 0.3;
      return g;
    };
    m.material = Array.isArray(m.material) ? m.material.map(fix) : fix(m.material);
  });
}
