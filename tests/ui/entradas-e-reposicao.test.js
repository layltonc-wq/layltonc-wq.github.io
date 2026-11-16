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
 // ---- Recebimento: modos
 await go('recebimento');
 let t=await body(pg);
 ok(!t.includes('Recebimento simples')&&t.includes('Nota Fiscal')&&!t.includes('Já tenho')&&t.includes('Permuta')&&t.includes('Doação')&&t.includes('Empréstimos')&&!t.includes('Divergências'),'Recebimento: Nota Fiscal + Permuta + Doação + Empréstimos, sem aba Divergências');
 // ---- Doação
 await pg.click('[data-fc="modo-doacao"]');
 await pg.fill('[data-fc="origem"]','Secretaria X');
 await pick('[data-fc="doa-busca-0"]','amox');
 await pg.fill('[data-fc="doa-qtd-0"]','20');
 await pg.click('[data-fc="ent-salvar"]');
 ok((await pg.textContent('[data-fc="ent-erro"]')).includes('validade'),'doação: sem lote/validade não deixa salvar');
 await pg.fill('[data-fc="doa-0-val"]','03/2029');
 await pg.click('[data-fc="ent-salvar"]');
 ok((await pg.textContent('[data-fc="ent-erro"]')).includes('lote'),'doação: lote é obrigatório (ou SL)');
 await pg.click('[data-fc="doa-0-sl"]');
 await pg.click('[data-fc="ent-salvar"]');await pg.waitForTimeout(400);
 let r=await pg.evaluate(()=>({e:Object.values(window.__store.entries).filter(x=>x.entradaEspecial==='doacao'),m:window.__store.medicamentos.m2}));
 ok(r.e.length===1&&r.e[0].lote==='SL 03/2029'&&r.e[0].validade==='03/2029'&&r.e[0].quantidade===20&&r.e[0].doador==='Secretaria X'&&r.e[0].local==='caf','doação com SL grava lote "SL 03/2029" e validade, no CAF');
 ok(r.m.estoqueAtual===70,'doação entra no estoque (50 -> 70)');
 // ---- Permuta com lote pendente
 await pg.click('[data-fc="modo-permuta"]');
 await pg.fill('[data-fc="origem"]','Hospital Y');
 await pick('[data-fc="perm-sai-busca"]','dipi');
 await pg.fill('[data-fc="perm-sai-qtd"]','10');
 await pick('[data-fc="perm-ent-busca"]','amox');
 await pg.fill('[data-fc="perm-ent-qtd"]','5');
 await pg.click('[data-fc="perm-pend"]');
 await pg.click('[data-fc="ent-salvar"]');await pg.waitForTimeout(400); await (async()=>{await pg.waitForTimeout(250);await pg.locator('button:has-text("Registrar")').last().click();await pg.waitForTimeout(400);})();
 r=await pg.evaluate(()=>({e:Object.values(window.__store.entries).filter(x=>x.entradaEspecial==='permuta'),m1:window.__store.medicamentos.m1,m2:window.__store.medicamentos.m2}));
 const sa=r.e.find(x=>x.tipo==='saida'),en=r.e.find(x=>x.tipo==='entrada');
 ok(r.e.length===2&&sa.medicamentoNome==='Dipirona'&&sa.quantidade===10&&sa.lote==='L1'&&en.medicamentoNome==='Amoxicilina'&&en.quantidade===5&&en.lotePendente===true&&sa.permutaId===en.permutaId,'permuta: sai 10 Dipirona (FEFO) e entra 5 Amoxicilina com lote pendente, ligadas');
 ok(r.m1.estoqueAtual===120&&r.m2.estoqueAtual===75,'permuta já muda o estoque (Dipirona 130->120, Amoxicilina 70->75)');
 ok(await pg.$('[data-fc="pendencias"]')!==null,'lista de pendências de lote aparece');
 await pg.click('[data-fc^="pend-"]');
 await pg.fill('[data-fc="pend-val"]','05/2030');await pg.fill('[data-fc="pend-lote"]','NL77');
 await pg.click('[data-fc="pend-salvar"]');await pg.waitForTimeout(400);
 r=await pg.evaluate(()=>Object.values(window.__store.entries).find(x=>x.lotePendente===false&&x.entradaEspecial==='permuta'));
 ok(r&&r.lote==='NL77'&&r.validade==='05/2030','pendência: lote e validade informados depois, sem mexer no estoque');
 // permuta acima do disponível
 await pick('[data-fc="perm-sai-busca"]','dipi');await pg.fill('[data-fc="perm-sai-qtd"]','9999');
 await pg.fill('[data-fc="origem"]','Zeta');await pick('[data-fc="perm-ent-busca"]','amox');await pg.fill('[data-fc="perm-ent-qtd"]','1');await pg.click('[data-fc="perm-pend"]');
 await pg.click('[data-fc="ent-salvar"]');
 ok((await pg.textContent('[data-fc="ent-erro"]')).includes('maior que o disponível'),'permuta: bloqueia saída acima do estoque');
 // ---- Satélite: abas e produtos
 await pg.click('[data-fc="local-satelite"]');await pg.waitForTimeout(200);
 await pg.click('text=Menu >> nth=0');
 const itens=await pg.evaluate(()=>Array.from(document.querySelectorAll('[data-tour^="nav-"]')).map(b=>b.getAttribute('data-tour').replace('nav-','')));
 ok(!['leites','saidasreg','ubs'].some(x=>itens.includes(x))&&itens.includes('estoque')&&itens.includes('transferencia'),'Satélite: sem Leites, Saídas registradas e Solicitações UBS ('+itens.join(',')+')');
 await pg.click('[data-tour="nav-estoque"]');await pg.waitForTimeout(300);
 t=await body(pg);
 ok(t.includes('Dipirona')&&!t.includes('Leite Formula')&&!t.includes('Amoxicilina'),'Satélite: só produtos que tiveram movimento lá e sem leite');
 ok(!/\bLeite\b/.test((await pg.evaluate(()=>Array.from(document.querySelectorAll('.pill')).map(x=>x.innerText).join('|')))),'Satélite: sem o filtro de categoria Leite');
 // ---- Pedido de reposição (Satélite -> CAF)
 await go('transferencia');
 await pg.click('[data-fc="sub-pedir"]');
 await pick('[data-fc="repo-busca"]','amox');
 await pg.fill('[data-fc="repo-qtd-0"]','20');
 await pg.click('[data-fc="repo-enviar"]');await pg.waitForTimeout(300);
 r=await pg.evaluate(()=>Object.values(window.__store.reposicoes));
 ok(r.length===1&&r[0].status==='pendente'&&r[0].itens[0].medId==='m2'&&r[0].itens[0].qtdSolicitada===20,'Satélite envia pedido (produto que nunca teve lá, só pelo nome)');
 ok(!(await body(pg)).match(/estoque\s*caf/i),'Satélite não vê saldo do CAF no pedido');
 // ---- CAF atende
 await pg.click('[data-fc="local-caf"]');await pg.waitForTimeout(200);
 await go('transferencia');
 await pg.click('[data-fc^="sub-pedidos"]');
 await pg.click('[data-fc^="repo-item-"]');
 t=(await body(pg)).replace(/\n/g,' ');
 ok(/ESTOQUE CAF\s*75/.test(t),'CAF vê o estoque dele no pedido (75)');
 await pg.fill('[data-fc^="repo-env-"]','15');
 await pg.click('[data-fc="repo-transferir"]');await pg.waitForTimeout(400);
 r=await pg.evaluate(()=>({r:Object.values(window.__store.reposicoes)[0],e:Object.values(window.__store.entries).filter(x=>x.reposicaoId)}));
 ok(r.r.status==='parcial'&&r.r.itens[0].qtdTransferida===15&&r.e.length>=2&&r.e.some(x=>x.tipo==='saida'&&x.local==='caf')&&r.e.some(x=>x.tipo==='entrada'&&x.local==='satelite'),'CAF atende em parte: saída no CAF, entrada no Satélite, pedido "parcial"');
 await pg.click('[data-fc^="repo-item-"]');
 await pg.fill('[data-fc="repo-env-'+r.r.itens[0].id+'"]','5');await pg.click('[data-fc="repo-transferir"]');await pg.waitForTimeout(400);
 r=await pg.evaluate(()=>Object.values(window.__store.reposicoes)[0]);
 ok(r.status==='atendida'&&r.itens[0].qtdTransferida===20,'completa o pedido -> atendido');
 // ---- devolver
 await pg.click('[data-fc="local-satelite"]');await go('transferencia');await pg.click('[data-fc="sub-pedir"]');
 await pick('[data-fc="repo-busca"]','dipi');await pg.fill('[data-fc="repo-qtd-0"]','8');await pg.click('[data-fc="repo-enviar"]');await pg.waitForTimeout(300);
 await pg.click('[data-fc="local-caf"]');await go('transferencia');await pg.click('[data-fc^="sub-pedidos"]');
 await pg.click('[data-fc^="repo-item-"] >> nth=0');
 await pg.click('[data-fc="repo-devolver"]');
 ok((await pg.textContent('[data-fc="repo-det-erro"]')).includes('ajustar'),'devolver exige observação');
 await pg.fill('[data-fc="repo-obs"]','Peça menos');await pg.click('[data-fc="repo-devolver"]');await pg.waitForTimeout(300);
 r=await pg.evaluate(()=>Object.values(window.__store.reposicoes).find(x=>x.status==='devolvida'));
 ok(!!r&&r.obsCaf==='Peça menos','CAF devolve com observação');
 await pg.click('[data-fc="local-satelite"]');await go('transferencia');await pg.click('[data-fc="sub-pedir"]');
 await pg.click('[data-fc="repo-corrigir"]');await pg.fill('[data-fc="repo-qtd-0"]','3');await pg.click('[data-fc="repo-enviar"]');await pg.waitForTimeout(300);
 r=await pg.evaluate(()=>Object.values(window.__store.reposicoes).find(x=>x.itens[0].medId==='m1'));
 ok(r.status==='pendente'&&r.itens[0].qtdSolicitada===3,'Satélite corrige e reenvia');
 ok(errs.filter(e=>!e.includes('ERR_FAILED')).length===0,'sem erros JS '+errs.join('|'));
 console.log(falhas?falhas+' FALHAS':'TUDO OK');
 await br.close();process.exit(falhas?1:0);
})().catch(e=>{console.error(e);process.exit(2);});
