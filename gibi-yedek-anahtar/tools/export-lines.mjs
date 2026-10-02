// Seslendirilecek replikleri build/lines.json'a yazar
import fs from 'node:fs';
import * as episode from '../src/episode.js';
import { listLines } from '../src/timeline.js';

fs.mkdirSync('build', { recursive: true });
const lines = listLines(episode);
fs.writeFileSync('build/lines.json', JSON.stringify(lines, null, 1));
console.log(`${lines.length} replik -> build/lines.json`);
