// contact sheet: node sheet.mjs out.png size file1 file2 ...
import sharp from 'sharp';
const [out, size, ...files] = process.argv.slice(2); const s = parseInt(size);
const cols = Math.min(files.length, 6), rows = Math.ceil(files.length / cols);
const comps = await Promise.all(files.map(async (f, i) => ({ input: await sharp(f).resize(s, s, { fit: 'contain', background: '#888' }).png().toBuffer(), left: (i % cols) * s, top: Math.floor(i / cols) * s })));
await sharp({ create: { width: cols * s, height: rows * s, channels: 3, background: '#888' } }).composite(comps).png().toFile(out);
