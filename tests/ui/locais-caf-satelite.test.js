const H0=require('../lib/harness.js');
const { chromium } = require('playwright');
const H=require('../lib/harness.js');const harness=(b,o)=>H.preparar(b,o);
const R=require('path').resolve(__dirname,'..','..')+'/';
const T='itaquitinga-pe';
function seed(){
 const en=(q,lote,t)=>({medicamentoId:'m1',medicamentoNome:'Dipirona',tipo:'entrada',quantidade:q,lote,validade:'01/2029',criadoEm:t,date:t.slice(0,10),tenant_id:T});
 return {
  tenants:{[T]:{nome:'Itaquitinga',ativo:true}},
  medicamentos:{m1:{nome:'Dipirona',categoria:'medicamento',minEstoque:0,estoqueAtual:100,tenant_id:T},m2:{nome:'Amoxicilina',categoria:'medicamento',estoqueAtual:0,tenant_id:T}},
  entries:{e1:en(100,'L1',new Date(Date.now()-5*864e5).toISOString())},
  users:{},ubs:{},ubs_periodos:{},ubs_solicitacoes:{},ubs_envios:{},plantoes:{},config:{}};
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
 return {pg,errs};
}
(async()=>{
 const br=await H0.launch();
 let falhas=0;const ok=(c,m)=>{console.log((c?'OK  ':'FALHA ')+m);if(!c)falhas++;};
 const body=pg=>pg.evaluate(()=>document.body.innerText);
 // ---- técnico (admin)
 let {pg,errs}=await abrir(br,{uid:'t1',name:'Laylton',role:'tecnico'});
 await pg.waitForSelector('[data-fc="seletor-local"]',{timeout:15000}).catch(()=>{});
 ok(await pg.$('[data-fc="seletor-local"]')!==null,'admin vê seletor CAF/Satélite');
 ok(!(await body(pg)).includes('Iniciar'),'sem tela de plantão em Itaquitinga');
 const go=async(id)=>{await pg.click('text=Menu >> nth=0').catch(()=>{});await pg.click('[data-tour="nav-'+id+'"]');await pg.waitForTimeout(250);};
 const estoque=async(nome)=>{const x=(await body(pg)).replace(/\n/g,' ');const m=x.match(new RegExp(nome+'\\s+Farm\\. Básica\\s+(-?\\d+)'));return m?parseInt(m[1],10):null;};
 await go('estoque');
 ok(await estoque('Dipirona')===100,'CAF mostra 100 (lançamentos antigos sem local = CAF)');
 await pg.click('[data-fc="local-satelite"]');await pg.waitForTimeout(200);
 ok(await estoque('Dipirona')===null,'Satélite começa sem listar o produto (ainda não recebeu nada)');
 await pg.click('[data-fc="local-caf"]');
 // transferência CAF -> Satélite 30
 await go('transferencia');
 await pg.fill('[data-fc="transf-busca"]','dipi');await pg.click('[data-fc="transf-busca"] ~ button');
 await pg.fill('[data-fc="transf-qtd"]','30');await pg.click('[data-fc="transf-ok"]');await pg.waitForTimeout(400);
 let r=await pg.evaluate(()=>({e:Object.values(window.__store.entries).filter(x=>x.transferencia),m:window.__store.medicamentos.m1}));
 ok(r.e.length===2&&r.e.some(x=>x.tipo==='saida'&&x.local==='caf'&&x.quantidade===30&&x.lote==='L1')&&r.e.some(x=>x.tipo==='entrada'&&x.local==='satelite'&&x.quantidade===30&&x.lote==='L1'&&x.validade==='01/2029'),'transferência grava saída no CAF e entrada no Satélite com o mesmo lote/validade');
 ok(r.m.estoqueAtual===100&&r.m.estoqueLocal.satelite===30,'total da prefeitura não muda; Satélite = 30');
 await go('estoque');
 ok(await estoque('Dipirona')===70,'CAF agora 70');
 await pg.click('[data-fc="local-satelite"]');await pg.waitForTimeout(200);
 ok(await estoque('Dipirona')===30,'Satélite agora 30');
 // saída avulsa no Satélite herda local
 await pg.evaluate(()=>db.collection('entries').add({medicamentoId:'m1',medicamentoNome:'Dipirona',tipo:'saida',quantidade:5,tenant_id:'itaquitinga-pe',criadoEm:new Date().toISOString(),date:'2026-11-12'}));
 await pg.waitForTimeout(300);
 ok(await estoque('Dipirona')===25,'saída feita enquanto está no Satélite sai do Satélite');
 r=await pg.evaluate(()=>Object.values(window.__store.entries).filter(x=>x.quantidade===5)[0]);ok(r.local==='satelite','lançamento novo recebe local automaticamente');
 // devolve 10 do Satélite para o CAF
 await go('transferencia');
 await pg.fill('[data-fc="transf-busca"]','dipi');await pg.click('[data-fc="transf-busca"] ~ button');
 await pg.fill('[data-fc="transf-qtd"]','10');await pg.click('[data-fc="transf-ok"]');await pg.waitForTimeout(400);
 await pg.click('[data-fc="local-caf"]');await go('estoque');
 ok(await estoque('Dipirona')===80,'após devolução, CAF = 80');
 // transferência acima do disponível
 await go('transferencia');await pg.fill('[data-fc="transf-busca"]','dipi');await pg.click('[data-fc="transf-busca"] ~ button');await pg.fill('[data-fc="transf-qtd"]','999');await pg.click('[data-fc="transf-ok"]');
 ok((await body(pg)).includes('maior que o disponível'),'transferir mais que o saldo é bloqueado');
 ok(errs.filter(e=>!e.includes('ERR_FAILED')).length===0,'admin: sem erros JS '+errs.join('|'));
 await pg.context().close();
 // ---- conta do Satélite
 ({pg,errs}=await abrir(br,{uid:'s1',name:'Aux Sat',role:'auxiliar',acessoLocal:'satelite'},s=>{s.medicamentos.m1.estoqueLocal={satelite:30};s.entries.e2={medicamentoId:'m1',medicamentoNome:'Dipirona',tipo:'entrada',quantidade:30,lote:'L1',validade:'01/2029',local:'satelite',transferencia:true,criadoEm:new Date().toISOString(),date:'2026-11-12',tenant_id:'itaquitinga-pe'};s.medicamentos.m1.estoqueAtual=100;return s;}));
 await pg.waitForSelector('[data-fc="chip-local"]',{timeout:15000}).catch(()=>{});
 ok((await pg.textContent('[data-fc="chip-local"]'))==='Satélite'&&await pg.$('[data-fc="seletor-local"]')===null,'conta do Satélite: fixa no Satélite, sem seletor');
 await go('estoque');ok(await estoque('Dipirona')===30,'conta do Satélite só vê o estoque do Satélite (30, não 100)');
 ok(errs.filter(e=>!e.includes('ERR_FAILED')).length===0,'satélite: sem erros JS '+errs.join('|'));
 await pg.context().close();
 // ---- farmacêutica só consulta
 ({pg,errs}=await abrir(br,{uid:'f1',name:'Farm',role:'farmaceutico',acessoLocal:'caf',somenteLeitura:true}));
 await pg.waitForSelector('[data-fc="chip-local"]',{timeout:15000}).catch(()=>{});
 ok((await pg.textContent('[data-fc="chip-local"]')).includes('CAF')&&(await pg.textContent('[data-fc="chip-local"]')).includes('só consulta'),'farmacêutica: CAF · só consulta');
 let tx=await body(pg);
 ok(tx.includes('InícioEstoquePedidoMenu'),'barra inferior: Início, Estoque, Pedido (sem Saída/Recebimento)');
 await pg.click('text=Menu >> nth=0');
 const itens=await pg.evaluate(()=>Array.from(document.querySelectorAll('[data-tour^="nav-"]')).map(b=>b.getAttribute('data-tour').replace('nav-','')));
 ok(itens.includes('previsao')&&itens.includes('estoque')&&!['recebimento','conferencia','leites','saidasreg','ubs','transferencia'].some(x=>itens.includes(x)),'menu da farmacêutica: tem Previsão/Pedido e Estoque; sem movimentação ('+itens.join(',')+')');
 await pg.click('[data-tour="nav-previsao"]');await pg.waitForTimeout(500);
 tx=await body(pg);ok(/Previs/.test(tx)&&!tx.includes('Acesso somente consulta'),'aba Previsão/Pedido abre para a farmacêutica');
 await pg.click('text=Menu >> nth=0');await pg.click('[data-tour="nav-estoque"]');await pg.waitForTimeout(300);
 ok(await pg.evaluate(()=>!document.body.innerText.includes('+ Novo')&&!document.body.innerText.includes('Importar Excel')),'Estoque sem botões de edição');
 ok(errs.filter(e=>!e.includes('ERR_FAILED')).length===0,'farmacêutica: sem erros JS '+errs.join('|'));
 // ---- atas visiveis para a farmaceutica + Gestao (aprovar com local)
 await pg.click('text=Menu >> nth=0');await pg.click('[data-tour="nav-previsao"]');await pg.waitForTimeout(400);
 ok((await body(pg)).includes('Gerenciar Atas'),'farmaceutica ve Gerenciar Atas dentro de Previsao/Pedido');
 await pg.context().close();
 ({pg,errs}=await abrir(br,{uid:'t1',name:'Laylton',role:'tecnico'},s=>{s.users.p1={name:'Nova Farm',role:'farmaceutico',status:'pending',tenant_id:'itaquitinga-pe',email:'n@x'};s.users.p2={name:'Aux Novo',role:'auxiliar',status:'pending',tenant_id:'itaquitinga-pe',email:'a@x'};return s;}));
 await pg.waitForSelector('[data-fc="seletor-local"]',{timeout:15000}).catch(()=>{});
 await pg.click('text=Menu >> nth=0');await pg.click('[data-tour="nav-gestao"]');await pg.waitForSelector('[data-fc="local-usuario"]',{timeout:8000}).catch(()=>{});
 ok((await pg.$$('[data-fc="local-usuario"]')).length===2,'Gestao: pendentes mostram escolha de local');
 const us0=await pg.evaluate(()=>window.__store.users);
 const ctl=(await pg.$$('[data-fc="local-usuario"]'));
 // a ordem dos cartoes segue a ordem dos usuarios: p1 (farmaceutica) e p2 (auxiliar)
 await ctl[1].$('select').then(s=>s.selectOption('satelite'));
 let bts=await pg.$$('button:has-text("Aprovar")');
 await bts[0].click();await pg.waitForTimeout(400);
 bts=await pg.$$('button:has-text("Aprovar")');
 if(bts.length){await bts[0].click();await pg.waitForTimeout(400);}
 const us=await pg.evaluate(()=>window.__store.users);
 const alvoFarm=Object.values(us).find(u=>u.name==='Nova Farm'),alvoAux=Object.values(us).find(u=>u.name==='Aux Novo');
 ok(alvoFarm.status==='approved'&&alvoFarm.acessoLocal==='caf'&&alvoFarm.somenteLeitura===true,'farmaceutica aprovada: CAF + so consulta (padrao)');
 ok(alvoAux.status==='approved'&&alvoAux.acessoLocal==='satelite'&&alvoAux.somenteLeitura===false,'auxiliar aprovada no Satelite');
 ok(errs.filter(e=>!e.includes('ERR_FAILED')).length===0,'gestao: sem erros JS '+errs.join('|'));
 console.log(falhas?falhas+' FALHAS':'TUDO OK');await br.close();process.exit(falhas?1:0);
})().catch(e=>{console.error(e);process.exit(2);});
