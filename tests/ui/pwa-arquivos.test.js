const H0=require('../lib/harness.js');
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=require('path').resolve(__dirname,'..','..');
const mime={'.html':'text/html','.js':'text/javascript','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png'};
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p.endsWith('/'))p+='index.html';const f=path.join(ROOT,p);if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);r.end('nf');return;}r.writeHead(200,{'content-type':mime[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(r);}).listen(0);
(async()=>{
 const port=srv.address().port;const base='http://localhost:'+port;
 const br=await H0.launch();
 const ctx=await br.newContext();const pg=await ctx.newPage();
 await pg.route('**/*',r=>{const u=r.request().url();if(u.startsWith(base)||u.startsWith('data:'))return r.continue();r.abort();});
 let falhas=0;const ok=(c,m)=>{console.log((c?'OK  ':'FALHA ')+m);if(!c)falhas++;};
 await pg.goto(base+'/');
 const link=await pg.getAttribute('link[rel=manifest]','href');ok(link==='/manifest.webmanifest','index.html aponta o manifesto');
 const mf=await (await fetch(base+link)).json();
 ok(mf.display==='standalone'&&mf.start_url==='/'&&mf.name==='FarmaControl'&&mf.icons.length===3&&mf.icons.some(i=>i.purpose==='maskable'),'manifesto: standalone, nome, 3 ícones (um maskable)');
 for(const i of mf.icons){const r=await fetch(base+i.src);ok(r.status===200&&(r.headers.get('content-type')||'').includes('png'),'ícone '+i.src+' existe');}
 ok(await pg.getAttribute('meta[name=theme-color]','content')==='#1351B4'&&await pg.getAttribute('link[rel=apple-touch-icon]','href')!==null,'theme-color e ícone do iPhone');
 // service worker ativo
 await pg.waitForFunction(()=>navigator.serviceWorker&&navigator.serviceWorker.controller||navigator.serviceWorker.getRegistration().then(r=>r&&r.active),null,{timeout:8000}).catch(()=>{});
 await pg.waitForTimeout(800);
 const sw=await pg.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();return !!(r&&(r.active||r.installing||r.waiting));});
 ok(sw,'service worker registrado');
 await pg.reload();await pg.waitForTimeout(500);
 // offline: navegação cai na tela amigável
 await ctx.setOffline(true);
 await pg.goto(base+'/').catch(()=>{});await pg.waitForTimeout(500);
 const t=await pg.evaluate(()=>document.body.innerText);
 ok(t.includes('Sem conexão com a internet'),'sem internet: mostra a tela "Sem conexão" em vez do erro do navegador');
 await ctx.setOffline(false);
 // com internet volta ao app
 await pg.goto(base+'/');await pg.waitForTimeout(500);
 ok(await pg.$('#root')!==null,'com internet abre o app normalmente');
 // o sw não guarda o app em cache
 const caches_=await pg.evaluate(async()=>{const ks=await caches.keys();const o={};for(const k of ks){o[k]=(await (await caches.open(k)).keys()).map(r=>new URL(r.url).pathname);}return o;});
 ok(Object.values(caches_).every(v=>v.length===1&&v[0]==='/offline.html'),'cache só tem a página offline ('+JSON.stringify(caches_)+')');
 console.log(falhas?falhas+' FALHAS':'TUDO OK');await br.close();srv.close();process.exit(falhas?1:0);
})().catch(e=>{console.error(e);process.exit(2);});
