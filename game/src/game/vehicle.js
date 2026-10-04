import * as THREE from 'three';

// Raycast-vehicle pickup built on Rapier's DynamicRayCastVehicleController.
// 4x4 drive, automatic gearbox, torque curve, aero drag, air control and anti-roll help.

const GEARS = [-3.1, 0, 3.4, 2.15, 1.5, 1.12, 0.88];   // R, N, 1..5
const FINAL = 3.9;
const REF_RADIUS = 0.41; // gearing is normalised to this wheel radius so big tyres keep the same feel

// Garage: per-vehicle specs. `bed` = open cargo bed in model space (pickup-style vehicles only).
export const VEHICLES = {
  pickup: {
    name: 'Pikap', model: 'pickup', price: 0, desc: 'Çiftliğin emektarı. Kasası yük taşır, her işe koşar.',
    mass: 1650, power: 1.0, grip: 1.0, maxSteer: 0.62, top: 3,
    suspensionRest: 0.5, suspensionTravel: 0.4, stiffness: 30, compression: 3.4, relaxation: 4.2,
    bed: { floorY: 0.92, rimY: 1.5, zMin: -2.36, zMax: -0.55, halfX: 1.0 }, paint: /body dark green/i,
  },
  suv: {
    name: 'Arazi SUV', model: 'suv', price: 2200, desc: 'Daha güçlü motor, daha iyi tutuş. Yük taşıyamaz.',
    mass: 1720, power: 1.22, grip: 1.12, maxSteer: 0.6, top: 4,
    suspensionRest: 0.46, suspensionTravel: 0.34, stiffness: 33, compression: 3.6, relaxation: 4.4,
    bed: null, paint: /body dark purple/i,
  },
  monster: {
    name: 'Canavar Kamyon', model: 'monster', price: 6000, desc: 'Dev tekerler, uzun süspansiyon. Her tepeye çıkar, kasası da var.',
    mass: 2500, power: 1.6, grip: 1.15, maxSteer: 0.55, top: 5,
    suspensionRest: 0.85, suspensionTravel: 0.7, stiffness: 21, compression: 2.8, relaxation: 3.4,
    bed: { floorY: 1.6, rimY: 2.1, zMin: -2.62, zMax: -0.62, halfX: 1.0 }, paint: /body light blue/i,
  },
};

// Garage upgrades: multipliers per level
export const UPGRADES = {
  engine: { name: 'Motor', desc: 'Daha fazla tork ve hız', prices: [600, 1400, 3000] },
  tires: { name: 'Arazi Lastikleri', desc: 'Toprakta ve çimde daha çok tutuş', prices: [500, 1200, 2600] },
  susp: { name: 'Süspansiyon', desc: 'Daha uzun yol, daha yumuşak iniş', prices: [450, 1100, 2400] },
};
const IDLE_RPM = 850, REDLINE = 6200;

function torqueAt(rpm) {
  // simple petrol V8-ish curve (Nm)
  const x = rpm / 1000;
  return Math.max(120, 330 + 70 * x - 9 * x * x) * (rpm > REDLINE ? 0.2 : 1);
}

export class Vehicle {
  constructor({ RAPIER, world, model, spawn, heading = 0, config = {}, upgrades = {} }) {
    this.RAPIER = RAPIER;
    this.world = world;
    this.cfg = Object.assign({
      scale: 1.0, mass: 1650, radius: 0.48, power: 1, grip: 1,
      suspensionRest: 0.5, suspensionTravel: 0.4, stiffness: 30, compression: 3.4, relaxation: 4.2,
      frictionSlip: 2.6, sideStiffness: 1.25, maxSteer: 0.62, bed: null,
    }, config);
    // upgrades: engine → torque, tires → grip, susp → travel & damping
    const up = { engine: 0, tires: 0, susp: 0, ...upgrades };
    this.cfg.power *= 1 + up.engine * 0.13;
    this.cfg.grip *= 1 + up.tires * 0.07;
    this.cfg.suspensionTravel += up.susp * 0.06;
    this.cfg.suspensionRest += up.susp * 0.03;
    this.cfg.stiffness *= 1 - up.susp * 0.05;
    this.cfg.compression *= 1 + up.susp * 0.08;
    this._buildVisual(model);
    this._buildPhysics(spawn, heading);
    this._buildLights();
    this.gear = 2; this.rpm = IDLE_RPM; this.shiftTimer = 0;
    this.speed = 0; this.forwardSpeed = 0; this.throttle = 0;
    this.wheelState = [0, 1, 2, 3].map(() => ({ contact: false, slip: 0, compression: 0, pos: new THREE.Vector3(), surface: 'grass' }));
    this.airTime = 0; this.lastLandingImpact = 0;
    this.steerAngle = 0;
    this.odometer = 0;
  }

  _buildVisual(model) {
    const s = this.cfg.scale;
    this.object = new THREE.Group();
    this.object.name = 'vehicle';
    const root = model.clone(true);
    root.scale.setScalar(s);
    root.updateMatrixWorld(true);
    this.wheels = [];
    const names = [['front', 'left'], ['front', 'right'], [/back|rear/, 'left'], [/back|rear/, 'right']];
    const found = {};
    root.traverse((o) => {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
      const n = o.name.toLowerCase();
      if (n.includes('wheel') && o.isMesh) {
        for (let i = 0; i < 4; i++) {
          const a = names[i][0];
          if ((typeof a === 'string' ? n.includes(a) : a.test(n)) && n.includes(names[i][1])) found[i] = o;
        }
      }
    });
    this.object.add(root);
    for (let i = 0; i < 4; i++) {
      const w = found[i];
      const box = new THREE.Box3().setFromObject(w);
      const c = box.getCenter(new THREE.Vector3());
      const pivot = new THREE.Group();
      pivot.position.copy(c);
      const spin = new THREE.Group();
      pivot.add(spin);
      // re-parent keeping world transform (root has no rotation, so subtract centre)
      w.updateMatrixWorld(true);
      const wm = w.matrixWorld.clone();
      w.parent.remove(w);
      spin.add(w);
      const inv = new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z);
      wm.premultiply(inv);
      wm.decompose(w.position, w.quaternion, w.scale);
      this.object.add(pivot);
      this.wheels.push({ pivot, spin, rest: c.clone(), radius: (box.max.y - box.min.y) / 2 });
    }
    this.cfg.radius = this.wheels[0].radius;
    const bb = new THREE.Box3().setFromObject(root);
    this.bodyBox = bb;
  }

  _buildPhysics(spawn, heading) {
    const R = this.RAPIER, c = this.cfg;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), heading);
    const bd = R.RigidBodyDesc.dynamic()
      .setTranslation(spawn.x, spawn.y, spawn.z)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
      .setLinearDamping(0.02).setAngularDamping(0.35).setCcdEnabled(true).setCanSleep(false);
    this.body = this.world.createRigidBody(bd);
    const bb = this.bodyBox;
    const hx = (bb.max.x - bb.min.x) / 2 * 0.92, hz = (bb.max.z - bb.min.z) / 2 * 0.96;
    const bodyBottom = this.wheels[0].rest.y + 0.05;
    const hy = (bb.max.y - bodyBottom) / 2 * 0.75;
    const cy = bodyBottom + hy;
    const cz = (bb.max.z + bb.min.z) / 2;
    // lower centre of mass keeps it planted on rough ground
    // (centre of mass is expressed in the collider's local frame)
    const com = { x: 0, y: this.wheels[0].rest.y - 0.05 - cy, z: 0.1 };
    const m = c.mass;
    const inertia = { x: m * (4 * hy * hy + 4 * hz * hz) / 12 * 1.2, y: m * (4 * hx * hx + 4 * hz * hz) / 12, z: m * (4 * hx * hx + 4 * hy * hy) / 12 * 1.3 };
    const bed = c.bed;
    this.colliders = [];
    const add = (desc, main = false) => {
      desc.setFriction(main ? 0.4 : 0.7).setRestitution(0.1).setActiveEvents(R.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(9000);
      if (!main) desc.setDensity(0);
      const col = this.world.createCollider(desc, this.body);
      col.userData = { kind: 'vehicle' };
      this.colliders.push(col);
      return col;
    };
    if (!bed) {
      this.collider = add(R.ColliderDesc.roundCuboid(hx - 0.1, hy - 0.1, hz - 0.1, 0.1).setTranslation(0, cy, cz)
        .setMassProperties(m, com, inertia, { x: 0, y: 0, z: 0, w: 1 }), true);
    } else {
      // cab + engine block in front of the bed, then an open bed (floor, side walls, tailgate) so cargo can ride in it
      const zFront = bb.max.z * 0.96, cabLen = (zFront - bed.zMax) / 2, cabZ = (zFront + bed.zMax) / 2;
      this.collider = add(R.ColliderDesc.roundCuboid(hx - 0.1, hy - 0.1, cabLen - 0.1, 0.1).setTranslation(0, cy, cabZ)
        .setMassProperties(m, { x: com.x, y: com.y, z: cz + 0.1 - cabZ }, inertia, { x: 0, y: 0, z: 0, w: 1 }), true);
      const bedLen = (bed.zMax - bed.zMin) / 2, bedZ = (bed.zMax + bed.zMin) / 2;
      const floorH = (bed.floorY - bodyBottom) / 2;
      add(R.ColliderDesc.cuboid(hx, Math.max(0.08, floorH), bedLen).setTranslation(0, bodyBottom + floorH, bedZ));
      const wallH = (bed.rimY - bed.floorY) / 2;
      for (const sx of [-1, 1]) add(R.ColliderDesc.cuboid(0.07, wallH, bedLen).setTranslation(sx * (bed.halfX + 0.07), bed.floorY + wallH, bedZ));
      add(R.ColliderDesc.cuboid(bed.halfX + 0.14, wallH, 0.07).setTranslation(0, bed.floorY + wallH, bed.zMin - 0.07));
    }

    const ctrl = this.world.createVehicleController(this.body);
    ctrl.indexUpAxis = 1;
    ctrl.setIndexForwardAxis = 2;
    for (let i = 0; i < 4; i++) {
      const r = this.wheels[i].rest;
      const conn = { x: r.x, y: r.y + c.suspensionRest * 0.55, z: r.z };
      ctrl.addWheel(conn, { x: 0, y: -1, z: 0 }, { x: -1, y: 0, z: 0 }, c.suspensionRest, c.radius);
      ctrl.setWheelSuspensionStiffness(i, c.stiffness);
      ctrl.setWheelSuspensionCompression(i, c.compression);
      ctrl.setWheelSuspensionRelaxation(i, c.relaxation);
      ctrl.setWheelMaxSuspensionTravel(i, c.suspensionTravel);
      ctrl.setWheelMaxSuspensionForce(i, 120000);
      ctrl.setWheelFrictionSlip(i, c.frictionSlip);
      ctrl.setWheelSideFrictionStiffness(i, c.sideStiffness);
      this.wheels[i].conn = conn;
    }
    this.ctrl = ctrl;
  }

  // headlights (on at night) + emissive lenses
  _buildLights() {
    this.lights = [];
    const bb = this.bodyBox;
    for (const sx of [-1, 1]) {
      const l = new THREE.SpotLight(0xfff1d0, 0, 70, 0.55, 0.45, 1.2);
      l.position.set(sx * (bb.max.x * 0.6), this.wheels[0].rest.y + 0.55, bb.max.z * 0.95);
      l.target.position.set(sx * 1.5, -1.5, bb.max.z + 25);
      this.object.add(l, l.target);
      this.lights.push(l);
    }
    this.lensMats = [];
    this.object.traverse((o) => {
      if (!o.isMesh || Array.isArray(o.material)) return;
      if (/headlight|rear light|lights/i.test(o.material.name)) { o.material = o.material.clone(); this.lensMats.push(o.material); }
    });
  }

  setHeadlights(on) {
    for (const l of this.lights) l.intensity = on ? 90 : 0;
    for (const m of this.lensMats) {
      const rear = /rear/i.test(m.name);
      m.emissive = new THREE.Color(rear ? 0xff2010 : 0xfff3d6);
      m.emissiveIntensity = on ? (rear ? 1.6 : 3) : 0;
    }
  }

  // world-space → bed-local test (for cargo)
  isInBed(p) {
    const b = this.cfg.bed;
    if (!b) return false;
    const l = this.object.worldToLocal(_l.copy(p));
    return Math.abs(l.x) < b.halfX + 0.25 && l.z > b.zMin - 0.3 && l.z < b.zMax + 0.2 && l.y > b.floorY - 0.4 && l.y < b.rimY + 1.4;
  }

  bedToWorld(x, y, z, out = new THREE.Vector3()) { return this.object.localToWorld(out.set(x, y, z)); }

  dispose(scene) {
    this.world.removeVehicleController(this.ctrl);
    this.world.removeRigidBody(this.body);
    scene.remove(this.object);
  }

  // repaint the body (materials whose name contains "body" and the main colour)
  setPaint(name) {
    const colors = { green: 0x1f6b2e, red: 0xa3241c, blue: 0x24508f, cream: 0xe6d7b0, black: 0x23262b, orange: 0xd06a1c };
    if (!this._paintMats) {
      this._paintMats = new Set();
      const re = this.cfg.paint || /body.*(green|red|blue|main|paint)|dark green/i;
      this.object.traverse((o) => {
        if (!o.isMesh) return;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (re.test(m.name)) this._paintMats.add(m);
      });
      // own the materials so the clone does not affect the shared asset
      this.object.traverse((o) => {
        if (!o.isMesh || Array.isArray(o.material)) return;
        if (this._paintMats.has(o.material)) { const c = o.material.clone(); c.userData.paint = true; o.material = c; }
      });
      this._paintMats = new Set();
      this.object.traverse((o) => { if (o.isMesh && o.material.userData?.paint) this._paintMats.add(o.material); });
    }
    for (const m of this._paintMats) { m.color.set(colors[name] ?? colors.green); m.roughness = 0.45; m.metalness = 0.25; }
  }

  get position() { return this.object.position; }

  reset(pos, heading) {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), heading);
    this.body.setTranslation(pos, true);
    this.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.gear = 2; this.rpm = IDLE_RPM;
  }

  heading() {
    const r = this.body.rotation();
    const f = new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion(r.x, r.y, r.z, r.w));
    return Math.atan2(f.x, f.z);
  }

  // physics step (fixed dt)
  step(dt, input, surfaceAt) {
    const c = this.cfg, ctrl = this.ctrl, body = this.body;
    const rot = body.rotation();
    const q = _q.set(rot.x, rot.y, rot.z, rot.w);
    const fwd = _f.set(0, 0, 1).applyQuaternion(q);
    const up = _u.set(0, 1, 0).applyQuaternion(q);
    const right = _r.set(1, 0, 0).applyQuaternion(q);
    const lv = body.linvel();
    const vel = _v.set(lv.x, lv.y, lv.z);
    const fspeed = vel.dot(fwd);
    this.forwardSpeed = fspeed;
    this.speed = vel.length();

    // ----- contacts
    let contacts = 0;
    for (let i = 0; i < 4; i++) if (ctrl.wheelIsInContact(i)) contacts++;

    // ----- intent: forward/reverse with S acting as brake until stopped
    const wantFwd = input.throttle, wantBack = input.brake;
    let drive = 0, brake = 0;
    if (this.gear >= 2) {
      drive = wantFwd;
      if (wantBack > 0.05) { if (fspeed > 1.0) brake = wantBack; else { this.gear = 0; } }
    } else if (this.gear === 0) {
      drive = wantBack;
      if (wantFwd > 0.05) { if (fspeed < -1.0) brake = wantFwd; else this.gear = 2; }
    }
    if (this.gear === 1) this.gear = 2;
    if (this.gear === 0 && fspeed < -10) drive *= 0.2; // reverse speed limit

    // ----- gearbox (automatic)
    const wheelRps = Math.abs(fspeed) / c.radius;
    const ratio = Math.abs(GEARS[this.gear]) * FINAL * (c.radius / REF_RADIUS);
    let rpm = wheelRps * ratio * 60 / (2 * Math.PI);
    const slipping = contacts < 2 || input.handbrake;
    const freeRev = IDLE_RPM + drive * (REDLINE - IDLE_RPM) * 0.92;
    rpm = slipping ? Math.max(rpm, freeRev * 0.85) : Math.max(IDLE_RPM, rpm);
    if (this.gear === 2 && drive > 0.1 && Math.abs(fspeed) < 6) rpm = Math.max(rpm, 1800 + drive * 2200); // clutch slip at launch
    this.shiftTimer -= dt;
    if (this.gear >= 2 && this.shiftTimer <= 0) {
      if (rpm > 5600 && this.gear < GEARS.length - 1) { this.gear++; this.shiftTimer = 0.45; this.onShift?.(1); }
      else if (rpm < 2300 && this.gear > 2) {
        const down = wheelRps * Math.abs(GEARS[this.gear - 1]) * FINAL * (c.radius / REF_RADIUS) * 60 / (2 * Math.PI);
        if (down < 5200) { this.gear--; this.shiftTimer = 0.45; this.onShift?.(-1); }
      }
    }
    this.rpm += (Math.min(REDLINE + 150, rpm) - this.rpm) * Math.min(1, dt * 12);
    const shifting = this.shiftTimer > 0.25;
    const boost = input.boost ? 1.35 : 1;
    const engineForce = shifting ? 0 : torqueAt(this.rpm) * ratio * 0.6 / c.radius * drive * boost * c.power * (c.mass / 1650);
    const dir = this.gear === 0 ? -1 : 1;
    this.throttle = drive;

    // ----- steering: reduced with speed
    const steerLimit = c.maxSteer * (1 / (1 + Math.abs(fspeed) * 0.055));
    this.steerAngle = input.steer * steerLimit;

    // ----- surface grip
    for (let i = 0; i < 4; i++) {
      const surf = this.wheelState[i].surface;
      const grip = surf === 'road' ? 1.05 : surf === 'rock' ? 0.95 : surf === 'field' ? 0.82 : 0.9;
      const hb = input.handbrake && i >= 2;
      ctrl.setWheelFrictionSlip(i, c.frictionSlip * grip * c.grip * (this.weatherGrip ?? 1) * (hb ? 0.55 : 1));
      ctrl.setWheelSideFrictionStiffness(i, c.sideStiffness * (hb ? 0.45 : 1));
    }

    // 4x4 with slight rear bias
    const perWheel = engineForce * dir;
    for (let i = 0; i < 4; i++) {
      ctrl.setWheelEngineForce(i, perWheel * (i < 2 ? 0.42 : 0.58) / 1);
      ctrl.setWheelSteering(i, i < 2 ? this.steerAngle : 0);
      let b = brake * 62 * (c.mass / 1650);
      if (input.handbrake && i >= 2) b = 60 * (c.mass / 1650);
      if (drive < 0.02 && brake === 0 && !input.handbrake) b = 1.2; // engine braking / rolling resistance
      ctrl.setWheelBrake(i, b);
    }

    ctrl.updateVehicle(dt);

    // ----- aero drag & downforce
    const drag = 0.0036 * this.speed;
    body.applyImpulse({ x: -vel.x * drag * c.mass * dt, y: -vel.y * drag * c.mass * dt * 0.2, z: -vel.z * drag * c.mass * dt }, true);

    // ----- air control + self-righting assistance
    const av = body.angvel();
    if (contacts === 0) {
      this.airTime += dt;
      const k = c.mass * 1.6 * dt;
      // pitch with throttle/brake, roll with steer
      body.applyTorqueImpulse({ x: right.x * (wantBack - wantFwd) * k * 1.2 - fwd.x * input.steer * k, y: 0, z: right.z * (wantBack - wantFwd) * k * 1.2 - fwd.z * input.steer * k }, true);
      body.setAngvel({ x: av.x * 0.995, y: av.y * 0.99, z: av.z * 0.995 }, true);
    } else {
      if (this.airTime > 0.35) this.lastLandingImpact = Math.min(1, this.airTime * 0.6 + Math.abs(lv.y) * 0.06);
      if (this.airTime > 0.5 && up.y > 0.5) this.landedAir = this.airTime;
      this.airTime = 0;
      // gentle anti-roll: torque that rotates 'up' towards world up when tilted a lot
      const tilt = _t.copy(up).cross(_y.set(0, 1, 0));
      const strength = up.y < 0.75 ? 1.6 : 0.5;
      const k = c.mass * strength * dt;
      body.applyTorqueImpulse({ x: tilt.x * k, y: 0, z: tilt.z * k }, true);
    }

    // ----- wheel info for effects
    for (let i = 0; i < 4; i++) {
      const ws = this.wheelState[i];
      ws.contact = ctrl.wheelIsInContact(i);
      const side = Math.abs(ctrl.wheelSideImpulse(i) || 0);
      const fwdImp = Math.abs(ctrl.wheelForwardImpulse(i) || 0);
      const lateralSlip = ws.contact ? Math.abs(vel.dot(right)) : 0;
      const wheelspin = ws.contact && drive > 0.6 && Math.abs(fspeed) < 7 ? drive : 0;
      ws.slip = Math.min(1, Math.max(lateralSlip / 7, wheelspin * 0.8, input.handbrake && i >= 2 && this.speed > 3 ? 0.9 : 0, brake > 0.5 && this.speed > 6 ? 0.6 : 0));
      ws.side = side; ws.fwdImp = fwdImp;
      const cp = ctrl.wheelContactPoint(i);
      if (cp) ws.pos.set(cp.x, cp.y, cp.z);
      ws.compression = 1 - (ctrl.wheelSuspensionLength(i) ?? c.suspensionRest) / c.suspensionRest;
      ws.surface = surfaceAt ? surfaceAt(ws.pos.x, ws.pos.z) : 'grass';
    }
    this.odometer += Math.abs(fspeed) * dt;
    this.contacts = contacts;
  }

  // visual sync with interpolation alpha
  sync(alpha) {
    const t = this.body.translation(), r = this.body.rotation();
    if (!this._prevPos) { this._prevPos = new THREE.Vector3(t.x, t.y, t.z); this._prevRot = new THREE.Quaternion(r.x, r.y, r.z, r.w); }
    this._curPos = (this._curPos || new THREE.Vector3()).set(t.x, t.y, t.z);
    this._curRot = (this._curRot || new THREE.Quaternion()).set(r.x, r.y, r.z, r.w);
    this.object.position.lerpVectors(this._prevPos, this._curPos, alpha);
    this.object.quaternion.slerpQuaternions(this._prevRot, this._curRot, alpha);
    const c = this.cfg;
    for (let i = 0; i < 4; i++) {
      const w = this.wheels[i];
      const len = this.ctrl.wheelSuspensionLength(i) ?? c.suspensionRest;
      w.pivot.position.set(w.conn.x, w.conn.y - len, w.conn.z);
      w.pivot.rotation.set(0, i < 2 ? this.steerAngle : 0, 0);
      w.spin.rotation.x = this.ctrl.wheelRotation(i) || 0;
    }
  }

  savePrev() {
    const t = this.body.translation(), r = this.body.rotation();
    if (!this._prevPos) { this._prevPos = new THREE.Vector3(); this._prevRot = new THREE.Quaternion(); }
    this._prevPos.set(t.x, t.y, t.z); this._prevRot.set(r.x, r.y, r.z, r.w);
  }

  gearLabel() { return this.gear === 0 ? 'R' : this.gear === 1 ? 'N' : String(this.gear - 1); }
}

const _q = new THREE.Quaternion(), _f = new THREE.Vector3(), _u = new THREE.Vector3(), _r = new THREE.Vector3();
const _v = new THREE.Vector3(), _t = new THREE.Vector3(), _y = new THREE.Vector3(), _l = new THREE.Vector3();
