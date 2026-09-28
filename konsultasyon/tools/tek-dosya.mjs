// Uygulamayı tek bir HTML dosyasına paketler.
//   node tools/tek-dosya.mjs cikti.html            → tam belge (doctype ile), dosyadan açılabilir
//   node tools/tek-dosya.mjs cikti.html --artifact → claude.ai Artifact biçimi (doctype/head/body olmadan)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const out = process.argv[2];
const artifact = process.argv.includes('--artifact');
if (!out) { console.error('Kullanım: node tools/tek-dosya.mjs <cikti.html> [--artifact]'); process.exit(1); }

const index = read('index.html');
const body = index.split('<!--BODY-->')[1].split('<!--/BODY-->')[0].trim();
const fonts = index.match(/<link rel="stylesheet" href="https:\/\/fonts[^>]+>/)[0];
const js = ['catalog.js', 'app.js'].map(read);
if (js.some((s) => s.includes('</script'))) throw new Error('Betik içinde </script bulunamaz');

const content = `<title>Konsültasyon Defteri</title>
<meta name="description" content="Enfeksiyon Hastalıkları konsültasyon notları için dokunmatik cep telefonu uygulaması.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
${fonts}
<style>
${read('styles.css')}
</style>
${body}
<script>
${js[0]}
</script>
<script>
${js[1]}
</script>
`;
const html = artifact ? content : `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#4A36A3">
</head>
<body>
${content}</body>
</html>
`;
fs.writeFileSync(out, html);
console.log(`${out} yazıldı (${(html.length / 1024).toFixed(0)} KB${artifact ? ', artifact biçimi' : ''})`);
