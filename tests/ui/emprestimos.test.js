const H0=require('../lib/harness.js');
const { chromium } = require('playwright');
const H=require('../lib/harness.js');const harness=(b,o)=>H.preparar(b,o);
const R=require('path').resolve(__dirname,'..','..')+'/';
const T='itaquitinga-pe';
function seed(){
 const en=(med,nome,q,lote,t,extra)=>Object.assign({medicamentoId:med,medicamentoNome:nome,tipo:'entrada',quantidade:q,lote,validade:'01/2029',criadoEm:t,date:t.slice(0,10),tenant_id:T},extra||{});
 const t0=new Date(Date.now()-5*864e5).toISOString();
 return {
  tenants:{[T]:{nome:'Itaquitinga',ativo:true}},
  medicamentos:{
   m1:{nome:'Dipirona',categoria:'medicamento',estoqueAtual:130,estoqueLocal:{satelite:30},tenant_id:T},
   m2:{nome:'Amoxicilina',categoria:'medicamento',estoqueAtual:50,tenant_id:T},
   m3:{nome:'Leite Formula',categoria:'leite',estoqueAtual:10,estoqueLocal:{satelite:10},tenant_id:T}},
  entries:{
   e1:en('m1','Dipirona',100,'L1',t0),e2:en('m2','Amoxicilina',50,'A1',t0),
   e3:en('m1','Dipirona',30,'L1',t0,{local:'satelite'}),e4:en('m3','Leite Formula',10,'LL',t0,{local:'satelite'})},
  users:{},ubs:{},ubs_periodos:{},ubs_solicitacoes:{},ubs_envios:{},plantoes:{},config:{},reposicoes:{}};
}
async function abrir(br,user,mod){
 const o={store:(mod?mod(seed()):seed()),uid:user.uid,tenant:T,user:Object.assign({status:'approved',tenant_id:T,homeTenant:T,color:'#1351B4',email:'x@x',sessionTimeout:12},user)};
 o.store.users[user.uid]={name:user.name,role:user.role,status:'approved',tenant_id:T,acessoLocal:user.acessoLocal||'',somenteLeitura:user.somenteLeitura===true,email:'x@x'};
 const {pg,errs}=await harness(br,o);
 await pg.goto('file://'+require('path').resolve(__dirname,'..','lib','blank.html'));
 await pg.addScriptTag({path:require('../lib/harness.js').reactPaths().react});
 await pg.addScriptTag({path:require('../lib/harness.js').reactPaths().reactDom});
 await pg.evaluate(()=>{window.XLSX={utils:{book_new(){},aoa_to_sheet(){},book_append_sheet(){}},writeFile(){}};});
 await pg.addScriptTag({path:R+'app.js'});
 await pg.waitForSelector('[data-fc="seletor-local"],[data-fc="chip-local"]',{timeout:15000}).catch(()=>{});
 return {pg,errs};
}
(async()=>{
 const br=await H0.launch();
 let falhas=0;const ok=(c,m)=>{console.log((c?'OK  ':'FALHA ')+m);if(!c)falhas++;};
 const body=pg=>pg.evaluate(()=>document.body.innerText);
 let {pg,errs}=await abrir(br,{uid:'t1',name:'Laylton',role:'tecnico'});
 const go=async(id)=>{await pg.click('text=Menu >> nth=0').catch(()=>{});await pg.click('[data-tour="nav-'+id+'"]');await pg.waitForTimeout(250);};
 const pick=async(sel,txt)=>{await pg.fill(sel,txt);await pg.click('[data-fc="pick"]');};
 const qtdEst=async(id)=>pg.evaluate((id)=>window.__store.medicamentos[id].estoqueAtual,id);
 await go('recebimento');
 await pg.click('[data-fc="modo-emprestimo"]');
 let t=await body(pg);
 ok(t.includes('Empréstimos')&&t.includes('Nos devem')&&t.includes('Devemos'),'aba Empréstimos mostra "Nos devem" e "Devemos"');
 // emprestamos 20 de Dipirona
 await pg.fill('[data-fc="emp-parceiro"]','Hospital Y');
 await pick('[data-fc="emp-busca"]','dipi');
 await pg.fill('[data-fc="emp-qtd"]','20');
 await pg.click('[data-fc="emp-salvar"]');await pg.waitForTimeout(500); await (async()=>{await pg.waitForTimeout(250);await pg.locator('button:has-text("Emprestar")').last().click();await pg.waitForTimeout(400);})();
 let r=await pg.evaluate(()=>Object.values(window.__store.entries).filter(x=>x.entradaEspecial==='emprestimo'));
 ok(r.length===1&&r[0].tipo==='saida'&&r[0].quantidade===20&&r[0].emprestimoTipo==='cedido'&&r[0].parceiro==='Hospital Y'&&r[0].local==='caf','emprestar grava saída de 20 ligada ao empréstimo, no CAF');
 ok(await qtdEst('m1')===110,'saiu do estoque (130 -> 110)');
 t=await body(pg);
 ok(/Nos devem \(1\)/.test(t)&&t.includes('20x Dipirona')&&t.includes('Emprestado a Hospital Y'),'ficou pendente em "Nos devem"');
 // devolvem 5 (parcial)
 await pg.click('[data-fc^="emp-acertar-"]');
 await pg.fill('[data-fc="emp-dev-qtd"]','5');
 await pg.click('[data-fc="emp-dev-ok"]');
 ok((await pg.textContent('[data-fc="emp-dev-erro"]')).includes('validade'),'devolução exige lote/validade');
 await pg.fill('[data-fc="emp-dev-val"]','05/2029');await pg.click('[data-fc="emp-dev-sl"]');
 await pg.click('[data-fc="emp-dev-ok"]');await pg.waitForTimeout(500);
 ok(await qtdEst('m1')===115,'devolução parcial entra no estoque (110 -> 115)');
 t=await body(pg);
 ok(t.includes('15x Dipirona')&&t.includes('já acertado 5 de 20'),'continua pendente só o que falta (15)');
 // devolvem o resto -> acertado
 await pg.click('[data-fc^="emp-acertar-"]');
 await pg.fill('[data-fc="emp-dev-qtd"]','99');await pg.fill('[data-fc="emp-dev-val"]','06/2029');await pg.click('[data-fc="emp-dev-sl"]');
 await pg.click('[data-fc="emp-dev-ok"]');
 ok((await pg.textContent('[data-fc="emp-dev-erro"]')).includes('15'),'não deixa devolver mais do que falta');
 await pg.fill('[data-fc="emp-dev-qtd"]','15');await pg.click('[data-fc="emp-dev-ok"]');await pg.waitForTimeout(500);
 t=await body(pg);
 ok(/Nos devem \(0\)/.test(t)&&t.includes('✓ Acertado'),'quitado: sai de "Nos devem" e aparece "✓ Acertado"');
 ok(await qtdEst('m1')===130,'estoque voltou ao original (130)');
 // recebemos emprestado 40 de Amoxicilina
 await pg.click('[data-fc="emp-tipo-recebido"]');
 await pg.fill('[data-fc="emp-parceiro"]','Prefeitura Z');
 await pick('[data-fc="emp-busca"]','amox');
 await pg.fill('[data-fc="emp-qtd"]','40');
 await pg.click('[data-fc="emp-pend"]');
 await pg.click('[data-fc="emp-salvar"]');await pg.waitForTimeout(500);
 r=await pg.evaluate(()=>Object.values(window.__store.entries).filter(x=>x.entradaEspecial==='emprestimo'&&x.emprestimoTipo==='recebido'));
 ok(r.length===1&&r[0].tipo==='entrada'&&r[0].lotePendente===true&&await qtdEst('m2')===90,'receber emprestado entra no estoque (50 -> 90), lote pendente');
 t=await body(pg);
 ok(/Devemos \(1\)/.test(t)&&t.includes('Recebido de Prefeitura Z'),'ficou pendente em "Devemos"');
 // devolvemos 40
 await pg.click('[data-fc^="emp-acertar-"]');
 await pg.fill('[data-fc="emp-dev-qtd"]','45');await pg.click('[data-fc="emp-dev-ok"]');
 ok((await pg.textContent('[data-fc="emp-dev-erro"]')).includes('40'),'não deixa devolver mais do que devemos');
 await pg.fill('[data-fc="emp-dev-qtd"]','40');
 await pg.click('[data-fc="emp-dev-ok"]');await pg.waitForTimeout(500); await (async()=>{await pg.waitForTimeout(250);await pg.locator('button:has-text("Devolver")').last().click();await pg.waitForTimeout(400);})();
 t=await body(pg);
 ok(await qtdEst('m2')===50&&/Devemos \(0\)/.test(t),'devolver sai do estoque (90 -> 50) e zera "Devemos"');
 const cons=await pg.evaluate(()=>Object.values(window.__store.entries).filter(x=>x.entradaEspecial==='emprestimo'&&x.tipo==='saida').every(x=>x.destino==='emprestimo'));
 ok(cons,'saídas de empréstimo marcadas como destino "Empréstimo" (não consumo)');
 ok(errs.filter(e=>!e.includes('ERR_FAILED')).length===0,'sem erros JS '+errs.join('|'));
 await br.close();
 console.log(falhas?falhas+' FALHAS':'TUDO OK');process.exit(falhas?1:0);
})().catch(e=>{console.error(e);process.exit(2);});
