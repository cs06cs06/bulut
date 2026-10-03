// Hangi bölümle çalışıldığını belirler: --ep <id> ya da EP ortam değişkeni
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const i = process.argv.indexOf('--ep');
export const EP = i > 0 ? process.argv[i + 1] : process.env.EP || 'yedek-anahtar';
export const BUILD = path.join('build', EP);
export const EPISODE_FILE = path.join('episodes', `${EP}.js`);
if (!fs.existsSync(EPISODE_FILE)) throw new Error(`bölüm bulunamadı: ${EPISODE_FILE}`);
fs.mkdirSync(BUILD, { recursive: true });
export const loadEpisode = () => import(pathToFileURL(path.resolve(EPISODE_FILE)).href);
