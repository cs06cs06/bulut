// Frikik Ustası — global constants.
// Coordinate system: goal line at z = 0, goal centred on x = 0, the pitch extends toward +z.
// +y is up. The shooter looks toward -z.

export const FIELD = {
  goalHalfWidth: 3.66,     // inner post-to-centre distance (7.32 m goal)
  goalHeight: 2.44,        // underside of the crossbar
  postRadius: 0.062,
  netRoofDepth: 1.1,       // how far the flat roof of the net goes back
  netBackDepth: 2.1,       // depth of the net at ground level
  halfWidth: 34,
  length: 105,
  boxDepth: 16.5,
  boxHalfWidth: 20.16,
  sixDepth: 5.5,
  sixHalfWidth: 9.16,
  penaltySpot: 11,
  arcRadius: 9.15,
  wallDistance: 9.15,
};

export const BALL = {
  radius: 0.11,
  mass: 0.43,
};

export const PHYS = {
  gravity: 9.81,
  // quadratic drag: a = -k |v| v, k = 0.5 * rho * Cd * A / m
  dragK: 0.5 * 1.2 * 0.24 * Math.PI * 0.11 * 0.11 / 0.43,
  // Magnus acceleration: a = magnus * (w x v)
  magnus: 0.0085,
  spinDecay: 0.08,          // per second
  groundRestitution: 0.58,
  groundFriction: 0.32,
  rollingResistance: 0.55,  // m/s^2
  postRestitution: 0.72,
  bodyRestitution: 0.32,
  step: 1 / 240,
};

export const DIFFICULTY = [
  // reaction (s), dive speed (m/s), catchable speed (m/s), prediction noise (m), spin read (0..1)
  { reaction: 0.3, dive: 5.3, catchSpeed: 18, noise: 0.42, spinRead: 0.5, wall: 3, wind: 0.0 },
  { reaction: 0.27, dive: 5.7, catchSpeed: 19, noise: 0.34, spinRead: 0.6, wall: 3, wind: 1.5 },
  { reaction: 0.24, dive: 6.1, catchSpeed: 20, noise: 0.27, spinRead: 0.68, wall: 4, wind: 2.5 },
  { reaction: 0.21, dive: 6.5, catchSpeed: 21, noise: 0.21, spinRead: 0.76, wall: 4, wind: 3.5 },
  { reaction: 0.19, dive: 6.9, catchSpeed: 22, noise: 0.16, spinRead: 0.84, wall: 5, wind: 4.5 },
  { reaction: 0.17, dive: 7.2, catchSpeed: 23, noise: 0.12, spinRead: 0.9, wall: 5, wind: 5.5 },
];

// Player-facing difficulty: how much the game helps the shooter and how sharp the
// defence is. Keeper values are offsets/multipliers on top of the DIFFICULTY ladder.
export const ASSIST = {
  easy: {
    label: 'Kolay', guide: 'full', sloppy: 0.2, curveGain: 1.25, minV: 18, maxV: 31,
    snap: 0.9, dip: true, windScale: 0.35, ring: 1.35,
    keeperReaction: 0.14, keeperDive: 0.78, keeperNoise: 0.3, catchSpeed: -3, spinRead: -0.2,
    wallMax: 3, wallJump: 0.55,
  },
  normal: {
    label: 'Normal', guide: 'short', sloppy: 0.6, curveGain: 1.1, minV: 16, maxV: 33,
    snap: 0.35, dip: true, windScale: 0.75, ring: 1.1,
    keeperReaction: 0.05, keeperDive: 0.92, keeperNoise: 0.1, catchSpeed: -1, spinRead: -0.08,
    wallMax: 4, wallJump: 0.85,
  },
  hard: {
    label: 'Zor', guide: 'none', sloppy: 1, curveGain: 1, minV: 12, maxV: 33.5,
    snap: 0, dip: false, windScale: 1, ring: 1,
    keeperReaction: 0, keeperDive: 1, keeperNoise: 0, catchSpeed: 0, spinRead: 0,
    wallMax: 5, wallJump: 1,
  },
};

export const TEAM = {
  home: { shirt: 0xd7263d, shirt2: 0xffffff, shorts: 0xffffff, socks: 0xd7263d, number: 0xffffff },
  away: { shirt: 0x1f3c88, shirt2: 0x7fb2ff, shorts: 0x14244f, socks: 0x1f3c88, number: 0xffffff },
  keeper: { shirt: 0xf2d027, shirt2: 0x151515, shorts: 0x151515, socks: 0xf2d027, number: 0x151515 },
};

export const SUN_TEX_DIR = [0.578, 0.258, -0.775]; // brightest direction in the stadium HDRI
export const ENV_ROTATION = Math.PI;              // rotate the sky so the sun sits behind the shooter
