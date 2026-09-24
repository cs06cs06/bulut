// Sunucuyu + arayüzü tek bir çalıştırılabilir dosyada paketler: node scripts/bundle.js
// Çıktı: dist/pencere.js  →  node pencere.js
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const pub = path.join(root, 'public');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : [full];
  });
}

const assets = {};
for (const file of walk(pub)) {
  assets['/' + path.relative(pub, file).split(path.sep).join('/')] = fs.readFileSync(file).toString('base64');
}

const lib = fs.readFileSync(path.join(root, 'lib', 'instagram.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8').replace(/^'use strict';\n/, '');
if (!server.includes("require('./lib/instagram')")) throw new Error('server.js içinde lib/instagram require bulunamadı');

const version = require(path.join(root, 'package.json')).version;
const out = `#!/usr/bin/env node
// Pencere v${version} — tek dosyalık paket (scripts/bundle.js ile üretildi, elle düzenleme)
// Çalıştır: node pencere.js   (Node.js 18.17+ gerekir, başka hiçbir şey gerekmez)
'use strict';
globalThis.__PENCERE_ASSETS = ${JSON.stringify(assets)};
const __igModule = { exports: {} };
(function (module, exports) {
${lib.replace(/^'use strict';\n/, '')}
})(__igModule, __igModule.exports);
${server.replace("require('./lib/instagram')", '__igModule.exports')}
`;

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const dest = path.join(root, 'dist', 'pencere.js');
fs.writeFileSync(dest, out, { mode: 0o755 });
console.log(`Paket hazır → ${dest} (${(out.length / 1024).toFixed(0)} KB, ${Object.keys(assets).length} dosya)`);
