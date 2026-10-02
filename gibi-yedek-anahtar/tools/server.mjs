// Küçük statik sunucu (ES modülleri file:// ile yüklenemediği için)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.css': 'text/css' };

export function serve(root, port = 0) {
  const srv = http.createServer((req, res) => {
    const p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
    if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) {
      const idx = path.join(p, 'index.html');
      if (fs.existsSync(idx)) { res.writeHead(200, { 'content-type': 'text/html' }); return fs.createReadStream(idx).pipe(res); }
      res.writeHead(404); return res.end('yok');
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
    fs.createReadStream(p).pipe(res);
  });
  return new Promise((r) => srv.listen(port, '127.0.0.1', () => r({ srv, url: `http://127.0.0.1:${srv.address().port}` })));
}

export const CHROME_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--font-render-hinting=none'];
