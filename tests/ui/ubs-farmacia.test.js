const H0=require('../lib/harness.js');
const { chromium } = require('playwright');
const fs=require('fs');
const R=require('path').resolve(__dirname,'..','..')+'/';
(async()=>{
 const br=await H0.launch();
 const pg=await (await br.newContext({locale:'pt-BR',viewport:{width:420,height:900}})).newPage();
 const errs=[];pg.on('pageerror',e=>errs.push('PAGEERR '+e.message));pg.on('console',m=>{if(m.type()==='error')errs.push('CONSOLE '+m.text());});
 pg.on('dialog',d=>d.accept());
 await pg.setContent('<!doctype html><html><body><div id="root"></div></body></html>');
 await pg.addScriptTag({path:require('../lib/harness.js').reactPaths().react});
 await pg.addScriptTag({path:require('../lib/harness.js').reactPaths().reactDom});
 await pg.addScriptTag({path:require('path').join(require('path').dirname(require.resolve('xlsx/package.json')),'dist','xlsx.full.min.js')});
 await pg.evaluate(()=>{window.__RD=window.ReactDOM;window.ReactDOM={createRoot:()=>({render(){}})};window.firebase={apps:[]};
  window.__store={};window.__ls=[];
  function coll(n){return window.__store[n]||(window.__store[n]={});}
  function notify(){window.__ls.forEach(l=>l.run());}
  let seq=0;
  window.__fakeDb={collection(n){
   const q={f:[],lim:1e9};
   const o={where(f,op,v){q.f.push([f,v]);return o;},limit(n2){q.lim=n2;return o;},
    onSnapshot(cb){const l={run(){const docs=Object.entries(coll(n)).filter(([id,d])=>q.f.every(([f,v])=>d[f]===v)).slice(0,q.lim).map(([id,d])=>({id,data:()=>JSON.parse(JSON.stringify(d))}));cb({docs,forEach:fn=>docs.forEach(fn)});}};window.__ls.push(l);l.run();return()=>{window.__ls=window.__ls.filter(x=>x!==l);};},
    add(d){const id='a'+(++seq);coll(n)[id]=JSON.parse(JSON.stringify(d));notify();return Promise.resolve({id});},
    doc(id){return{update(d){Object.assign(coll(n)[id],JSON.parse(JSON.stringify(d)));notify();return Promise.resolve();},set(d){coll(n)[id]=JSON.parse(JSON.stringify(d));notify();return Promise.resolve();},delete(){delete coll(n)[id];notify();return Promise.resolve();},get(){const d=coll(n)[id];return Promise.resolve({exists:!!d,data:()=>d});}};}};
   return o;}};
 });
 await pg.addScriptTag({path:R+'app.js'});
 // seed + mount
 await pg.evaluate(()=>{
  db=window.__fakeDb;const S=window.__store;
  const T='itaquitinga-pe';
  S.medicamentos={m1:{nome:'Dipirona 500mg',tenant_id:T},m2:{nome:'Amoxicilina 500mg',tenant_id:T},m3:{nome:'Seringa 5ml',tenant_id:T}};
  const en=(med,q,lote,val,t)=>({medicamentoId:med,medicamentoNome:med,tipo:'entrada',quantidade:q,lote,validade:val,criadoEm:t,tenant_id:T});
  S.entries={e1:en('m1',50,'L0','01/2020','2025-01-01'),e2:en('m1',30,'L1','01/2028','2026-01-01'),e3:en('m1',100,'L2','06/2029','2026-02-01'),e4:en('m2',10,'A1','01/2029','2026-01-01')};
  S.ubs={u1:{nome:'UBS Centro',ativa:true,materiais:['m1','m2'],tenant_id:T},u2:{nome:'UBS Norte',ativa:true,materiais:['m1'],tenant_id:T}};
  const hoje=new Date().toLocaleDateString('en-CA',{timeZone:'America/Recife'});
  const d=(n)=>{const x=new Date(hoje+'T12:00:00');x.setDate(x.getDate()+n);return x.toISOString().slice(0,10);};
  S.ubs_periodos={p1:{nome:'Semana atual',tipo:'semanal',inicio:d(-2),fim:d(4),tenant_id:T}};
  const it=(id,med,nome,q,extra)=>Object.assign({id,medId:med,nome,qtdSolicitada:q,obs:'',foraDaLista:!med,justificativa:'',qtdAprovada:null,qtdSeparada:0,obsFarm:''},extra||{});
  const sol=(prot,ubs,nm,itens)=>({tenant_id:T,ubsId:ubs,ubsNome:nm,periodoId:'p1',periodoNome:'Semana atual',periodoInicio:d(-2),periodoFim:d(4),protocolo:prot,enfermeira:'Maria',itens,obs:'',status:'enviada',obsFarm:'',historico:[{em:new Date().toISOString(),acao:'enviada',por:'Maria',obs:''}],criadoEm:new Date().toISOString(),atualizadoEm:new Date().toISOString()});
  S.ubs_solicitacoes={s1:sol('UBS-AAAA-1111','u1','UBS Centro',[it('i1','m1','Dipirona 500mg',200),it('i2','m2','Amoxicilina 500mg',5),it('i3','','Fita glicemia',3,{justificativa:'diabéticos'})]),s2:sol('UBS-BBBB-2222','u2','UBS Norte',[it('i4','m1','Dipirona 500mg',20)])};
  S.ubs_envios={['itaquitinga-pe__u1__p1']:{tenant_id:T,ubsId:'u1',periodoId:'p1',protocolo:'UBS-AAAA-1111'},['itaquitinga-pe__u2__p1']:{tenant_id:T,ubsId:'u2',periodoId:'p1',protocolo:'UBS-BBBB-2222'}};
  window.__saved=[];XLSX.writeFile=function(wb,n){window.__saved.push(n);};window.__printed=[];_imprimirDoc=function(h){window.__printed.push(h);};
  const user={uid:'g1',name:'Gestora Teste',role:window.__role||'tecnico',tenant_id:T};
  function Host(){const _e=React.useState([]);React.useEffect(()=>{const l={run(){setE(Object.values(window.__store.entries||{}).map(x=>Object.assign({},x)));}};const setE=_e[1];window.__ls.push(l);l.run();return()=>{};},[]);
   return React.createElement(TabUbs,{user,entries:_e[0],medications:Object.entries(window.__store.medicamentos).map(([id,m])=>Object.assign({id},m))});}
  window.__RD.createRoot(document.getElementById('root')).render(React.createElement(Host));
 });
 let falhas=0;const ok=(c,m)=>{console.log((c?'OK  ':'FALHA ')+m);if(!c)falhas++;};
 const txt=()=>pg.evaluate(()=>document.body.innerText);
 await pg.waitForSelector('[data-ubs="sol-UBS-AAAA-1111"]');
 let t=await txt();
 ok(t.includes('Estoque insuficiente'),'lista mostra alerta de estoque insuficiente');
 ok(t.includes('1 fora da lista'),'lista destaca item fora da lista');
 ok(t.includes('Enviou · UBS-AAAA-1111'),'painel do período mostra quem enviou');
 // liberar novo envio u2
 await pg.click('[data-ubs="liberar-u2"]');
 ok(await pg.evaluate(()=>!window.__store.ubs_envios['itaquitinga-pe__u2__p1']),'gestora libera novo envio (apaga trava)');
 await pg.click('[data-ubs="sol-UBS-AAAA-1111"]');
 await pg.waitForSelector('[data-ubs="detalhe"]');
 t=await txt();
 ok(t.includes('FORA DA LISTA')&&t.includes('diabéticos'),'detalhe destaca fora da lista com justificativa');
 ok(/EM ESTOQUE\s*130/.test(t.replace(/\n/g,' ')),'estoque disponível ignora lote vencido (130)');
 // ajustar sem obs -> erro
 await pg.fill('[data-ubs="ap-i1"]','100');await pg.fill('[data-ubs="ap-i3"]','0');
 await pg.click('[data-ubs="aprovar"]');
 ok((await pg.textContent('[data-ubs="erro"]')).includes('observação'),'ajuste exige observação');
 // devolver sem obs -> erro
 await pg.click('[data-ubs="devolver"]');
 ok((await pg.textContent('[data-ubs="erro"]')).includes('corrigir'),'devolver exige observação');
 // aprovar com obs
 await pg.fill('[data-ubs="obs-geral"]','Reduzi dipirona');
 await pg.click('[data-ubs="aprovar"]');
 await pg.waitForTimeout(200);
 let s=await pg.evaluate(()=>window.__store.ubs_solicitacoes.s1);
 ok(s.status==='aprovada'&&s.itens[0].qtdAprovada===100&&s.itens[2].qtdAprovada===0&&s.obsFarm==='Reduzi dipirona','aprovação com ajuste gravada');
 // separar parcial
 await pg.click('[data-ubs="sol-UBS-AAAA-1111"]');await pg.waitForSelector('[data-ubs="sep-i1"]');
 await pg.fill('[data-ubs="sep-i1"]','150');await pg.click('[data-ubs="separar"]');
 ok((await pg.textContent('[data-ubs="erro"]')).includes('maior'),'separar acima do aprovado bloqueado');
 await pg.fill('[data-ubs="sep-i1"]','40');await pg.click('[data-ubs="separar"]');
 await pg.waitForTimeout(300);
 let r=await pg.evaluate(()=>({s:window.__store.ubs_solicitacoes.s1,e:Object.values(window.__store.entries).filter(x=>x.tipo==='saida')}));
 ok(r.s.status==='parcial'&&r.s.itens[0].qtdSeparada===40,'separação parcial -> status parcial');
 ok(r.e.length===2&&r.e.find(x=>x.lote==='L1').quantidade===30&&r.e.find(x=>x.lote==='L2').quantidade===10,'baixa FEFO: 30 do L1 + 10 do L2, sem tocar no vencido');
 ok(r.e.every(x=>x.destino==='ubs'&&x.ubsNome==='UBS Centro'&&x.autorNome==='Gestora Teste'),'saídas registram UBS, funcionário');
 // saldo: tentar separar mais que disponível => esgota; pendente 60, disponível 90
 await pg.click('[data-ubs="sol-UBS-AAAA-1111"]');await pg.waitForSelector('[data-ubs="sep-i1"]');
 await pg.fill('[data-ubs="sep-i1"]','60');await pg.click('[data-ubs="separar"]');await pg.waitForTimeout(300);
 s=await pg.evaluate(()=>window.__store.ubs_solicitacoes.s1);
 ok(s.status==='parcial'&&s.itens[0].qtdSeparada===100,'item 1 completo, amoxicilina ainda pendente -> parcial');
 await pg.click('[data-ubs="sol-UBS-AAAA-1111"]');await pg.waitForSelector('[data-ubs="sep-i2"]');await pg.fill('[data-ubs="sep-i2"]','5');await pg.click('[data-ubs="separar"]');await pg.waitForTimeout(300);
 s=await pg.evaluate(()=>window.__store.ubs_solicitacoes.s1);
 ok(s.status==='separada','tudo separado -> status separada');
 // estorno
 await pg.click('[data-ubs="sol-UBS-AAAA-1111"]');await pg.waitForSelector('[data-ubs^="estornar-"]');
 const bt=(await pg.$$('[data-ubs^="estornar-"]'))[0];await bt.click();
 await pg.fill('[data-ubs="justificativa"]','Separado errado');
 await (await pg.$$('[data-ubs^="estornar-"]'))[0].click();await pg.waitForTimeout(300);
 r=await pg.evaluate(()=>({s:window.__store.ubs_solicitacoes.s1,e:Object.values(window.__store.entries).filter(x=>x.estornoUbs)}));
 ok(r.e.length===2&&r.s.itens[0].qtdSeparada===60&&r.s.status==='parcial','estorno devolve ao estoque e reabre pendência');
 // s2: devolver e cancelar
 await pg.click('[data-ubs="sol-UBS-BBBB-2222"]');await pg.waitForSelector('[data-ubs="detalhe"]');
 await pg.fill('[data-ubs="obs-geral"]','Revise quantidade');await pg.click('[data-ubs="devolver"]');await pg.waitForTimeout(200);
 s=await pg.evaluate(()=>window.__store.ubs_solicitacoes.s2);ok(s.status==='devolvida'&&s.obsFarm==='Revise quantidade','devolução grava observação');
 await pg.evaluate(()=>{window.__store.ubs_solicitacoes.s2.status='enviada';window.__ls.forEach(l=>l.run());});
 await pg.click('[data-ubs="sol-UBS-BBBB-2222"]');await pg.waitForSelector('[data-ubs="cancelar"]');
 await pg.click('[data-ubs="cancelar"]');ok((await pg.textContent('[data-ubs="erro"]')).includes('justificativa'),'cancelar pede justificativa');
 await pg.fill('[data-ubs="justificativa"]','Duplicada');await pg.click('[data-ubs="cancelar"]');await pg.waitForTimeout(200);
 s=await pg.evaluate(()=>window.__store.ubs_solicitacoes.s2);ok(s.status==='cancelada','cancelamento gravado');
 // reserva entre UBS
 await pg.evaluate(()=>{const S=window.__store;S.ubs_solicitacoes.s2.status='enviada';S.ubs_solicitacoes.s2.itens[0].qtdSolicitada=100;S.ubs_solicitacoes.s1.status='aprovada';S.ubs_solicitacoes.s1.itens.forEach(i=>{i.qtdAprovada=i.qtdSolicitada===200?80:i.qtdAprovada;i.qtdSeparada=0;});window.__ls.forEach(l=>l.run());});
 await pg.click('[data-ubs="demanda-titulo"]');
 t=await txt();ok(t.includes('Pedidos x estoque')&&t.includes('UBS Norte 100 (aguardando)')&&t.includes('UBS Centro 80 (aprovado)'),'painel pedidos x estoque soma por UBS');
 await pg.click('[data-ubs="sol-UBS-BBBB-2222"]');await pg.waitForSelector('[data-ubs="detalhe"]');
 t=(await txt()).replace(/\n/g,' ');
 ok(/JÁ APROVADO P\/ OUTRAS\s*80/.test(t)&&/LIVRE\s*0/.test(t)&&t.includes('Estoque insuficiente')&&t.includes('Já aprovado (falta separar): UBS Centro 80'),'detalhe mostra reservado p/ outras UBS e livre descontando reserva');
 await pg.click('text=Fechar');
 // limpeza
 await pg.evaluate(()=>{window.__ant=Object.values(window.__store.entries).filter(x=>x.tipo==='entrada').length;window.prompt=()=>'APAGAR';});
 await pg.evaluate(()=>{window.__store.ubs_solicitacoes.s2.status='cancelada';window.__store.ubs_periodos.old={nome:'Antigo',tipo:'semanal',inicio:'2020-01-01',fim:'2020-01-07',tenant_id:'itaquitinga-pe'};window.__ls.forEach(l=>l.run());});
 await pg.click('[data-ubs="aba-lim"]');
 await pg.click('[data-ubs="lim-hist"]');await pg.waitForTimeout(300);
 r=await pg.evaluate(()=>({s:Object.values(window.__store.ubs_solicitacoes).map(x=>x.status),per:Object.keys(window.__store.ubs_periodos).length,ent:Object.values(window.__store.entries).filter(x=>x.tipo==='entrada').length}));
 ok(r.s.every(x=>x!=='separada'&&x!=='cancelada')&&r.s.length===1&&r.per===1,'histórico apaga encerradas e períodos antigos, mantém o resto');
 await pg.click('[data-ubs="lim-sol"]');await pg.waitForTimeout(400);
 r=await pg.evaluate(()=>({s:Object.keys(window.__store.ubs_solicitacoes).length,en:Object.keys(window.__store.ubs_envios).length}));
 ok(r.s===0&&r.en===0,'apagar solicitações limpa e libera envios');
 ok(await pg.evaluate(()=>Object.values(window.__store.entries).filter(x=>x.tipo==='entrada').length>=window.__ant),'separações ativas voltam ao estoque');
 await pg.click('[data-ubs="lim-ubs"]');await pg.waitForTimeout(300);
 ok(await pg.evaluate(()=>Object.keys(window.__store.ubs).length===0),'apagar cadastro de UBS');
 await pg.evaluate(()=>{window.__store.ubs={u9:{nome:'X',ativa:true,materiais:[],tenant_id:'itaquitinga-pe'}};window.__store.ubs_solicitacoes={z:{tenant_id:'itaquitinga-pe',status:'enviada',itens:[],protocolo:'P',ubsNome:'X'}};window.__ls.forEach(l=>l.run());});
 await pg.click('[data-ubs="lim-tudo"]');await pg.waitForTimeout(400);
 ok(await pg.evaluate(()=>['ubs','ubs_solicitacoes','ubs_periodos','ubs_envios'].every(k=>Object.keys(window.__store[k]).length===0)),'apagar tudo zera o módulo');
 // abas
 await pg.click('[data-ubs="aba-per"]');
 await pg.fill('[data-ubs="per-ini"]','2030-01-05');
 ok((await pg.inputValue('[data-ubs="per-fim"]'))==='2030-01-11','período semanal calcula fim (+6 dias)');
 await pg.click('[data-ubs="criar-periodo"]');await pg.waitForTimeout(150);
 ok(await pg.evaluate(()=>Object.values(window.__store.ubs_periodos).length===1),'período criado');
 await pg.fill('[data-ubs="per-ini"]','2030-01-08');await pg.click('[data-ubs="criar-periodo"]');
 ok((await txt()).includes('coincide'),'período sobreposto recusado');
 await pg.click('[data-ubs="aba-ubs"]');await pg.click('[data-ubs="nova-ubs"]');
 await pg.fill('[data-ubs="ubs-nome"]','UBS Sul');await pg.click('text=Seringa 5ml');await pg.click('[data-ubs="salvar-ubs"]');await pg.waitForTimeout(150);
 ok(await pg.evaluate(()=>Object.values(window.__store.ubs).some(u=>u.nome==='UBS Sul'&&u.materiais.length===1&&u.materiais[0]==='m3')),'cadastro de UBS com materiais liberados');
 await pg.locator('button:has-text("Editar")').last().click();await pg.click('[data-ubs="excluir-ubs"]');await pg.waitForTimeout(150);
 ok(await pg.evaluate(()=>!Object.values(window.__store.ubs).some(u=>u.nome==='UBS Sul')),'excluir UBS');
 await pg.click('[data-ubs="aba-rel"]');await pg.click('[data-ubs="rel-xlsx"]');await pg.click('[data-ubs="rel-pdf"]');
 ok(await pg.evaluate(()=>window.__saved.length===1&&window.__printed.length===1&&window.__printed[0].includes('Solicitações das UBS')),'relatório exporta Excel e PDF');
 ok(errs.length===0,'sem erros de console/página '+errs.join(' | '));
 console.log(falhas?falhas+' FALHAS':'TUDO OK');await br.close();process.exit(falhas?1:0);
})().catch(e=>{console.error(e);process.exit(2);});
