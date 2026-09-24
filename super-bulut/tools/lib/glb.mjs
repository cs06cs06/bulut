// GLB küçültme: dokuları yeniden boyutlandırıp WebP'ye çevirir, animasyon dosyalarından
// ağ ve dokuları atar. @gltf-transform ve sharp yüklü değilse (npm install) sessizce atlar.

let libs;
async function load() {
  if (libs !== undefined) return libs;
  try {
    const [core, ext, fns, sharp] = await Promise.all([
      import('@gltf-transform/core'),
      import('@gltf-transform/extensions'),
      import('@gltf-transform/functions'),
      import('sharp'),
    ]);
    const io = new core.NodeIO().registerExtensions(ext.ALL_EXTENSIONS).setLogger(new core.Logger(core.Logger.Verbosity.WARN));
    libs = { io, fns, sharp: sharp.default };
  } catch {
    libs = null;
  }
  return libs;
}

export async function optimizerAvailable() {
  return (await load()) !== null;
}

// Model dosyası: dokular en fazla maxTextureSize piksel, WebP
export async function optimizeModel(inPath, outPath, { maxTextureSize = 1024 } = {}) {
  const l = await load();
  if (!l) return false;
  const doc = await l.io.read(inPath);
  await doc.transform(
    l.fns.dedup(),
    l.fns.prune({ keepLeaves: true }),
    l.fns.textureCompress({ encoder: l.sharp, targetFormat: 'webp', resize: [maxTextureSize, maxTextureSize] }),
  );
  await l.io.write(outPath, doc);
  return true;
}

// Animasyon dosyası: yalnızca iskelet düğümleri ve animasyon klipleri kalır
export async function stripToAnimation(inPath, outPath) {
  const l = await load();
  if (!l) return false;
  const doc = await l.io.read(inPath);
  const root = doc.getRoot();
  for (const node of root.listNodes()) {
    node.setMesh(null);
    node.setSkin(null);
  }
  await doc.transform(l.fns.prune({ keepLeaves: true }));
  await l.io.write(outPath, doc);
  return true;
}

// Küçük önizleme görseli
export async function thumbnail(buffer, outPath, size = 256) {
  const l = await load();
  if (!l) return false;
  await l.sharp(buffer).resize(size, size, { fit: 'inside' }).webp({ quality: 82 }).toFile(outPath);
  return true;
}
