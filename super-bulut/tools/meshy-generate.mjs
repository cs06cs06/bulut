#!/usr/bin/env node
// Meshy AI ile oyun varlıklarını üretir: assets/manifest.json'daki her varlık için
// text-to-3D önizleme → dokulandırma → (oyuncu için) rigging + animasyonlar → indirme → küçültme.
// İlerleme assets/generated.json'a kaydedilir; yarıda kalırsa tekrar çalıştırınca kaldığı yerden devam eder.
//
//   MESHY_API_KEY=msy_... node tools/meshy-generate.mjs            # eksik olanları üret
//   node tools/meshy-generate.mjs --dry-run                         # plan ve tahmini kredi
//   node tools/meshy-generate.mjs --only player,coin --force        # seçilenleri yeniden üret
import { readFile, writeFile, rename, mkdir, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { Meshy, MeshyError, download } from './lib/meshy.mjs';
import { optimizeModel, stripToAnimation, thumbnail, optimizerAvailable } from './lib/glb.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const ASSETS = join(ROOT, 'assets');
const MANIFEST = join(ASSETS, 'manifest.json');
const GENERATED = join(ASSETS, 'generated.json');

const HELP = `Kullanım: node tools/meshy-generate.mjs [seçenekler]

  --only a,b        Yalnızca bu varlıklar (ör. --only player,kestane)
  --force           Daha önce üretilmiş olanları da yeniden üret
  --dry-run         Hiçbir şey üretme; planı ve tahmini krediyi göster
  --yes             Onay sormadan başla
  --concurrency N   Aynı anda üretilecek varlık sayısı (varsayılan 3)
  --no-optimize     GLB dokularını küçültme (daha büyük dosyalar)
  --list            Varlıkları ve durumlarını listele

Ortam değişkenleri: MESHY_API_KEY (zorunlu), MESHY_API_BASE (isteğe bağlı)`;

function parseArgs(argv) {
  const a = { only: null, force: false, dryRun: false, yes: false, concurrency: 3, optimize: true, list: false };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === '--only')
      a.only = argv[++i]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    else if (v.startsWith('--only='))
      a.only = v
        .slice(7)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    else if (v === '--force') a.force = true;
    else if (v === '--dry-run') a.dryRun = true;
    else if (v === '--yes' || v === '-y') a.yes = true;
    else if (v === '--concurrency') a.concurrency = Math.max(1, Number(argv[++i]) || 3);
    else if (v === '--no-optimize') a.optimize = false;
    else if (v === '--list') a.list = true;
    else if (v === '--help' || v === '-h') {
      console.log(HELP);
      process.exit(0);
    } else {
      console.error(`Bilinmeyen seçenek: ${v}\n\n${HELP}`);
      process.exit(2);
    }
  }
  return a;
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (err) {
    if (fallback !== undefined && err.code === 'ENOENT') return fallback;
    throw err;
  }
}

// generated.json yazımlarını sıraya koy (eşzamanlı varlıklar aynı dosyayı günceller)
let saveChain = Promise.resolve();
function saveState(state) {
  saveChain = saveChain.then(async () => {
    const tmp = GENERATED + '.tmp';
    await writeFile(tmp, JSON.stringify(state, null, 2) + '\n');
    await rename(tmp, GENERATED);
  });
  return saveChain;
}

function steps(def) {
  const s = ['preview', 'refine'];
  if (def.rig) {
    s.push('rig');
    for (const name of Object.keys(def.animations || {})) s.push('anim:' + name);
  }
  return s;
}

function stepCost(step, cfg, def) {
  if (step === 'preview') return (def.ai_model || cfg.ai_model) === 'meshy-6-lite' ? 5 : 20;
  if (step === 'refine') return cfg.texture_resolution === '8k' ? 15 : 10;
  if (step === 'rig') return 5;
  return 3;
}

function assetStatus(def, entry) {
  if (!entry) return 'yok';
  if (entry.done && entry.prompt === def.prompt) return 'hazır';
  if (entry.done) return 'prompt değişti';
  if (entry.tasks && Object.keys(entry.tasks).length) return 'yarım kaldı';
  return 'yok';
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifest = await readJson(MANIFEST);
  const cfg = { ai_model: 'latest', topology: 'triangle', texture_resolution: '2k', enable_pbr: false, poll_seconds: 5, ...manifest.meshy };
  const state = await readJson(GENERATED, { assets: {} });
  state.assets ||= {};

  const ids = Object.keys(manifest.assets);
  if (args.only) {
    const unknown = args.only.filter((id) => !ids.includes(id));
    if (unknown.length) {
      console.error(`Manifest'te olmayan varlık: ${unknown.join(', ')}\nMevcut: ${ids.join(', ')}`);
      process.exit(2);
    }
  }

  if (args.list) {
    for (const id of ids) {
      const def = manifest.assets[id];
      console.log(`${id.padEnd(18)} ${assetStatus(def, state.assets[id]).padEnd(15)} ${def.label || ''}`);
    }
    return;
  }

  // Plan
  const plan = [];
  for (const id of args.only || ids) {
    const def = manifest.assets[id];
    let entry = state.assets[id];
    const status = assetStatus(def, entry);
    if (status === 'hazır' && !args.force) continue;
    const fresh = args.force || status === 'prompt değişti' || entry?.prompt !== def.prompt;
    const done = fresh ? {} : entry?.tasks || {};
    const todo = steps(def).filter((s) => !done[s]);
    plan.push({ id, def, fresh, todo, cost: todo.reduce((n, s) => n + stepCost(s, cfg, def), 0), status });
  }

  if (!plan.length) {
    console.log('Tüm varlıklar hazır. Yeniden üretmek için --force ya da --only kullanın.');
    return;
  }
  const total = plan.reduce((n, p) => n + p.cost, 0);
  console.log(`Üretilecek ${plan.length} varlık (model: ${cfg.ai_model}, doku: ${cfg.texture_resolution}):`);
  for (const p of plan) {
    const model = p.def.ai_model && p.def.ai_model !== cfg.ai_model ? `  [${p.def.ai_model}]` : '';
    const note = p.status !== 'yok' ? `  (${p.status})` : '';
    console.log(`  ${p.id.padEnd(18)} ${String(p.cost).padStart(3)} kredi  ${p.todo.join(' → ')}${model}${note}`);
  }
  console.log(`Tahmini toplam: ${total} kredi (Meshy fiyat listesine göre; gerçek tüketim farklı olabilir)`);
  if (args.dryRun) return;

  const apiKey = process.env.MESHY_API_KEY;
  if (!apiKey) {
    console.error('\nMESHY_API_KEY ortam değişkeni tanımlı değil. Meshy hesabınızdan (API ayarları) bir anahtar oluşturup tanımlayın.');
    process.exit(1);
  }
  const api = new Meshy({ apiKey, baseUrl: process.env.MESHY_API_BASE, log: (m) => console.log(m) });

  try {
    const { balance } = await api.balance();
    console.log(`Meshy kredi bakiyesi: ${balance}`);
    if (typeof balance === 'number' && balance < total) {
      console.error(`Bakiye tahmini maliyetten (${total}) düşük. Daha az varlık seçin (--only) ya da kredi yükleyin.`);
      process.exit(1);
    }
  } catch (err) {
    if (err.status === 401) {
      console.error('Meshy API anahtarı geçersiz (401).');
      process.exit(1);
    }
    console.warn(`Bakiye okunamadı (${err.message}); devam ediliyor.`);
  }

  if (!args.yes) {
    if (!process.stdin.isTTY) {
      console.error('Onay için --yes ekleyin (etkileşimsiz ortam).');
      process.exit(1);
    }
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = (await rl.question(`${total} kredi harcanabilir. Devam edilsin mi? (e/h) `)).trim().toLowerCase();
    rl.close();
    if (!['e', 'evet', 'y', 'yes'].includes(answer)) return;
  }

  const optimize = args.optimize && (await optimizerAvailable());
  if (args.optimize && !optimize) console.warn('Not: @gltf-transform/sharp yüklü değil, GLB küçültme atlanacak (npm install).');
  await mkdir(join(ASSETS, 'models'), { recursive: true });
  await mkdir(join(ASSETS, 'thumbs'), { recursive: true });

  let stopAll = false;
  const failures = [];
  const queue = [...plan];
  const worker = async () => {
    while (queue.length && !stopAll) {
      const p = queue.shift();
      try {
        await generate(api, cfg, state, p, optimize);
        console.log(`✓ ${p.id} hazır`);
      } catch (err) {
        failures.push(p.id);
        console.error(`✗ ${p.id}: ${err.message}`);
        if (err instanceof MeshyError && (err.status === 402 || err.status === 401)) {
          stopAll = true;
          console.error(err.status === 402 ? 'Yetersiz kredi; kalan varlıklar durduruldu.' : 'Yetkilendirme hatası; durduruldu.');
        }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(args.concurrency, plan.length) }, worker));
  await saveChain;

  const ok = plan.length - failures.length - queue.length;
  console.log(`\nBitti: ${ok}/${plan.length} varlık üretildi.${failures.length ? ` Hatalı: ${failures.join(', ')}` : ''}`);
  console.log('Oyunu yenileyin; Meshy modelleri otomatik yüklenir.');
  if (failures.length || queue.length) process.exitCode = 1;
}

async function generate(api, cfg, state, p, optimize) {
  const { id, def } = p;
  const wait = (getter, taskId, label) => api.wait(getter, taskId, { label: `${id} ${label}`, pollSeconds: cfg.poll_seconds });
  if (p.fresh || !state.assets[id]) state.assets[id] = { prompt: def.prompt, tasks: {} };
  const entry = state.assets[id];
  entry.prompt = def.prompt;
  entry.done = false;
  const t = (entry.tasks ||= {});

  // Görevi başlat (daha önce başlatılmadıysa) ve bitmesini bekle. Başarısız ya da süresi
  // dolmuş görevin kimliği silinir; betik yeniden çalıştırılınca o adım baştan denenir.
  const run = async (key, create, getter, label) => {
    if (!t[key]) {
      const res = await create();
      t[key] = res.result;
      await saveState(state);
    }
    try {
      return await wait(getter, t[key], label);
    } catch (err) {
      if (err.status === 404 || ['FAILED', 'CANCELED', 'EXPIRED'].includes(err.body?.status)) {
        delete t[key];
        await saveState(state);
      }
      throw err;
    }
  };

  // 1) Şekil (önizleme)
  await run(
    'preview',
    () =>
      api.createPreview({
        prompt: def.prompt,
        ai_model: def.ai_model || cfg.ai_model,
        topology: cfg.topology,
        should_remesh: true,
        target_polycount: def.target_polycount ?? 10000,
        ...(def.pose_mode ? { pose_mode: def.pose_mode } : {}),
        target_formats: ['glb'],
      }),
    api.getTextTo3d,
    'önizleme',
  );

  // 2) Doku (refine)
  const refined = await run(
    'refine',
    () =>
      api.createRefine({
        preview_task_id: t.preview,
        enable_pbr: !!cfg.enable_pbr,
        texture_resolution: cfg.texture_resolution,
        ...(def.texture_prompt ? { texture_prompt: def.texture_prompt } : {}),
        target_formats: ['glb'],
      }),
    api.getTextTo3d,
    'doku',
  );
  let modelUrl = refined.model_urls?.glb;
  const thumbUrl = refined.thumbnail_url;
  if (!modelUrl) throw new Error('refine sonucu GLB adresi içermiyor');

  // 3) İskelet + animasyonlar (yalnızca insansı karakterler)
  const animUrls = {};
  if (def.rig) {
    try {
      const rig = await run(
        'rig',
        () => api.createRig({ input_task_id: t.refine, height_meters: def.rig.height_meters ?? 1.7 }),
        api.getRig,
        'rigging',
      );
      const r = rig.result || rig;
      modelUrl = r.rigged_character_glb_url || modelUrl;
      if (r.basic_animations?.walking_glb_url) animUrls.walk = r.basic_animations.walking_glb_url;
      if (r.basic_animations?.running_glb_url) animUrls.run = r.basic_animations.running_glb_url;
      for (const [name, actionId] of Object.entries(def.animations || {})) {
        const key = 'anim:' + name;
        try {
          const anim = await run(
            key,
            () => api.createAnimation({ rig_task_id: t.rig, action_id: actionId }),
            api.getAnimation,
            `animasyon ${name}`,
          );
          const url = (anim.result || anim).animation_glb_url;
          if (url) animUrls[name] = url;
        } catch (err) {
          if (err.status === 402) throw err;
          console.warn(`  ${id}: '${name}' animasyonu atlandı (${err.message})`);
        }
      }
    } catch (err) {
      if (err.status === 402 || err.status === 401) throw err;
      console.warn(`  ${id}: rigging başarısız, iskeletsiz model kullanılacak (${err.message})`);
      entry.rigError = err.message;
    }
  }

  // 4) İndir ve küçült
  const tmp = join(tmpdir(), `meshy-${id}-${Date.now()}`);
  await mkdir(tmp, { recursive: true });
  try {
    const modelFile = `models/${id}.glb`;
    const rawModel = join(tmp, 'model.glb');
    await writeFile(rawModel, await download(modelUrl));
    await place(
      rawModel,
      join(ASSETS, modelFile),
      optimize && ((src, dst) => optimizeModel(src, dst, { maxTextureSize: def.textureSize || 1024 })),
    );

    const animations = {};
    for (const [name, url] of Object.entries(animUrls)) {
      const file = `models/${id}.${name}.glb`;
      const raw = join(tmp, `${name}.glb`);
      await writeFile(raw, await download(url));
      await place(raw, join(ASSETS, file), optimize && stripToAnimation);
      animations[name] = file;
    }

    if (thumbUrl) {
      try {
        const buf = await download(thumbUrl);
        if (optimize && (await thumbnail(buf, join(ASSETS, `thumbs/${id}.webp`)))) entry.thumbnail = `thumbs/${id}.webp`;
        else {
          await writeFile(join(ASSETS, `thumbs/${id}.png`), buf);
          entry.thumbnail = `thumbs/${id}.png`;
        }
      } catch (err) {
        console.warn(`  ${id}: önizleme görseli indirilemedi (${err.message})`);
      }
    }

    entry.model = modelFile;
    entry.animations = animations;
    entry.done = true;
    entry.updatedAt = new Date().toISOString();
    await saveState(state);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

// Dosyayı hedefe koy: küçültme başarısız olursa orijinalini kopyala
async function place(src, dst, transform) {
  if (transform) {
    try {
      if (await transform(src, dst)) return;
    } catch (err) {
      console.warn(`  küçültme atlandı (${err.message})`);
    }
  }
  await copyFile(src, dst);
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
