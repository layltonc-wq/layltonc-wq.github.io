const H0=require('../lib/harness.js');
const { chromium } = require('playwright');
const H=require('../lib/harness.js');const harness=(b,o)=>H.preparar(b,o);
const T='vicencia-pe';
(async()=>{
 const br=await H0.launch();
 let falhas=0;const ok=(c,m)=>{console.log((c?'OK  ':'FALHA ')+m);if(!c)falhas++;};
 for(const modo of ['android','ios','pc','standalone']){
  const store={tenants:{[T]:{nome:'V',ativo:true}},medicamentos:{},entries:{},users:{u1:{name:'A',role:'tecnico',status:'approved',tenant_id:T}},config:{},plantoes:{}};
  const o={store,uid:'u1',tenant:T,user:{uid:'u1',name:'A',role:'tecnico',status:'approved',tenant_id:T,homeTenant:T,color:'#1351B4',email:'x@x',sessionTimeout:12}};
  const {pg,errs}=await harness(br,o);
  await pg.addInitScript((m)=>{
   const ua={android:'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36',ios:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1',pc:'Mozilla/5.0 (X11; Linux x86_64) Chrome/120'}[m];
   if(ua)Object.defineProperty(navigator,'userAgent',{get:()=>ua});
   if(m==='standalone'){const mm=window.matchMedia.bind(window);window.matchMedia=q=>q.includes('standalone')?{matches:true,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}}:mm(q);Object.defineProperty(navigator,'userAgent',{get:()=>'Mozilla/5.0 (Linux; Android 13) Chrome/120 Mobile'});}
  },modo);
  await pg.goto('file://'+require('path').resolve(__dirname,'..','lib','blank.html'));
  await pg.addScriptTag({path:require('../lib/harness.js').reactPaths().react});
  await pg.addScriptTag({path:require('../lib/harness.js').reactPaths().reactDom});
  await pg.evaluate(()=>{window.XLSX={utils:{},writeFile(){}};});
  await pg.addScriptTag({path:require('path').resolve(__dirname,'..','..','app.js')});
  await pg.waitForTimeout(1000);
  if(modo==='android')await pg.evaluate(()=>{window.__fcInstallEvt={prompt(){window.__prompted=true;},userChoice:Promise.resolve({outcome:'accepted'})};window.dispatchEvent(new Event('fc-install-pronto'));});
  await pg.click('text=Menu >> nth=0').catch(()=>{});
  // abre o perfil pelo avatar do topo
  await pg.evaluate(()=>{const el=Array.from(document.querySelectorAll('div')).find(d=>d.innerText&&d.innerText.trim().startsWith('A')&&d.style&&d.style.cursor==='pointer'&&d.innerText.includes('Técnico'));if(el)el.click();});
  await pg.keyboard.press('Escape');
  await pg.evaluate(()=>{document.querySelectorAll('.itaq-backdrop').forEach(b=>b.click());});
  await pg.waitForTimeout(300);
  await pg.evaluate(()=>{const el=Array.from(document.querySelectorAll('div')).find(d=>d.getAttribute&&d.getAttribute('style')&&/cursor: ?pointer/.test(d.getAttribute('style'))&&/Técnico/.test(d.innerText||'')&&(d.innerText||'').length<40);if(el)el.click();});
  await pg.waitForTimeout(400);
  const card=await pg.$('[data-fc="instalar-app"]');const txt=card?await card.innerText():'';
  if(modo==='android'){ok(!!card&&!!(await pg.$('[data-fc="instalar-btn"]')),'Android: cartão com botão Instalar');await pg.click('[data-fc="instalar-btn"]');ok(await pg.evaluate(()=>window.__prompted===true),'Android: botão abre o instalador do navegador');}
  if(modo==='ios')ok(!!card&&txt.includes('Adicionar à Tela de Início')&&!(await pg.$('[data-fc="instalar-btn"]')),'iPhone: instruções do Safari, sem botão');
  if(modo==='pc')ok(!card,'Computador: cartão não aparece');
  if(modo==='standalone')ok(!card,'Já instalado: cartão não aparece');
  ok(errs.filter(e=>!e.includes('ERR_FAILED')).length===0,modo+': sem erros JS '+errs.join('|'));
  await pg.context().close();
 }
 console.log(falhas?falhas+' FALHAS':'TUDO OK');await br.close();process.exit(falhas?1:0);
})().catch(e=>{console.error(e);process.exit(2);});
