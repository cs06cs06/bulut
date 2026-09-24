// Headless test: yapılar kendi başına ayakta kalıyor mu? Atışlar hasar veriyor mu?
global.Matter = require('/tmp/claude-0/-home-user-bulut/28a397ad-ed2e-5791-a8cb-ddd25e39800c/scratchpad/tools/node_modules/matter-js');
const LEVELS = require('../js/levels.js');
const World = require('../js/world.js');
function run(lv, shots) {
  const log = { killed: [], dmg: 0 };
  const w = new World(Matter, lv, { killed: b => log.killed.push(b.plugin.kind + ':' + (b.plugin.mat || b.plugin.type)), damaged: (b, d) => log.dmg += d });
  const start = new Map(); w.blocks.concat(w.pigs).forEach(b => start.set(b, { x: b.position.x, y: b.position.y }));
  let t = 0;
  // Uyandırmak için hafif dokunuş: tüm cisimleri uyandır
  w.blocks.concat(w.pigs).forEach(b => Matter.Sleeping.set(b, false));
  const shotQ = (shots || []).slice();
  for (let i = 0; i < 60 * 14; i++) {
    if (shotQ.length && i === shotQ[0].at) {
      const s = shotQ.shift();
      const b = w.spawnBird(s.type || 'red', World.SLING.x, World.SLING.y);
      const v = World.launchVelocity(s.dx, s.dy);
      w.launch(b, v.x, v.y);
      if (s.ability) s._b = b;
      if (s.ability) shotQ.abil = { b, at: i + s.ability };
    }
    if (shotQ.abil && i === shotQ.abil.at) { w.activate(shotQ.abil.b); shotQ.abil = null; }
    w.step(1 / 60);
  }
  let maxMove = 0;
  start.forEach((p, b) => { if (!b.plugin.dead) maxMove = Math.max(maxMove, Math.hypot(b.position.x - p.x, b.position.y - p.y)); });
  return { pigsLeft: w.pigs.length, blocksLeft: w.blocks.length, killed: log.killed, maxMove: maxMove.toFixed(2), settled: w.settled() };
}
for (const lv of LEVELS) {
  console.log('L' + lv.id, 'idle:', JSON.stringify(run(lv)));
}
// Örnek atışlar: farklı çekme açıları
for (const lv of LEVELS) {
  let best = null;
  for (let ang = 10; ang <= 60; ang += 5) for (let pull of [70, 85, 95]) {
    const a = ang * Math.PI / 180;
    const r = run(lv, [{ at: 30, dx: -Math.cos(a) * pull, dy: Math.sin(a) * pull }]);
    const score = lv.pigs.length - r.pigsLeft;
    if (!best || score > best.s) best = { s: score, ang, pull, r };
  }
  console.log('L' + lv.id, 'best single shot kills', best.s, 'ang', best.ang, 'pull', best.pull, best.r.killed.join(','));
}
