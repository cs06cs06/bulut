import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright';
const root = process.cwd(), outDir = path.resolve(process.argv[2]), dest = path.resolve(process.argv[3]);
const types = {'.html':'text/html','.js':'text/javascript','.glb':'model/gltf-binary'};
const srv = http.createServer((req,res)=>{ const u = decodeURIComponent(req.url.split('?')[0]);
  const f = u.startsWith('/out/') ? path.join(outDir, u.slice(5)) : path.join(root, u);
  fs.readFile(f,(e,d)=>{ if(e){res.writeHead(404);return res.end();} res.writeHead(200,{'content-type':types[path.extname(f)]||'application/octet-stream'}); res.end(d);});
}).listen(8765);
const views = JSON.parse(process.argv[4]);
const b = await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p = await b.newPage({viewport:{width:1280,height:800}});
p.on('console', m => m.type()==='error' && console.log('console:', m.text()));
fs.mkdirSync(dest,{recursive:true});
for (const [name, qs] of Object.entries(views)) {
  await p.goto(`http://localhost:8765/page.html?${qs}`);
  await p.waitForFunction('window.done', null, {timeout: 120000});
  await p.locator('canvas').screenshot({path: path.join(dest, name + '.png')});
  console.log('rendered', name);
}
await b.close(); srv.close();
