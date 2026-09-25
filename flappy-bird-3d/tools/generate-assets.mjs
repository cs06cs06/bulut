#!/usr/bin/env node
// Meshy AI ile oyunun 3D modellerini ve animasyonlarını üretir.
//
// Kullanım:
//   MESHY_API_KEY=msy_... node tools/generate-assets.mjs [asset...]
//
// API anahtarı yalnızca ortam değişkeninden okunur; depoya asla yazılmaz.
// Her adımın görev kimliği tools/meshy-tasks.json dosyasına kaydedilir, böylece
// script yarıda kesilirse tekrar çalıştırıldığında kaldığı yerden devam eder ve
// kredi harcanmış görevler yeniden oluşturulmaz.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW_DIR = join(ROOT, 'tools', 'raw');
const STATE_FILE = join(ROOT, 'tools', 'meshy-tasks.json');
const API = 'https://api.meshy.ai/openapi';
const KEY = process.env.MESHY_API_KEY;

if (!KEY) {
  console.error('MESHY_API_KEY ortam değişkeni gerekli.');
  process.exit(1);
}

// Oyunda kullanılan varlıklar. `refine` dokulu model üretir, `rig` iskelet
// ekler, `animations` Meshy animasyon kütüphanesindeki action_id'lerdir.
export const ASSETS = {
  bird: {
    preview: {
      ai_model: 'meshy-6-lite',
      // Kuş yatay uçuş pozunda, kanatları iki yana düz açık üretilir. Meshy'nin
      // rigging/animasyon servisi yalnızca insansı karakterleri desteklediği için
      // kanat iskeleti ve çırpma animasyonu oyunda kodla oluşturulur (src/bird-rig.js).
      prompt:
        'A cute cartoon yellow bird flying forward, streamlined body stretched ' +
        'horizontally from beak to tail and parallel to the ground like a sparrow in flight, ' +
        'head in front, tail feathers behind, belly facing down, both wings spread wide open ' +
        'to the left and right, feet tucked in, big friendly eyes, small orange beak, ' +
        'stylized Pixar style game character, symmetrical',
      should_remesh: true,
      topology: 'triangle',
      target_polycount: 10000,
    },
    refine: {
      texture_prompt:
        'bright sunny yellow feathers, white belly, orange beak and feet, big glossy cartoon ' +
        'eyes, wing feathers with lighter yellow tips',
    },
  },
  pipe: {
    preview: {
      ai_model: 'meshy-6-lite',
      prompt:
        'A single tall vertical green warp pipe from a platformer video game, long straight ' +
        'cylindrical tube with a thicker wider cylindrical rim cap at the top opening, ' +
        'glossy cartoon style, clean simple shape, game asset',
      should_remesh: true,
      topology: 'triangle',
      target_polycount: 3000,
    },
    refine: {
      texture_prompt: 'glossy bright green pipe with light green vertical highlight stripes and dark green shading',
    },
  },
  cloud: {
    preview: {
      ai_model: 'meshy-6-lite',
      prompt: 'A fluffy stylized cartoon cloud made of soft puffy rounded balls, flat bottom, game asset',
      should_remesh: true,
      topology: 'triangle',
      target_polycount: 1500,
    },
  },
  bush: {
    preview: {
      ai_model: 'meshy-6-lite',
      prompt: 'A round stylized cartoon green bush made of puffy rounded leaf clumps, low poly game asset',
      should_remesh: true,
      topology: 'triangle',
      target_polycount: 1500,
    },
  },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, path, body) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(API + path, {
      method,
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    if (res.ok) return JSON.parse(text);
    // 429 / 5xx için bekleyip tekrar dene; diğer hatalar kalıcıdır.
    if ((res.status === 429 || res.status >= 500) && attempt < 5) {
      await sleep(2000 * 2 ** attempt);
      continue;
    }
    throw new Error(`${method} ${path} -> ${res.status}: ${text}`);
  }
}

async function loadState() {
  return existsSync(STATE_FILE) ? JSON.parse(await readFile(STATE_FILE, 'utf8')) : {};
}

// Varlıklar paralel üretildiği için yazmaları sıraya koy.
let saving = Promise.resolve();
function saveState(state) {
  saving = saving.then(() => writeFile(STATE_FILE, JSON.stringify(state, null, 2) + '\n'));
  return saving;
}

async function waitFor(path, label) {
  let last = -1;
  for (;;) {
    const task = await api('GET', path);
    if (task.progress !== last) {
      console.log(`  ${label}: ${task.status} ${task.progress ?? 0}%`);
      last = task.progress;
    }
    if (task.status === 'SUCCEEDED') return task;
    if (task.status === 'FAILED' || task.status === 'CANCELED') {
      throw new Error(`${label} ${task.status}: ${JSON.stringify(task.task_error ?? task)}`);
    }
    await sleep(5000);
  }
}

async function download(url, file) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`İndirme başarısız ${res.status}: ${file}`);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, Buffer.from(await res.arrayBuffer()));
  console.log(`  indirildi: ${file}`);
}

// Görevi yalnızca daha önce oluşturulmadıysa başlatır (kredi tekrar harcanmaz).
async function step(state, name, key, create, poll) {
  state[name] ??= {};
  if (!state[name][key]) {
    const { result } = await create();
    state[name][key] = result;
    await saveState(state);
  }
  return waitFor(poll(state[name][key]), `${name}.${key}`);
}

async function build(name, spec, state) {
  console.log(`\n== ${name} ==`);
  const preview = await step(state, name, 'preview',
    () => api('POST', '/v2/text-to-3d', { mode: 'preview', ...spec.preview }),
    (id) => `/v2/text-to-3d/${id}`);
  let model = preview;
  if (PREVIEW_ONLY) {
    await download(preview.thumbnail_url, join(RAW_DIR, `${name}-preview.png`));
    return;
  }

  if (spec.refine) {
    model = await step(state, name, 'refine',
      () => api('POST', '/v2/text-to-3d', { mode: 'refine', preview_task_id: preview.id, ...spec.refine }),
      (id) => `/v2/text-to-3d/${id}`);
  }
  await download(model.model_urls.glb, join(RAW_DIR, `${name}.glb`));
  if (model.thumbnail_url) await download(model.thumbnail_url, join(RAW_DIR, `${name}.png`));

  if (!spec.rig) return;
  const rig = await step(state, name, 'rig',
    () => api('POST', '/v1/rigging', { input_task_id: model.id, ...spec.rig }),
    (id) => `/v1/rigging/${id}`);
  await download(rig.result.rigged_character_glb_url, join(RAW_DIR, `${name}-rigged.glb`));

  for (const [anim, actionId] of Object.entries(spec.animations ?? {})) {
    const task = await step(state, name, `anim_${anim}`,
      () => api('POST', '/v1/animations', { rig_task_id: rig.id, action_id: actionId }),
      (id) => `/v1/animations/${id}`);
    await download(task.result.animation_glb_url, join(RAW_DIR, `${name}-${anim}.glb`));
  }
}

// --preview-only: yalnızca önizleme görevlerini çalıştırır (poz/şekil kontrolü
// için; dokulama ve rigging kredisi harcanmadan önce).
const PREVIEW_ONLY = process.argv.includes('--preview-only');

const state = await loadState();
const wanted = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const names = wanted.length ? wanted : Object.keys(ASSETS);
await Promise.all(names.map((n) => build(n, ASSETS[n], state)));
const { balance } = await api('GET', '/v1/balance');
console.log(`\nBitti. Kalan Meshy kredisi: ${balance}`);
