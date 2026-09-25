#!/usr/bin/env node
// Meshy'den inen ham GLB dosyalarını (tools/raw) oyunun kullandığı hafif
// dosyalara (assets/models) dönüştürür:
//  - dokular küçültülüp WebP'ye çevrilir (mobil indirme boyutu için)
//  - Meshy'nin metalik (metallic=1) malzemeleri mat hale getirilir
// Kuşun kanat iskeleti ve animasyonları oyunda kurulur (src/bird-rig.js).
//
// Kullanım: npm install && npm run assets:optimize

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, textureCompress } from '@gltf-transform/functions';
import sharp from 'sharp';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stat } from 'node:fs/promises';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = (f) => join(ROOT, 'tools', 'raw', f);
const OUT = (f) => join(ROOT, 'assets', 'models', f);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

function matte(doc, roughness) {
  for (const m of doc.getRoot().listMaterials()) {
    m.setMetallicFactor(0);
    m.setRoughnessFactor(roughness);
  }
}

async function finish(doc, file, size) {
  await doc.transform(
    dedup(),
    prune(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [size, size], quality: 82 }),
  );
  await io.write(OUT(file), doc);
  console.log(`${file}: ${((await stat(OUT(file))).size / 1024).toFixed(0)} KB`);
}

async function buildProp(name, size, roughness) {
  const doc = await io.read(RAW(`${name}.glb`));
  matte(doc, roughness);
  await finish(doc, `${name}.glb`, size);
}

await buildProp('bird', 1024, 0.62);
await buildProp('pipe', 1024, 0.38);
await buildProp('cloud', 256, 1);
await buildProp('bush', 256, 1);
