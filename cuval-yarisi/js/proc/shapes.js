// Karakter şekil tanımları (saf JS; Web Worker'da da çalışır).
// Koordinatlar metre; karakter +Z'ye bakar, +X karakterin solu, bağlama pozu hafif A-pozu.
// Kıyafetler katmanlıdır: yelek entarinin üstünde gerçek bir kabuk, V yakanın altında gömlek vardır.
import { sphere, ellipsoid, cone, rbox, torus, compile, inter, diff, union, inflate } from './sdf.js';

// ---------- Bölgeler: shader'da desen ve palet seçimi ----------
export const R = {
  SKIN: 0, DRESS: 1, CHEMISE: 2, VEST: 3, TRIM: 4, SASH: 5, SCARF: 6, OYA: 7, HAIR: 8, LIP: 9,
  FELT: 10, LEATHER: 11, PANTS: 12, COAT: 13, BUTTON: 14, MOUTH: 15, TEETH: 16, TASSEL: 17,
};
// Köşe sahipliği etiketleri (deri ağırlığı için)
export const TAGS = ['spine', 'pelvis', 'clavicle_l', 'clavicle_r', 'upperarm_l', 'upperarm_r', 'lowerarm_l', 'lowerarm_r',
  'thigh_l', 'thigh_r', 'calf_l', 'calf_r', 'foot_l', 'foot_r', 'Head'];
const TI = Object.fromEntries(TAGS.map((t, i) => [t, i]));

// Özel ilkel: herhangi bir fonksiyondan
const fn = (f, box) => ({ f, box });

// ---------- İskelet ----------
function rawPos(sex) {
  return sex === 'm'
    ? { pelvis: 0.98, sp1: 1.07, sp2: 1.18, sp3: 1.3, neck: [0, 1.47, -0.012], head: [0, 1.545, 0], clav: [0.028, 1.44, -0.01], ua: [0.178, 1.43, -0.015], la: [0.228, 1.155, -0.02], hand: [0.264, 0.905, -0.005], thigh: [0.095, 0.94, 0], calf: [0.105, 0.52, 0.005], foot: [0.11, 0.085, -0.015], ball: [0.11, 0.02, 0.1] }
    : { pelvis: 0.95, sp1: 1.03, sp2: 1.13, sp3: 1.24, neck: [0, 1.4, -0.012], head: [0, 1.475, 0], clav: [0.025, 1.37, -0.01], ua: [0.157, 1.36, -0.015], la: [0.207, 1.105, -0.02], hand: [0.242, 0.87, -0.005], thigh: [0.085, 0.91, 0], calf: [0.095, 0.5, 0.005], foot: [0.1, 0.085, -0.015], ball: [0.1, 0.02, 0.09] };
}

export function skeleton(sex) {
  const s = rawPos(sex);
  // bağlama pozu "A": kollar omuz etrafında APOSE kadar dışa açık (sol taraf koordinatında).
  // Böylece kol ile gövde SDF'te kaynaşmaz; animasyon dinlenme pozu kolu yine aşağı sarkıtır.
  const ar = armRot(s.ua);
  s.la = ar(s.la); s.hand = ar(s.hand);
  const mir = (v) => [-v[0], v[1], v[2]];
  const B = [
    ['root', null, [0, 0, 0]],
    ['pelvis', 'root', [0, s.pelvis, 0]],
    ['spine_01', 'pelvis', [0, s.sp1, 0]],
    ['spine_02', 'spine_01', [0, s.sp2, 0]],
    ['spine_03', 'spine_02', [0, s.sp3, 0]],
    ['neck_01', 'spine_03', s.neck],
    ['Head', 'neck_01', s.head],
    ['scarf_tail', 'Head', [0, s.head[1] - 0.06, -0.09]],
  ];
  for (const [sfx, f] of [['l', (v) => v], ['r', mir]]) {
    B.push([`clavicle_${sfx}`, 'spine_03', f(s.clav)], [`upperarm_${sfx}`, `clavicle_${sfx}`, f(s.ua)], [`lowerarm_${sfx}`, `upperarm_${sfx}`, f(s.la)],
      [`hand_${sfx}`, `lowerarm_${sfx}`, f(s.hand)], [`thigh_${sfx}`, 'pelvis', f(s.thigh)], [`calf_${sfx}`, `thigh_${sfx}`, f(s.calf)],
      [`foot_${sfx}`, `calf_${sfx}`, f(s.foot)], [`ball_${sfx}`, `foot_${sfx}`, f(s.ball)]);
  }
  return { bones: B, pos: s, ar };
}

export const APOSE = 0.5;
function armRot(c) {
  const ca = Math.cos(APOSE), sa = Math.sin(APOSE);
  return (v) => { const x = v[0] - c[0], y = v[1] - c[1]; return [c[0] + x * ca - y * sa, c[1] + x * sa + y * ca, v[2]]; };
}

// ---------- Baş (Head kemiğine göre yerel) ----------
// Gözler: merkez (±0.03, 0.087, 0.061), yarıçap 0.0122 (kadın); erkekte ×1.05
export const EYE = { x: 0.03, y: 0.087, z: 0.061, r: 0.0122 };
export const MOUTH = { y: 0.038, w: 0.019 };

function headCore(m, v) {
  const S = m ? 1.05 : 1;
  const sc = (a) => a.map((x) => x * S);
  const round = v.round ?? 0;
  const cranium = ellipsoid(sc([0, 0.105, -0.012]), sc([0.074, 0.088, 0.09]));
  const parts = [
    { s: cranium, region: R.SKIN },
    { s: ellipsoid(sc([0, 0.07, 0.02]), sc([0.059 + round * 0.006, 0.08, 0.068])), k: 0.024, region: R.SKIN },
    { s: ellipsoid(sc([0, 0.035, 0.026]), sc([(m ? 0.056 : 0.049) + round * 0.007, m ? 0.045 : 0.042, m ? 0.055 : 0.052])), k: 0.03, region: R.SKIN },
    { s: ellipsoid(sc([0, 0.007, 0.058]), sc([m ? 0.021 : 0.017, m ? 0.017 : 0.015, m ? 0.016 : 0.014])), k: 0.02, region: R.SKIN },
    // elmacık kemikleri ve alt göz kapağı kabarıklığı
    ...[1, -1].flatMap((sx) => [
      { s: ellipsoid(sc([sx * 0.041, 0.069, 0.051]), sc([0.018 + round * 0.004, 0.014, 0.016])), k: 0.02, region: R.SKIN },
      { s: ellipsoid(sc([sx * 0.028, 0.104, 0.07]), sc([0.02, m ? 0.009 : 0.0065, 0.011])), k: 0.015, region: R.SKIN }, // kaş kemeri
    ]),
    // burun
    { s: cone(sc([0, 0.1, 0.0785]), sc([0, 0.0665, 0.0935 + (m ? 0.003 : 0)]), (m ? 0.0066 : 0.0054) * S, (m ? 0.0088 : 0.0074) * S), k: 0.01, region: R.SKIN },
    { s: sphere(sc([0, 0.0615, 0.095 + (m ? 0.004 : 0)]), (m ? 0.0108 : 0.0094) * S), k: 0.008, region: R.SKIN },
    ...[1, -1].map((sx) => ({ s: sphere(sc([sx * 0.0105, 0.0575, 0.0865]), (m ? 0.0074 : 0.0064) * S), k: 0.006, region: R.SKIN })),
    ...[1, -1].map((sx) => ({ s: sphere(sc([sx * 0.0062, 0.0532, 0.091]), 0.0024 * S), op: 'sub', k: 0.0025 })),
    // göz: çukur oyulur, göz küresini saran kapak kabuğu eklenir, badem biçimli yarık açılır
    ...[1, -1].map((sx) => ({ s: ellipsoid(sc([sx * EYE.x, EYE.y + 0.0005, 0.075]), sc([0.0195, 0.0145, 0.0115])), op: 'sub', k: 0.009 })),
    ...[1, -1].map((sx) => ({ s: sphere(sc([sx * EYE.x, EYE.y, EYE.z]), (EYE.r + 0.0019) * S), k: 0.0055, region: R.SKIN })),
    ...[1, -1].map((sx) => ({ s: ellipsoid(sc([sx * EYE.x, EYE.y - 0.0003, EYE.z + EYE.r + 0.0012]), sc([0.0119, 0.0053, 0.0072]), [0, 0, sx * 0.11]), op: 'sub', k: 0.0013 })),
    // üst dudak oluğu ve dudak yatağı
    { s: cone(sc([0, 0.0525, 0.0878]), sc([0, 0.0445, 0.0885]), 0.0021 * S, 0.0026 * S), op: 'sub', k: 0.004 },
    { s: ellipsoid(sc([0, MOUTH.y, 0.083]), sc([0.023, 0.0125, 0.0035])), op: 'sub', k: 0.004, id: 'recess' }, // ağız yaması yatağı
    // boyun
    { s: cone(sc([0, -0.135, -0.018]), sc([0, 0.04, -0.01]), (m ? 0.05 : 0.042) * S, (m ? 0.045 : 0.038) * S), k: 0.03, region: R.SKIN },
  ];
  return { parts, cranium, S, sc };
}

export function headOps(face, v = {}) {
  const m = face === 'm';
  const { parts, cranium, S, sc } = headCore(m, v);
  const o = parts.map((p) => ({ ...p, bone: 'Head' }));
  if (m) {
    for (const sx of [1, -1]) o.push({ s: ellipsoid(sc([sx * 0.077, 0.08, -0.006]), sc([0.0105, 0.024, 0.016]), [0, sx * 0.3, 0]), k: 0.005, region: R.SKIN, bone: 'Head' });
    // kısa saç: ense ve şakaklar (fesin altında kalan kısım), kafatasına oturan ince kabuk
    o.push({ s: inter(inflate(cranium, 0.0062 * S), fn((x, y, z) => Math.max(0.066 * S - y, z - 0.012 * S - Math.max(0, y - 0.085 * S) * 1.1), cranium.box), 0.005), k: 0.004, region: R.HAIR, pri: 2, bone: 'Head' });
    // pala bıyık
    for (const sx of [1, -1]) {
      o.push({ s: cone(sc([sx * 0.003, 0.0485, 0.0915]), sc([sx * 0.02, 0.0445, 0.0865]), 0.0047 * S, 0.0043 * S), k: 0.004, region: R.HAIR, pri: 3, bone: 'Head' });
      o.push({ s: cone(sc([sx * 0.02, 0.0445, 0.0865]), sc([sx * 0.034, 0.047 + (v.beard ? -0.006 : 0.004), 0.077]), 0.0043 * S, 0.002 * S), k: 0.004, region: R.HAIR, pri: 3, bone: 'Head' });
    }
    if (v.beard) {
      const jaw = union([ellipsoid(sc([0, 0.03, 0.03]), sc([0.06, 0.046, 0.058])), ellipsoid(sc([0, 0.0, 0.055]), sc([0.03, 0.03, 0.026]))], 0.02);
      const beard = diff(inter(inflate(jaw, 0.0065), fn((x, y, z) => Math.max(y - 0.064 * S, -z - 0.005), jaw.box), 0.006),
        union([ellipsoid(sc([0, MOUTH.y, 0.09]), sc([0.023, 0.009, 0.03])), ellipsoid(sc([0, 0.062, 0.06]), sc([0.03, 0.022, 0.05]))], 0.006), 0.004);
      o.push({ s: beard, k: 0.004, region: R.HAIR, pri: 2, bone: 'Head' });
    }
  } else {
    // başörtüsünün altından alına düşen perçem
    o.push({ s: inter(inflate(cranium, 0.0045), fn((x, y, z) => Math.max(0.146 - y, 0.036 - z), cranium.box), 0.004), k: 0.003, region: R.HAIR, pri: 2, bone: 'Head' });
  }
  return o;
}

// ---------- Başörtüsü (yemeni) ----------
export const SCARF_WIN = { c: [0, 0.063, 0.1], r: [0.061, 0.076, 0.08] };
export function scarfOps(t = 0.009) {
  const W = SCARF_WIN;
  return [
    { s: ellipsoid([0, 0.1, -0.012], [0.078 + t, 0.093 + t, 0.094 + t]), region: R.SCARF },
    { s: ellipsoid([0, 0.1, -0.012], [0.078, 0.093, 0.094]), op: 'sub', k: 0.002 },
    { s: ellipsoid(W.c, W.r), op: 'sub', k: 0.006 },                                        // yüz açıklığı
    { s: ellipsoid([0, -0.04, -0.014], [0.072, 0.058, 0.074]), k: 0.025, region: R.SCARF }, // boyuna sarılan kısım
    { s: ellipsoid([0, -0.052, -0.014], [0.047, 0.065, 0.051]), op: 'sub', k: 0.01 },        // boynun geçtiği delik
    { s: ellipsoid([0, -0.1, -0.09], [0.1, 0.115, 0.038], [0.2, 0, 0]), k: 0.03, region: R.SCARF }, // sırta sarkan uç
    { s: torus([0, 0.15, 0.014], 0.074, 0.0085, [0.25, 0, 0], 1), k: 0.006, region: R.SCARF, pri: 1 }, // saç çizgisinde katlanmış kenar
  ].map((o) => ({ ...o, bone: 'Head' }));
}
export function scarfEdge(p) {
  const W = SCARF_WIN;
  const q = Math.hypot((p[0] - W.c[0]) / W.r[0], (p[1] - W.c[1]) / W.r[1], (p[2] - W.c[2]) / W.r[2]);
  return Math.abs(q - 1) * 0.07;
}

// ---------- Fes ----------
export function fezOps() {
  return [
    { s: cone([0, 0.147, -0.01], [0, 0.248, -0.02], 0.09, 0.07), region: R.FELT },
    { s: ellipsoid([0, 0.105, -0.012], [0.077, 0.091, 0.093]), op: 'sub', k: 0.004 },
    { s: torus([0, 0.152, -0.01], 0.093, 0.0055, [-0.06, 0, 0]), k: 0.004, region: R.FELT },   // alt kenar bandı
    { s: cone([0, 0.247, -0.02], [0, 0.257, -0.022], 0.012, 0.006), k: 0.004, region: R.TASSEL },
    { s: cone([0, 0.253, -0.022], [0.03, 0.214, -0.08], 0.004, 0.004), k: 0.004, region: R.TASSEL },
    { s: cone([0.03, 0.214, -0.08], [0.04, 0.152, -0.096], 0.006, 0.015), k: 0.008, region: R.TASSEL },
  ].map((o) => ({ ...o, bone: 'Head' }));
}

// ---------- Eller (bilek kökenli yerel; parmaklar -Y, avuç -X, başparmak +Z) ----------
export function handOps(grip = 0.2, side = 1, S = 1) {
  const o = [];
  const X = (v) => [v[0] * side * S, v[1] * S, v[2] * S];
  const add = (s, k) => o.push({ s, k, region: R.SKIN, bone: 'Head' });
  add(cone(X([0, 0.02, 0]), X([0, -0.025, 0]), 0.0235 * S, 0.0225 * S), 0);
  add(rbox(X([0.002, -0.05, 0.002]), [0.011 * S, 0.032 * S, 0.031 * S], 0.0105 * S), 0.012);
  const fingers = [[0.023, 0.07], [0.0075, 0.078], [-0.0075, 0.073], [-0.022, 0.059]];
  for (const [fz, len] of fingers) {
    let px = 0.0, py = -0.081, ang = 0;
    const segs = [len * 0.42, len * 0.32, len * 0.26];
    for (let k = 0; k < 3; k++) {
      ang += grip * (k === 0 ? 0.9 : 1.15);
      const nx = px - Math.sin(ang) * segs[k], ny = py - Math.cos(ang) * segs[k];
      add(cone(X([px, py, fz]), X([nx, ny, fz * (1 - k * 0.04)]), (0.0084 - k * 0.0011) * S, (0.0075 - k * 0.0011) * S), 0.004);
      px = nx; py = ny;
    }
  }
  const t0 = [-0.004, -0.03, 0.029], t1 = [-0.01 - grip * 0.012, -0.057, 0.046 - grip * 0.004], t2 = [-0.018 - grip * 0.02, -0.079 + grip * 0.004, 0.049 - grip * 0.014];
  add(cone(X(t0), X(t1), 0.0108 * S, 0.0093 * S), 0.008);
  add(cone(X(t1), X(t2), 0.009 * S, 0.0073 * S), 0.004);
  return o;
}

// ---------- Gövde ----------
// o: { sex, build, belly, outfit: 'entari'|'villager'|'coat'|'uniform', skirt: 'narrow'|'long' }
export function bodyOps(o) {
  const m = o.sex === 'm', b = o.build ?? 1, belly = o.belly ?? 0;
  const { pos: s, ar } = skeleton(o.sex);
  const ops = [];
  const add = (sh, region, k, bone, pri = 0, aux = null) => ops.push({ s: sh, region, k, bone, pri, aux });
  const X = (v, sx) => [v[0] * sx, v[1], v[2]];
  // gövde çekirdeği
  const T = m
    ? union([
      ellipsoid([0, 1.3, -0.006], [0.148 * b, 0.12, 0.094 * b]),
      ellipsoid([0, 1.125, 0.006 + belly * 0.02], [0.128 * b + belly * 0.03, 0.115, 0.09 * b + belly * 0.05]),
      ellipsoid([0, 0.985, -0.004], [0.142 * b + belly * 0.02, 0.1, 0.1 * b + belly * 0.02]),
      ...[1, -1].map((sx) => cone([0, 1.445, -0.022], X([0.14, 1.43, -0.016], sx), 0.045, 0.045)),
    ], 0.06)
    : union([
      ellipsoid([0, 1.25, -0.005], [0.126 * b, 0.112, 0.086 * b]),
      ellipsoid([0, 1.085, 0], [0.104 * b, 0.105, 0.079 * b]),
      ellipsoid([0, 0.95, -0.005], [0.148 * b, 0.1, 0.104 * b]),
      ...[1, -1].map((sx) => sphere(X([0.048 * b, 1.218, 0.05 * b], sx), 0.046 * (0.9 + 0.1 * b))),
      ...[1, -1].map((sx) => cone([0, 1.372, -0.02], X([0.12, 1.355, -0.015], sx), 0.04, 0.04)),
    ], 0.055);
  const shoulderR = m ? 0.058 : 0.05;
  const SH = [1, -1].map((sx) => sphere(X([m ? 0.155 : 0.13 * (0.8 + 0.2 * b), m ? 1.415 : 1.345, m ? -0.014 : -0.012], sx), shoulderR));
  const torsoReg = m ? (o.outfit === 'villager' ? R.CHEMISE : R.COAT) : R.DRESS;

  if (!m) {
    // entari: önde V yaka, altında gömlek
    const vcut = fn((x, y, z) => Math.max(0.02 - z, Math.abs(x) - (0.008 + (y - 1.255) * 0.42), 1.255 - y), T.box);
    add(diff(T, vcut, 0.004), R.DRESS, 0, 'spine');
    add(inflate(T, -0.007), R.CHEMISE, 0, 'spine', -1);
  } else add(T, torsoReg, 0, 'spine');
  SH.forEach((sh, i) => add(sh, torsoReg, 0.05, i === 0 ? 'clavicle_l' : 'clavicle_r'));

  // yelek / cepken: gövdenin üstünde ayrı bir kabuk, önü açık; kenar uzaklığı sırma için aux'ta
  if (!m || o.outfit === 'villager') {
    const y0 = m ? 1.08 : 1.065, y1 = m ? 1.455 : 1.385, wTorso = m ? 0.158 * b : 0.134 * (0.8 + 0.2 * b);
    const open = (y) => (m ? 0.03 + Math.max(0, y - 1.15) * 0.18 : 0.034 + Math.max(0, y - 1.12) * 0.22);
    const mask = (x, y, z) => Math.max(y0 - y, y - y1, Math.abs(x) - wTorso, z > 0.005 ? open(y) - Math.abs(x) : -1);
    const vest = inter(inflate(T, m ? 0.006 : 0.005), fn(mask, T.box), 0.002);
    add(vest, R.VEST, 0.003, 'spine', 2, (p) => -mask(p[0], p[1], p[2]));
  }

  // yaka
  const collarReg = o.outfit === 'coat' ? R.COAT : o.outfit === 'uniform' ? R.TRIM : R.CHEMISE;
  add(cone([0, s.neck[1] - 0.042, -0.012], [0, s.neck[1] + 0.006, -0.014], m ? 0.062 : 0.053, m ? 0.056 : 0.048), collarReg, 0.02, 'spine', 1);

  // kollar (bilek noktaları dinlenme kolunda tanımlanıp A pozuna döndürülür)
  const bb = 0.85 + 0.15 * b;
  const h0 = rawPos(o.sex).hand;
  const unA = (d) => [h0[0] + d[0], h0[1] + d[1], h0[2]];
  for (const sx of [1, -1]) {
    const L = sx > 0 ? 'l' : 'r';
    const ua = X(s.ua, sx), la = X(s.la, sx), wr = X(ar(unA([-0.006, 0.03])), sx);
    if (m) {
      const sl = o.outfit === 'villager' ? R.CHEMISE : R.COAT;
      add(cone(ua, la, 0.052 * bb, 0.044), sl, 0.03, `upperarm_${L}`);
      add(cone(la, wr, o.outfit === 'villager' ? 0.046 : 0.042, o.outfit === 'villager' ? 0.05 : 0.04), sl, 0.02, `lowerarm_${L}`);
      if (o.outfit !== 'villager') add(cone(X(ar(unA([-0.004, 0.052])), sx), wr, 0.0435, 0.043), o.outfit === 'uniform' ? R.TRIM : R.COAT, 0.004, `lowerarm_${L}`, 2);
    } else {
      add(cone(ua, la, 0.047 * bb, 0.04), R.DRESS, 0.03, `upperarm_${L}`);
      add(cone(la, wr, 0.04, 0.052), R.CHEMISE, 0.02, `lowerarm_${L}`, 1);
      add(torus(la, 0.041, 0.0048, [0, 0, sx * (0.19 + APOSE)]), R.TRIM, 0.004, `lowerarm_${L}`, 3); // dirsekte sırma şerit
    }
  }

  // kuşak (+ önde düğüm ve sarkan uçlar)
  if (m) {
    const bw = o.outfit === 'villager' ? 0 : 0.012; // redingot kemeri eteğin üstünde kalsın
    add(ellipsoid([0, 1.035, 0.004 + belly * 0.02], [0.142 * b + belly * 0.03 + bw, o.outfit === 'villager' ? 0.07 : 0.03, 0.104 * b + belly * 0.05 + bw]),
      o.outfit === 'coat' ? R.LEATHER : R.SASH, 0.012, 'spine', 3);
  } else {
    add(ellipsoid([0, 1.04, 0], [0.116 * b, 0.037, 0.087 * b]), R.SASH, 0.012, 'spine', 3);
    add(sphere([0.045 * b, 1.036, 0.083 * b], 0.016), R.SASH, 0.008, 'spine', 4);
    add(ellipsoid([0.052 * b, 0.975, 0.088 * b], [0.017, 0.055, 0.008], [0.05, 0, -0.12]), R.SASH, 0.01, 'pelvis', 4);
    add(ellipsoid([0.034 * b, 0.985, 0.091 * b], [0.015, 0.045, 0.007], [0.05, 0, 0.1]), R.SASH, 0.01, 'pelvis', 4);
  }
  if (o.outfit === 'uniform') add(ellipsoid([0, 1.24, 0.0], [0.2, 0.028, 0.116], [0, 0, 0.62]), R.SASH, 0.008, 'spine', 3);

  // alt gövde
  if (!m) {
    if (o.skirt === 'long') {
      add(cone([0, 0.97, -0.004], [0, 0.04, 0], 0.15 * b, 0.27), R.DRESS, 0.05, 'pelvis');
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2 + 0.3;
        add(cone([Math.sin(a) * 0.15, 0.62, Math.cos(a) * 0.12], [Math.sin(a) * 0.255, 0.05, Math.cos(a) * 0.255], 0.03, 0.055), R.DRESS, 0.05, 'pelvis');
      }
      for (const sx of [1, -1]) add(rbox(X([0.07, 0.03, 0.17], sx), [0.032, 0.026, 0.05], 0.022), R.LEATHER, 0.01, sx > 0 ? 'foot_l' : 'foot_r', 2);
    } else {
      add(cone([0, 0.97, -0.004], [0, 0.08, 0], 0.148 * b, 0.168), R.DRESS, 0.05, 'pelvis');
    }
  } else if (o.outfit === 'villager') {
    add(ellipsoid([0, 0.79, -0.004], [0.17 * b, 0.22, 0.125 * b]), R.PANTS, 0.05, 'pelvis');
    for (const sx of [1, -1]) {
      const L = sx > 0 ? 'l' : 'r';
      add(cone(X([0.11, 0.86, 0], sx), X([0.115, 0.42, 0.005], sx), 0.11, 0.09), R.PANTS, 0.06, `thigh_${L}`);
      add(cone(X([0.108, 0.44, 0.005], sx), X([0.11, 0.1, -0.01], sx), 0.056, 0.046), R.LEATHER, 0.03, `calf_${L}`, 1);
      add(rbox(X([0.11, 0.045, 0.045], sx), [0.042, 0.038, 0.1], 0.032), R.LEATHER, 0.03, `foot_${L}`, 1);
    }
  } else {
    add(cone([0, 0.99, -0.004], [0, 0.53, -0.008], 0.15 * b + belly * 0.03, 0.19 * b), R.COAT, 0.06, 'pelvis');
    for (const sx of [1, -1]) {
      const L = sx > 0 ? 'l' : 'r';
      add(cone(X([0.1, 0.62, 0], sx), X([0.105, 0.1, -0.008], sx), 0.066, 0.056), R.PANTS, 0.04, `calf_${L}`);
      add(rbox(X([0.106, 0.042, 0.04], sx), [0.04, 0.034, 0.1], 0.03), R.LEATHER, 0.03, `foot_${L}`, 1);
    }
  }
  // düğmeler (ön orta çizgide). Redingot düğmeleri gölgelendiricide çizilir.
  if (m && o.outfit !== 'villager') {
    if (o.outfit === 'uniform') add(rbox([0, 1.0, 0.0], [0.011, 0.42, 0.2], 0.004), R.TRIM, 0, 'spine', -2);
  } else if (!m) {
    for (let y = 1.09; y <= 1.25; y += 0.04) {
      const zf = 0 + 0.079 * b * Math.sqrt(Math.max(0, 1 - ((y - 1.085) / 0.105) ** 2));
      const zz = y > 1.17 ? -0.005 + 0.086 * b * Math.sqrt(Math.max(0, 1 - ((y - 1.25) / 0.112) ** 2)) : zf;
      add(sphere([0, y, Math.max(zf, zz) + 0.003], 0.0055), R.BUTTON, 0.002, 'spine', 6);
    }
  }
  return ops;
}

// Sınır kutuları
export function bodyBounds(o) {
  const m = o.sex === 'm';
  const w = m ? 0.57 : 0.53; // A pozundaki kollar dahil
  return [-w, -0.01, -0.2, w, m ? 1.52 : 1.45, o.skirt === 'long' ? 0.32 : 0.2];
}
export const HEAD_BOUNDS = [-0.105, -0.15, -0.135, 0.105, 0.215, 0.135];
export const SCARF_BOUNDS = [-0.115, -0.24, -0.15, 0.115, 0.225, 0.13];
export const FEZ_BOUNDS = [-0.11, 0.125, -0.13, 0.11, 0.29, 0.1];
export const HAND_BOUNDS = (side, S = 1) => [side > 0 ? -0.035 * S : -0.04 * S, -0.15 * S, -0.04 * S, side > 0 ? 0.04 * S : 0.035 * S, 0.03 * S, 0.075 * S];

// Bölge sınırı yumuşatma: farklı bölgedeki komşusu olan köşeleri, iki şeklin eşit uzaklıkta olduğu
// analitik sınıra (yüzey üzerinde kalarak) kaydırır. Izgaradan gelen basamaklar pürüzsüz çizgiye dönüşür.
function relaxBoundaries(g, owners, f, h) {
  const n = g.positions.length / 3, P = g.positions, I = g.indices;
  const other = new Array(n).fill(null);
  for (let t = 0; t < I.length; t += 3) {
    for (let k = 0; k < 3; k++) {
      const a = I[t + k], b = I[t + (k + 1) % 3];
      const oa = owners[a], ob = owners[b];
      if (!oa || !ob || oa.region === ob.region) continue;
      if (!other[a]) other[a] = ob;
      if (!other[b]) other[b] = oa;
    }
  }
  const e = h * 0.25;
  const gfun = (own, oth, x, y, z) => (own.s.f(x, y, z) - (own.pri ?? 0) * 0.004) - (oth.s.f(x, y, z) - (oth.pri ?? 0) * 0.004);
  for (let it = 0; it < 4; it++) {
    for (let i = 0; i < n; i++) {
      const oth = other[i]; if (!oth) continue;
      const own = owners[i];
      let x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
      const gv = gfun(own, oth, x, y, z);
      // g'nin gradyanı ve yüzey normali
      let gx = (gfun(own, oth, x + e, y, z) - gfun(own, oth, x - e, y, z)) / (2 * e);
      let gy = (gfun(own, oth, x, y + e, z) - gfun(own, oth, x, y - e, z)) / (2 * e);
      let gz = (gfun(own, oth, x, y, z + e) - gfun(own, oth, x, y, z - e)) / (2 * e);
      let nx = f(x + e, y, z) - f(x - e, y, z), ny = f(x, y + e, z) - f(x, y - e, z), nz = f(x, y, z + e) - f(x, y, z - e);
      const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
      const dn = gx * nx + gy * ny + gz * nz;
      gx -= dn * nx; gy -= dn * ny; gz -= dn * nz;
      const g2 = gx * gx + gy * gy + gz * gz;
      if (g2 < 1e-8) continue;
      // sınırın biraz kendi tarafında dur (bölge değişmesin)
      let step = (gv + h * 0.04) / g2;
      const mag = Math.sqrt(g2) * Math.abs(step);
      if (mag > h * 0.6) step *= (h * 0.6) / mag;
      x -= gx * step; y -= gy * step; z -= gz * step;
      const d = f(x, y, z);
      x -= nx * d; y -= ny * d; z -= nz * d;
      P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z;
    }
  }
}

// Bir parçayı üret (worker veya ana iş parçacığı). simplify: isteğe bağlı sadeleştirici (meshoptimizer)
export function buildPart(job, meshFn, simplify = null) {
  let ops, bounds, auxFn = null;
  if (job.kind === 'head') { ops = headOps(job.face, job.v); bounds = HEAD_BOUNDS.map((x) => x * (job.face === 'm' ? 1.06 : 1)); }
  else if (job.kind === 'scarf') { ops = scarfOps(job.thick); bounds = SCARF_BOUNDS; auxFn = scarfEdge; }
  else if (job.kind === 'fez') { ops = fezOps(); bounds = FEZ_BOUNDS; }
  else if (job.kind === 'hand') { ops = handOps(job.grip, job.side, job.S); bounds = HAND_BOUNDS(job.side, job.S); }
  else { ops = bodyOps(job.o); bounds = bodyBounds(job.o); }
  const sdf = compile(ops);
  let g = meshFn(sdf.f, bounds, job.h);
  let n = g.positions.length / 3;
  let region = new Float32Array(n), aux = new Float32Array(n), tag = new Float32Array(n);
  const owners = new Array(n);
  for (let i = 0; i < n; i++) owners[i] = sdf.owner(g.positions[i * 3], g.positions[i * 3 + 1], g.positions[i * 3 + 2]);
  relaxBoundaries(g, owners, sdf.f, job.h);
  for (let i = 0; i < n; i++) {
    const x = g.positions[i * 3], y = g.positions[i * 3 + 1], z = g.positions[i * 3 + 2];
    const own = owners[i];
    region[i] = own ? own.region : 0;
    tag[i] = own && own.bone ? TI[own.bone] ?? 0 : 0;
    aux[i] = auxFn ? auxFn([x, y, z]) : own && own.aux ? own.aux([x, y, z]) : 0;
  }
  // yüksek çözünürlüklü heykeli hedef üçgen sayısına indir; bölge sınırları ve normaller korunur
  if (simplify && job.tris && g.indices.length / 3 > job.tris) {
    const attr = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { attr[i * 4] = g.normals[i * 3]; attr[i * 4 + 1] = g.normals[i * 3 + 1]; attr[i * 4 + 2] = g.normals[i * 3 + 2]; attr[i * 4 + 3] = region[i]; }
    const idx = simplify(g.indices, g.positions, attr, job.tris * 3, job.err);
    // kullanılan köşeleri sıkıştır
    const remap = new Int32Array(n).fill(-1);
    let m = 0;
    for (let k = 0; k < idx.length; k++) if (remap[idx[k]] < 0) remap[idx[k]] = m++;
    const P = new Float32Array(m * 3), N = new Float32Array(m * 3), Rg = new Float32Array(m), A = new Float32Array(m), Tg = new Float32Array(m);
    for (let i = 0; i < n; i++) {
      const j = remap[i]; if (j < 0) continue;
      P.set(g.positions.subarray(i * 3, i * 3 + 3), j * 3); N.set(g.normals.subarray(i * 3, i * 3 + 3), j * 3);
      Rg[j] = region[i]; A[j] = aux[i]; Tg[j] = tag[i];
    }
    const I = new Uint32Array(idx.length);
    for (let k = 0; k < idx.length; k++) I[k] = remap[idx[k]];
    g = { positions: P, normals: N, indices: I }; region = Rg; aux = A; tag = Tg;
  }
  return { ...g, region, aux, tag };
}
