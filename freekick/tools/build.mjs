// Builds a single-page version of the game for hosts that only run inline scripts
// (strict Content-Security-Policy, artifact viewers, some static hosts).
//
//   npm run build  ->  dist/index.html      full document, JS + CSS + fonts inlined
//                      dist/artifact.html   same content without <html>/<head>/<body>
//                      dist/assets/...      textures, sky, sounds, model (+ xbot.gltf.json
//                                           for hosts that refuse .glb)
//                      dist/single.html     everything (assets too) inside one HTML file
//                      dist/single-artifact.html   the same as a body fragment
//
// dist/ is self-contained: upload the folder to any static host. single.html needs
// nothing else at all, which suits sandboxed viewers that block every other request.
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist');
fs.mkdirSync(path.join(out, 'assets', 'models'), { recursive: true });

// the game imports three the same way the import map maps it
const threeResolver = {
  name: 'three-vendor',
  setup(b) {
    b.onResolve({ filter: /^three$/ }, () => ({ path: path.join(root, 'vendor/three/build/three.module.js') }));
    b.onResolve({ filter: /^three\/addons\// }, (a) => ({ path: path.join(root, 'vendor/three/examples/jsm', a.path.slice('three/addons/'.length)) }));
  },
};

const result = await build({
  entryPoints: [path.join(root, 'js/main.js')],
  bundle: true,
  format: 'iife',
  minify: true,
  target: ['es2020'],
  plugins: [threeResolver],
  write: false,
  legalComments: 'none',
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

// CSS with the fonts embedded as data URIs (font-src is often limited to data:)
let css = fs.readFileSync(path.join(root, 'css/style.css'), 'utf8');
css = css.replace(/url\(\.\.\/assets\/fonts\/([^)]+)\)/g, (_, f) => {
  const b64 = fs.readFileSync(path.join(root, 'assets/fonts', f)).toString('base64');
  return `url(data:font/woff2;base64,${b64})`;
});

let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
html = html.replace('<link rel="stylesheet" href="css/style.css">', () => `<style>\n${css}\n</style>`);
html = html.replace(/<script type="importmap">[\s\S]*?<\/script>\s*/, '');
html = html.replace('<script type="module" src="js/main.js"></script>', () => `<script>\n${js}\n</script>`);
fs.writeFileSync(path.join(out, 'index.html'), html);

// fragment for hosts that wrap the page in their own document skeleton
const fragment = html
  .replace(/<!doctype html>\s*/i, '')
  .replace(/<\/?html[^>]*>\s*/gi, '')
  .replace(/<\/?head>\s*/gi, '')
  .replace(/<\/?body>\s*/gi, '')
  .replace(/<meta charset="utf-8">\s*/i, '')
  .replace(/<meta name="viewport"[^>]*>\s*/i, '');
fs.writeFileSync(path.join(out, 'artifact.html'), fragment);

// .glb -> glTF JSON with the binary buffer embedded
const glb = fs.readFileSync(path.join(root, 'assets/models/xbot.glb'));
let off = 12, json = null, bin = null;
while (off < glb.readUInt32LE(8)) {
  const len = glb.readUInt32LE(off), type = glb.readUInt32LE(off + 4);
  const chunk = glb.subarray(off + 8, off + 8 + len);
  if (type === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8'));
  else if (type === 0x004e4942) bin = chunk;
  off += 8 + len;
}
json.buffers[0].uri = 'data:application/octet-stream;base64,' + bin.toString('base64');
fs.writeFileSync(path.join(out, 'assets/models/xbot.gltf.json'), JSON.stringify(json));

// copy the runtime assets so dist/ can be deployed on its own
for (const dir of ['audio', 'textures', 'sky', 'models']) {
  fs.cpSync(path.join(root, 'assets', dir), path.join(out, 'assets', dir), { recursive: true });
}

// fully self-contained variant: assets as base64 blocks the loader reads directly
const EMBED = [
  'models/xbot.glb', 'sky/stadium_01_bg_2k.jpg',
  'textures/grass_color.jpg', 'textures/grass_normal.jpg', 'textures/grass_rough.jpg',
  ...fs.readdirSync(path.join(root, 'assets/audio')).filter((f) => f.endsWith('.mp3')).map((f) => 'audio/' + f),
];
const blocks = EMBED.map((p) => `<script type="text/x-asset" data-path="${p}">${fs.readFileSync(path.join(root, 'assets', p)).toString('base64')}</script>`).join('\n');
const withAssets = (doc) => doc.replace('<div id="app"', () => `${blocks}\n<div id="app"`);
fs.writeFileSync(path.join(out, 'single.html'), withAssets(html));
fs.writeFileSync(path.join(out, 'single-artifact.html'), withAssets(fragment));

const kb = (f) => (fs.statSync(path.join(out, f)).size / 1024).toFixed(0) + ' KB';
console.log('dist/index.html', kb('index.html'));
console.log('dist/artifact.html', kb('artifact.html'));
console.log('dist/assets/models/xbot.gltf.json', kb('assets/models/xbot.gltf.json'));
console.log('dist/single.html', kb('single.html'));
