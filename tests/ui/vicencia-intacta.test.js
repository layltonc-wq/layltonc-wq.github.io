const H0=require('../lib/harness.js');
const { chromium } = require('playwright');
const H=require('../lib/harness.js');const harness=(b,o)=>H.preparar(b,o);
const R=require('path').resolve(__dirname,'..','..')+'/';
const T='vicencia-pe';
function seed(){
 const t0=new Date(Date.now()-5*864e5).toISOString();
 const en=(med,nome,q,lote,extra)=>Object.assign({medicamentoId:med,medicamentoNome:nome,tipo:'entrada',quantidade:q,lote,validade:'01/2029',criadoEm:t0,date:t0.slice(0,10),tenant_id:T},extra||{});
 return {tenants:{[T]:{nome:'Vicência',ativo:true}},
  medicamentos:{m1:{nome:'Dipirona',categoria:'medicamento',estoqueAtual:100,tenant_id:T},m3:{nome:'Leite Formula',categoria:'leite',estoqueAtual:10,tenant_id:T}},
  entries:{e1:en('m1','Dipirona',100,'L1'),e2:en('m3','Leite Formula',10,'LL')},
  users:{},ubs:{},ubs_periodos:{},ubs_solicitacoes:{},ubs_envios:{},plantoes:{},config:{},reposicoes:{}};
}
async function abrir(br,user){
 const o={store:seed(),uid:user.uid,tenant:T,user:Object.assign({status:'approved',tenant_id:T,homeTenant:T,color:'#1351B4',email:'x@x',sessionTimeout:12},user)};
 o.store.users[user.uid]={name:user.name,role:user.role,status:'approved',tenant_id:T,email:'x@x'};
 const {pg,errs}=await harness(br,o);
 await pg.goto('file://'+require('path').resolve(__dirname,'..','lib','blank.html'));
 await pg.addScriptTag({path:require('../lib/harness.js').reactPaths().react});
 await pg.addScriptTag({path:require('../lib/harness.js').reactPaths().reactDom});
 await pg.evaluate(()=>{window.XLSX={utils:{book_new(){},aoa_to_sheet(){},book_append_sheet(){}},writeFile(){}};});
 await pg.addScriptTag({path:R+'app.js'});
 await pg.waitForTimeout(1500);
 return {pg,errs};
}
(async()=>{
 const br=await H0.launch();
 let falhas=0;const ok=(c,m)=>{console.log((c?'OK  ':'FALHA ')+m);if(!c)falhas++;};
 const body=pg=>pg.evaluate(()=>document.body.innerText);
 for(const role of ['tecnico','gestor']){
  const {pg,errs}=await abrir(br,{uid:'u1',name:'Adm '+role,role});
  const go=async(id)=>{await pg.click('text=Menu >> nth=0').catch(()=>{});await pg.click('[data-tour="nav-'+id+'"]');await pg.waitForTimeout(250);};
  ok(await pg.$('[data-fc="seletor-local"]')===null&&await pg.$('[data-fc="chip-local"]')===null,'Vicência/'+role+': sem seletor nem chip de local');
  await pg.click('text=Menu >> nth=0');
  const itens=await pg.evaluate(()=>Array.from(document.querySelectorAll('[data-tour^="nav-"]')).map(b=>b.getAttribute('data-tour').replace('nav-','')));
  ok(['estoque','recebimento','conferencia','leites','saidasreg','previsao','gestao'].every(x=>itens.includes(x))&&!itens.includes('transferencia')&&!itens.includes('ubs'),'Vicência/'+role+': menu igual ao de antes, sem Transferência/UBS ('+itens.join(',')+')');
  await pg.click('[data-tour="nav-estoque"]');await pg.waitForTimeout(300);
  let t=(await body(pg)).replace(/\n/g,' ');
  ok(/Dipirona\s+Farm\. Básica\s+100/.test(t)&&t.includes('Leite Formula'),'Vicência/'+role+': estoque 100 e produto Leite aparecem');
  ok(await pg.evaluate(()=>Array.from(document.querySelectorAll('.pill')).some(x=>/Leite/.test(x.innerText))),'Vicência/'+role+': filtro Leite continua');
  await go('recebimento');t=await body(pg);
  ok(t.includes('Recebimento simples')&&t.includes('Nota Fiscal')&&!t.includes('Já tenho')&&t.includes('Permuta')&&t.includes('Doação')&&t.includes('Empréstimos')&&!t.includes('Divergências'),'Vicência/'+role+': Recebimento simples + Nota Fiscal, agora com Permuta/Doação/Empréstimos e sem aba Divergências (pedido da usuária)');
  // lançamentos novos não ganham campo local
  await pg.evaluate(()=>{db.collection('entries').add({medicamentoId:'m1',medicamentoNome:'Dipirona',tipo:'saida',quantidade:5,tenant_id:'vicencia-pe',criadoEm:new Date().toISOString(),date:'2026-11-12'});const b=db.batch();b.set(db.collection('entries').doc(),{medicamentoId:'m1',tipo:'saida',quantidade:1,tenant_id:'vicencia-pe',criadoEm:new Date().toISOString()});b.commit();});
  await pg.waitForTimeout(300);
  const r=await pg.evaluate(()=>({novos:Object.values(window.__store.entries).filter(x=>x.quantidade===5||x.quantidade===1),m:window.__store.medicamentos.m1}));
  ok(r.novos.length===2&&r.novos.every(x=>x.local===undefined),'Vicência/'+role+': lançamentos novos seguem SEM campo local (add e batch)');
  ok(r.m.estoqueAtual===94&&r.m.estoqueLocal===undefined,'Vicência/'+role+': estoqueAtual segue 100-5-1=94 e sem estoqueLocal');
  ok(errs.filter(e=>!e.includes('ERR_FAILED')).length===0,'Vicência/'+role+': sem erros JS '+errs.join('|'));
  await pg.context().close();
 }
 // auxiliar e farmacêutica em Vicência
 for(const role of ['auxiliar','farmaceutico']){
  const {pg,errs}=await abrir(br,{uid:'u2',name:'Fun '+role,role});
  const tx=await body(pg);
  ok(await pg.$('[data-fc="chip-local"]')===null,'Vicência/'+role+': sem chip de local');
  if(role==='farmaceutico')ok(/plant/i.test(tx)||/turno/i.test(tx)||/Iniciar/i.test(tx),'Vicência/farmacêutica: fluxo de plantão continua ('+tx.slice(0,80).replace(/\n/g,' ')+')');
  else ok(true,'Vicência/auxiliar abre ('+tx.slice(0,60).replace(/\n/g,' ')+')');
  ok(errs.filter(e=>!e.includes('ERR_FAILED')).length===0,'Vicência/'+role+': sem erros JS '+errs.join('|'));
  await pg.context().close();
 }
 console.log(falhas?falhas+' FALHAS':'TUDO OK');await br.close();process.exit(falhas?1:0);
})().catch(e=>{console.error(e);process.exit(2);});
