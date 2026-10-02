// build/audio-meta.json + episode.js → build/timeline.json
import fs from 'node:fs';
import * as episode from '../src/episode.js';
import { buildTimeline } from '../src/timeline.js';
import { layout } from '../src/layout.js';

const meta = JSON.parse(fs.readFileSync('build/audio-meta.json', 'utf8'));
const tl = buildTimeline(episode, meta, layout);
tl.env = Object.fromEntries(Object.entries(meta).map(([k, v]) => [k, v.env]));
fs.writeFileSync('build/timeline.json', JSON.stringify(tl));
const m = Math.floor(tl.duration / 60), s = Math.round(tl.duration % 60);
console.log(`süre: ${m} dk ${s} sn  (${tl.lines.length} replik, ${tl.scenes.length} sahne, ${tl.sfx.length} efekt)`);
for (const sc of tl.scenes) console.log(`  ${sc.id.padEnd(10)} ${sc.start.toFixed(1).padStart(6)} → ${sc.end.toFixed(1)}`);
