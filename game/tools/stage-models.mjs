// Copies selected downloaded models into public/assets/models as optimised GLB
// (dedupe, prune, weld, WebP textures ≤1024px). Source packs: see CREDITS.md.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, textureCompress, resample, getBounds } from '@gltf-transform/functions';
import sharp from 'sharp';
import fs from 'fs';
const M = process.argv[2], K = process.argv[3], M2 = M.replace(/models$/, 'models2');
const OUT = 'public/assets/models/';
fs.mkdirSync(OUT, { recursive: true });
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const L = {
  // vehicles
  pickup: 'oga_rgsdev_vehicles/glb/Pickup.glb', suv: 'oga_rgsdev_vehicles/glb/SUV.glb', van: 'oga_rgsdev_vehicles/glb/Van.glb', truck: 'oga_rgsdev_vehicles/glb/Truck.glb', monster: 'oga_rgsdev_vehicles/glb/Monster_Truck.glb',
  tractor: 'itch_rubikfish_tractor/tractor_scaled.glb',
  // farm buildings
  barn: 'farmbuildings/glb/Barn.glb', barn_big: 'farmbuildings/glb/BigBarn.glb', barn_small: 'farmbuildings/glb/SmallBarn.glb', barn_open: 'farmbuildings/glb/OpenBarn.glb',
  silo: 'farmbuildings/glb/Silo.glb', silo_house: 'farmbuildings/glb/Silo_House.glb', windmill: 'farmbuildings/glb/Windmill.glb',
  water_tower: 'farmbuildings/glb/WaterTower.glb', chicken_coop: 'farmbuildings/glb/ChickenCoop.glb', well: 'farmbuildings/glb/Well.glb',
  fence: 'farmbuildings/glb/Fence.glb', fence2: 'farmbuildings/glb/Fence2.glb',
  farm_barn: 'automata_lowpolyfarm/glb/farm.glb', cistern: 'automata_lowpolyfarm/glb/cistern.glb',
  mailbox: 'styloo_cozyfarm/glb/mailbox.glb', hay_round: 'styloo_cozyfarm/glb/haystackround.glb', hay_cube: 'styloo_cozyfarm/glb/haystackcube.glb',
  cart: 'styloo_cozyfarm/glb/cart.glb', barrel: 'styloo_cozyfarm/glb/barrel.glb',
  pond: 'styloo_cozyfarm/glb/pond.glb',
  haybale: 'xra7en_farmpack/glb/haybale.glb', crate_pumpkin: 'xra7en_farmpack/glb/crate_pumpkin.glb', pumpkin: 'xra7en_farmpack/glb/pumpkin.glb',
  // nature (Stylized Nature MegaKit)
  tree_1: 'stylizednaturemegakit/glTF/CommonTree_1.gltf', tree_2: 'stylizednaturemegakit/glTF/CommonTree_2.gltf', tree_3: 'stylizednaturemegakit/glTF/CommonTree_3.gltf',
  tree_4: 'stylizednaturemegakit/glTF/CommonTree_4.gltf', tree_5: 'stylizednaturemegakit/glTF/CommonTree_5.gltf',
  pine_1: 'stylizednaturemegakit/glTF/Pine_1.gltf', pine_2: 'stylizednaturemegakit/glTF/Pine_2.gltf', pine_3: 'stylizednaturemegakit/glTF/Pine_3.gltf',
  dead_1: 'stylizednaturemegakit/glTF/DeadTree_1.gltf', dead_2: 'stylizednaturemegakit/glTF/DeadTree_2.gltf',
  bush: 'stylizednaturemegakit/glTF/Bush_Common.gltf', bush_flowers: 'stylizednaturemegakit/glTF/Bush_Common_Flowers.gltf',
  grass_short: 'stylizednaturemegakit/glTF/Grass_Common_Short.gltf', grass_tall: 'stylizednaturemegakit/glTF/Grass_Common_Tall.gltf',
  grass_wispy: 'stylizednaturemegakit/glTF/Grass_Wispy_Tall.gltf', flower_3: 'stylizednaturemegakit/glTF/Flower_3_Group.gltf', flower_4: 'stylizednaturemegakit/glTF/Flower_4_Group.gltf', fern: 'stylizednaturemegakit/glTF/Fern_1.gltf',
  rock_1: 'stylizednaturemegakit/glTF/Rock_Medium_1.gltf', rock_2: 'stylizednaturemegakit/glTF/Rock_Medium_2.gltf', rock_3: 'stylizednaturemegakit/glTF/Rock_Medium_3.gltf',
  birch_1: 'ultimatestylizednature/glTF/BirchTree_1.gltf', maple_1: 'ultimatestylizednature/glTF/MapleTree_1.gltf',
  // Kenney City Kit (Suburban) — white farmhouses
  ...Object.fromEntries(['a', 'e', 'g', 'h', 'r'].map(t => ['farmhouse_' + t, `${K}/kenney_city-kit-suburban_20/Models/GLB format/building-type-${t}.glb`])),
  // Kenney Car Kit — drivable farm tractor
  tractor_k: `${K}/kenney_car-kit/Models/GLB format/tractor.glb`,
  // Town, roadside & industry (see CREDITS.md) — M2 = scratchpad/models2
  pole: `${M2}/kenney_city-kit-roads/glb/electricity-pole-single.glb`, wires: `${M2}/kenney_city-kit-roads/glb/electricity-wires.glb`,
  turbine: `${M2}/kenney_city-kit-industrial/glb/windmill.glb`, water_tower2: `${M2}/kenney_city-kit-industrial/glb/water-tower.glb`,
  grain_bin: `${M2}/kenney_city-kit-industrial/glb/detail-tank-large.glb`, warehouse: `${M2}/oga_warehouse/glb/warehouse.glb`,
  jeep: `${M2}/oga_sovietjeep/glb/gaz67.glb`, streetlight: `${M2}/q_zombie/glb/StreetLights.glb`,
  gas_canopy: `${M2}/itch_elbolillo_gasstation/glb_main/The_ceiling.glb`, gas_shop: `${M2}/itch_elbolillo_gasstation/glb_main/6twelve.glb`,
  gas_sign: `${M2}/itch_elbolillo_gasstation/glb_main/6twelve_Sign.glb`, store: `${M2}/oga_townstore/glb/town_store.glb`,
  ...Object.fromEntries(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map(k => ['shop_' + k.toLowerCase(), `${M2}/kaykit_citybuilder/glb/building_${k}_withoutBase.glb`])),
  house_s_a: `${M2}/kenney_modular-buildings/glb/building-sample-house-a.glb`, house_s_c: `${M2}/kenney_modular-buildings/glb/building-sample-house-c.glb`,
  bench: `${M2}/kaykit_citybuilder/glb/bench.glb`, hydrant: `${M2}/kaykit_citybuilder/glb/firehydrant.glb`, trash: `${M2}/kaykit_citybuilder/glb/trash_A.glb`,
  picnic: `${M2}/oga_picnictable/glb/picnic_table.glb`, pallet: `${M2}/kaykit_resource/glb/Pallet_Wood_Covered_A.glb`,
  fuel_barrels: `${M2}/kaykit_resource/glb/Fuel_A_Barrels.glb`, logs: `${M2}/kaykit_resource/glb/Wood_Log_Stack.glb`,
  cone: `${M2}/q_zombie/glb/TrafficCone_1.glb`, sign_stop: `${M2}/kenney_city-kit-roads/glb/road-sign-stop.glb`,
  // KayKit Medieval Hexagon: country chapel, roadside tavern (diner) and farmers' market stall
  ...Object.fromEntries([['chapel', 'church'], ['diner', 'tavern'], ['market', 'market']].map(([k, b]) => [k, `${M2}/kaykit_hex/KayKit_Medieval_Hexagon_Pack_1.0_FREE/Assets/gltf/buildings/red/building_${b}_red.gltf`])),
  ...Object.fromEntries(['wheelbarrow', 'sack', 'crate_A_big'].map((k) => [k.replace('_A_big', ''), `${M2}/kaykit_hex/KayKit_Medieval_Hexagon_Pack_1.0_FREE/Assets/gltf/decoration/props/${k}.gltf`])),
  // OGA pigeon (mujtaba-io, CC0), exported from .blend with a flat slate-grey body
  bird: `${M2}/oga_pigeon/pigeon.glb`,
  // Kenney Mini Characters (people, animated), Nature / Survival kits (camp), Fantasy Town (fair), Car Kit (traffic)
  ...Object.fromEntries(['a', 'b', 'c', 'd', 'e', 'f'].flatMap((k) => [['char_m_' + k, `${M2}/kenney_mini/Models/GLB format/character-male-${k}.glb`], ['char_f_' + k, `${M2}/kenney_mini/Models/GLB format/character-female-${k}.glb`]])),
  tent: `${K}/kenney_nature-kit/Models/GLTF format/tent_detailedOpen.glb`, tent2: `${K}/kenney_survival-kit/Models/GLB format/tent-canvas.glb`,
  campfire: `${K}/kenney_nature-kit/Models/GLTF format/campfire_stones.glb`, log_seat: `${K}/kenney_nature-kit/Models/GLTF format/log.glb`,
  canoe: `${K}/kenney_nature-kit/Models/GLTF format/canoe.glb`, bedroll: `${K}/kenney_survival-kit/Models/GLB format/bedroll.glb`,
  fish_stand: `${K}/kenney_survival-kit/Models/GLB format/campfire-fishing-stand.glb`, bucket: `${K}/kenney_survival-kit/Models/GLB format/bucket.glb`,
  ...Object.fromEntries(['stall', 'stall-green', 'stall-red', 'stall-bench', 'stall-stool', 'banner-red', 'banner-green', 'lantern'].map((k) => [k.replace('-', '_'), `${K}/kenney_fantasy-town-kit_2.0/Models/GLB format/${k}.glb`])),
  ...Object.fromEntries(['sedan', 'hatchback-sports', 'police', 'delivery', 'taxi'].map((k) => ['k_' + k.split('-')[0], `${K}/kenney_car-kit/Models/GLB format/${k}.glb`])),
  // Kenney Platformer Kit — challenge flags & signs
  flag: `${K}/platformer/Models/GLB format/flag.glb`, sign: `${K}/platformer/Models/GLB format/sign.glb`, arrow: `${K}/platformer/Models/GLB format/arrow.glb`,
  billboard: 'styloo_cozyfarm/glb/billboard.glb',
  // animals
  cow: 'ultimateanimatedanimals/glb/Cow.glb', bull: 'ultimateanimatedanimals/glb/Bull.glb', horse: 'ultimateanimatedanimals/glb/Horse.glb', horse_white: 'ultimateanimatedanimals/glb/Horse_White.glb',
  donkey: 'ultimateanimatedanimals/glb/Donkey.glb', alpaca: 'ultimateanimatedanimals/glb/Alpaca.glb', deer: 'ultimateanimatedanimals/glb/Deer.glb', chicken: 'oga_chicken_mess110/Chicken.glb',
};
// styloo's Cozy Farm props are authored far from their pivot; move them back to the origin
const RECENTER = new Set(['barrel', 'billboard', 'cart', 'hay_cube', 'hay_round', 'mailbox', 'pond', 'warehouse', 'gas_canopy', 'gas_shop']);
function recenter(doc) {
  const scene = doc.getRoot().listScenes()[0];
  const b = getBounds(scene);
  const pivot = doc.createNode('recenter').setTranslation([-(b.min[0] + b.max[0]) / 2, -b.min[1], -(b.min[2] + b.max[2]) / 2]);
  for (const c of scene.listChildren()) { scene.removeChild(c); pivot.addChild(c); }
  scene.addChild(pivot);
}
// The gas station ships with photo-like tiling textures; bake them to flat colours so it matches the
// rest of the stylised world. Logo / sign / label textures are kept but posterised.
const FLATTEN = new Set(['gas_canopy', 'gas_shop', 'gas_sign']);
const KEEP_TEX = /6twelve|sign|management|refrigerador|door|fuel_pump/i;
const toLin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
async function flatten(doc) {
  const root = doc.getRoot();
  for (const m of root.listMaterials()) {
    const tex = m.getBaseColorTexture();
    m.setMetallicFactor(0).setRoughnessFactor(0.85).setMetallicRoughnessTexture(null).setNormalTexture(null).setOcclusionTexture(null);
    if (!tex) continue;
    const img = sharp(Buffer.from(tex.getImage()));
    if (KEEP_TEX.test(m.getName()) || KEEP_TEX.test(tex.getName())) {
      // posterise: smooth out noise, then snap to a small palette
      const png = await img.median(3).modulate({ saturation: 1.15 }).png({ palette: true, colours: 10, dither: 0 }).toBuffer();
      tex.setImage(await sharp(png).webp({ quality: 92 }).toBuffer()).setMimeType('image/webp');
      continue;
    }
    const { channels } = await img.stats();
    // average colour, nudged towards the brighter, more saturated country palette
    let [r, g, b] = channels.slice(0, 3).map((c) => c.mean / 255);
    const l = (r + g + b) / 3;
    [r, g, b] = [r, g, b].map((c) => Math.min(1, (l + (c - l) * 1.35) * 1.08));
    const f = m.getBaseColorFactor();
    m.setBaseColorFactor([toLin(r) * f[0], toLin(g) * f[1], toLin(b) * f[2], f[3]]).setBaseColorTexture(null);
  }
}
const only = process.argv.slice(4);
for (const [name, rel] of Object.entries(L)) {
  if (only.length && !only.includes(name)) continue;
  const src = rel.startsWith('/') ? rel : M + '/' + rel;
  if (!fs.existsSync(src)) { console.log('MISSING', name, src); continue; }
  const doc = await io.read(src);
  await doc.transform(dedup(), prune(), resample(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 88 }));
  if (name.startsWith('farmhouse_')) await recolorRoof(doc);
  if (FLATTEN.has(name)) { await flatten(doc); await doc.transform(prune()); }
  if (RECENTER.has(name)) recenter(doc);
  await io.write(OUT + name + '.glb', doc);
  console.log(name.padEnd(14), (fs.statSync(OUT + name + '.glb').size / 1024).toFixed(0) + 'KB');
}

// Kenney houses ship with mint roofs; repaint green swatches as weathered slate for a farm look.
async function recolorRoof(doc) {
  for (const tex of doc.getRoot().listTextures()) {
    const { data, info } = await sharp(Buffer.from(tex.getImage())).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      if (mx - mn < 0.12 || g < r || g < b * 0.9) continue; // only green/teal swatches
      const l = (r * 0.3 + g * 0.59 + b * 0.11);
      data[i] = Math.min(255, l * 75 + 38); data[i + 1] = Math.min(255, l * 75 + 40); data[i + 2] = Math.min(255, l * 80 + 46);
    }
    tex.setImage(await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).webp({ quality: 92 }).toBuffer());
    tex.setMimeType('image/webp');
  }
}
