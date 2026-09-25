#!/usr/bin/env node
// Meshy'den inen ham GLB dosyalarını (tools/raw) oyunun kullandığı hafif
// dosyalara (assets/models) dönüştürür:
//  - bird: iskeletli model + Meshy animasyon kliplerinin tek GLB'de birleşimi
//  - dokular 1024 px WebP'ye küçültülür (mobil indirme boyutu için)
//  - Meshy'nin metalik (metallic=1) malzemeleri mat hale getirilir
//
// Kullanım: npm install && npm run assets:optimize

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, resample, textureCompress } from '@gltf-transform/functions';
import sharp from 'sharp';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stat } from 'node:fs/promises';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = (f) => join(ROOT, 'tools', 'raw', f);
const OUT = (f) => join(ROOT, 'assets', 'models', f);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

// Oyundaki klip adı -> Meshy animasyon dosyası
const BIRD_CLIPS = { flap: 'bird-flap.glb', fall: 'bird-fall.glb', wave: 'bird-wave.glb' };

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

// Her Meshy animasyon GLB'si modelin tam bir kopyasını içerir. Yalnızca
// animasyon kanallarını alıp iskeletli modele (aynı kemik adları) ekliyoruz.
// Kemiklerin yalnızca dönüşleri alınır: öteleme/ölçek kanalları sabittir ya da
// (Hips için) karakteri zıplatan kök hareketidir; uçan bir kuşta istemiyoruz.
async function buildBird() {
  const doc = await io.read(RAW('bird-rigged.glb'));
  const root = doc.getRoot();
  root.listAnimations().forEach((a) => a.dispose());
  const nodes = new Map(root.listNodes().map((n) => [n.getName(), n]));
  const buffer = root.listBuffers()[0];

  for (const [clipName, file] of Object.entries(BIRD_CLIPS)) {
    const src = await io.read(RAW(file));
    const [srcAnim] = src.getRoot().listAnimations();
    const anim = doc.createAnimation(clipName);
    for (const ch of srcAnim.listChannels()) {
      if (ch.getTargetPath() !== 'rotation') continue;
      const target = nodes.get(ch.getTargetNode().getName());
      if (!target) continue;
      const s = ch.getSampler();
      const input = doc
        .createAccessor()
        .setType('SCALAR')
        .setArray(s.getInput().getArray().slice())
        .setBuffer(buffer);
      const output = doc
        .createAccessor()
        .setType(s.getOutput().getType())
        .setArray(s.getOutput().getArray().slice())
        .setBuffer(buffer);
      const sampler = doc
        .createAnimationSampler()
        .setInput(input)
        .setOutput(output)
        .setInterpolation(s.getInterpolation());
      anim.addSampler(sampler);
      anim.addChannel(doc.createAnimationChannel().setTargetNode(target).setTargetPath('rotation').setSampler(sampler));
    }
    console.log(`  bird/${clipName}: ${anim.listChannels().length} kanal`);
  }

  matte(doc, 0.62);
  await doc.transform(resample());
  await finish(doc, 'bird.glb', 1024);
}

async function buildProp(name, size, roughness) {
  const doc = await io.read(RAW(`${name}.glb`));
  matte(doc, roughness);
  await finish(doc, `${name}.glb`, size);
}

await buildBird();
await buildProp('pipe', 1024, 0.38);
await buildProp('cloud', 256, 1);
await buildProp('bush', 256, 1);
