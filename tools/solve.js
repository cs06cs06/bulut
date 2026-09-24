global.Matter = require('/tmp/claude-0/-home-user-bulut/28a397ad-ed2e-5791-a8cb-ddd25e39800c/scratchpad/tools/node_modules/matter-js');
const LEVELS = require('../js/levels.js');
const World = require('../js/world.js');
function sim(lv, shots) {
  const w = new World(Matter, lv, {});
  let score = 0;
  w.hooks.killed = b => { const p = b.plugin; if (p.kind === 'pig') score += 5000; if (p.kind === 'block') score += World.MATERIALS[p.mat].score; };
  const N = shots.length;
  const total = 60 * (1 + 6 * N + 2);
  let ab = null;
  for (let i = 0; i < total; i++) {
    const k = Math.floor((i - 30) / 360);
    if (i >= 30 && (i - 30) % 360 === 0 && k < N) {
      const s = shots[k]; const a = s.ang * Math.PI / 180;
      const b = w.spawnBird(lv.birds[k], World.SLING.x, World.SLING.y);
      const v = World.launchVelocity(-Math.cos(a) * s.pull, Math.sin(a) * s.pull);
      w.launch(b, v.x, v.y);
      if (s.t) ab = { b, at: i + s.t };
    }
    if (ab && i === ab.at) { w.activate(ab.b); ab = null; }
    w.step(1 / 60);
  }
  return { pigs: w.pigs.length, score };
}
for (const lv of LEVELS.filter(l => !process.argv[2] || l.id == process.argv[2])) {
  const chosen = [];
  for (let k = 0; k < lv.birds.length; k++) {
    let best = null;
    const ts = (lv.birds[k] === 'red') ? [0] : [25, 40, 55];
    for (let ang = -5; ang <= 60; ang += 5) for (const pull of [60, 75, 88, 95]) for (const t of ts) {
      const r = sim(lv, chosen.concat([{ ang, pull, t }]));
      const val = -r.pigs * 100000 + r.score;
      if (!best || val > best.val) best = { val, ang, pull, t, r };
    }
    chosen.push({ ang: best.ang, pull: best.pull, t: best.t });
    console.log('L' + lv.id, 'bird', k + 1, lv.birds[k], '->', JSON.stringify(best.r), best.ang, best.pull, best.t);
    if (best.r.pigs === 0) break;
  }
}
