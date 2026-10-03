// Seslendirilecek replikleri build/lines.json'a yazar
import fs from 'node:fs';
import { BUILD, loadEpisode } from './ep.mjs';
import { listLines } from '../src/timeline.js';

const episode = await loadEpisode();
const lines = listLines(episode);
fs.writeFileSync(`${BUILD}/lines.json`, JSON.stringify(lines, null, 1));
console.log(`${lines.length} replik -> ${BUILD}/lines.json`);
