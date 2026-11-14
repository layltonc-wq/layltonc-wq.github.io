process.env.FIRESTORE_EMULATOR_HOST='localhost:8085';
const admin=require('firebase-admin');admin.initializeApp({projectId:process.env.FC_PROJ});
const db=admin.firestore();const U=require('../../functions/ubs.js');
let falhas=0;const ok=(c,m)=>{console.log((c?'OK  ':'FALHA ')+m);if(!c)falhas++;};
const call=(b,ip,agora)=>U.processar(db,b,{ip:ip||'1.1.1.1',agora:agora||new Date('2026-11-12T15:00:00Z')});
(async()=>{
 const T='vicencia-pe';
 await db.collection('tenants').doc(T).set({nome:'Vicência',ativo:true});
 await db.collection('tenants').doc('itaquitinga-pe').set({nome:'Itaquitinga',ativo:true});
 const sa=(med,nome,q,lote,val,ubs,em,extra)=>db.collection('entries').add(Object.assign({tenant_id:T,tipo:'saida',medicamentoId:med,medicamentoNome:nome,quantidade:q,lote,validade:val,destino:'ubs',ubsNome:ubs,criadoEm:em},extra||{}));
 await sa('m1','Dipirona',100,'L1','01/2027','João Ramos','2026-10-20T10:00:00Z');
 await sa('m1','Dipirona',50,'l1 ','01/2027','João Ramos','2026-10-25T10:00:00Z');
 await sa('m2','Amoxicilina',30,'A9','12/26','João Ramos','2026-10-21T10:00:00Z');
 await sa('m2','Amoxicilina',99,'A9','12/2026','Agrovila','2026-10-21T10:00:00Z');
 await sa('m1','Dipirona',7,'L1','01/2027','João Ramos','2026-10-22T10:00:00Z',{descarte:true});
 await db.collection('entries').add({tenant_id:T,tipo:'saida',medicamentoId:'m1',medicamentoNome:'Dipirona',quantidade:5,lote:'L1',validade:'01/2027',destino:'sus',criadoEm:'2026-10-23T10:00:00Z'});
 await db.collection('entries').add({tenant_id:'itaquitinga-pe',tipo:'saida',medicamentoId:'m1',medicamentoNome:'Dipirona',quantidade:9,lote:'L1',validade:'01/2027',destino:'ubs',ubsNome:'João Ramos',criadoEm:'2026-10-23T10:00:00Z'});
 let r=await call({acao:'confInfo',tenant:T});ok(!r.json.ok&&r.json.codigo==='conf_inativa','link desativado por padrão');
 await db.collection('config').doc('ubsconf__'+T).set({ativo:true,codigo:'4321',tenant_id:T});
 r=await call({acao:'confInfo',tenant:T});ok(r.json.ok&&r.json.exigeCodigo&&r.json.liberado===false&&r.json.ubs.length===0,'sem código não lista UBS');
 r=await call({acao:'confInfo',tenant:T,codigo:'0000'});ok(!r.json.ok&&r.json.codigo==='codigo_invalido','código errado recusado');
 r=await call({acao:'confInfo',tenant:T,codigo:'4321'});ok(r.json.ok&&r.json.liberado&&r.json.ubs.length===15&&r.json.ubs.some(u=>u.nome==='João Ramos'),'código certo libera a lista padrão de UBS');
 await db.collection('config').doc('destinos__'+T).set({ubs:[{id:'a',nome:'João Ramos',ativo:true},{id:'b',nome:'Agrovila',ativo:true},{id:'c',nome:'Fechada',ativo:false}]});
 r=await call({acao:'confInfo',tenant:T,codigo:'4321'});ok(r.json.ubs.length===2,'usa a lista de UBS do app (ativas)');
 r=await call({acao:'confItens',tenant:T,codigo:'4321',ubsId:'a'});
 const it=r.json.itens;
 ok(r.json.ok&&it.length===2,'João Ramos: 2 lotes (Dipirona L1 agrupado, Amoxicilina A9) — '+JSON.stringify(it.map(x=>x.nome+x.lote+x.validade+':'+x.enviado)));
 const dip=it.find(x=>x.nome==='Dipirona'),amo=it.find(x=>x.nome==='Amoxicilina');
 ok(dip.enviado===150&&dip.estimado===150&&dip.fonte==='estimado','soma os envios do mesmo lote (100+50, ignora descarte, SUS e outro município)');
 ok(amo.validade==='12/2026'&&amo.enviado===30,'validade normalizada (12/26 -> 12/2026) e não mistura outra UBS');
 ok(it[0].nome==='Amoxicilina','ordenado por validade (vence primeiro)');
 ok(!JSON.stringify(r.json).match(/tenant_id|estoque|medId/i),'não expõe estoque, tenant nem ids');
 // enviar conferência
 const k=(x)=>x.key;
 r=await call({acao:'confEnviar',tenant:T,codigo:'4321',ubsId:'a',nome:'Maria Enf',itens:[{key:k(dip),qtd:40},{key:k(amo),qtd:0}],extras:[{nome:'Paracetamol',lote:'P1',validade:'05/2027',qtd:12}]});
 ok(r.json.ok&&r.json.itens===3,'conferência enviada (lista + item extra)');
 r=await call({acao:'confEnviar',tenant:T,codigo:'4321',ubsId:'a',nome:'Maria',itens:[{key:'x|y|z',qtd:1}]});ok(!r.json.ok&&r.json.codigo==='item_invalido','item que não pertence à UBS é recusado');
 r=await call({acao:'confEnviar',tenant:T,codigo:'4321',ubsId:'a',nome:'Maria',itens:[{key:k(dip),qtd:-3}]});ok(!r.json.ok,'quantidade negativa recusada');
 r=await call({acao:'confEnviar',tenant:T,codigo:'4321',ubsId:'a',nome:'Ma',itens:[{key:k(dip),qtd:3}]});ok(!r.json.ok,'sem nome recusado');
 r=await call({acao:'confEnviar',tenant:T,ubsId:'a',nome:'Maria',itens:[{key:k(dip),qtd:3}]});ok(!r.json.ok,'sem código recusado');
 r=await call({acao:'confEnviar',tenant:T,codigo:'4321',ubsId:'b',nome:'Maria',itens:[{key:k(dip),qtd:3}]});ok(!r.json.ok&&r.json.codigo==='item_invalido','item de outra UBS recusado');
 // nova remessa depois da conferência
 await db.collection('entries').add({tenant_id:T,tipo:'saida',medicamentoId:'m1',medicamentoNome:'Dipirona',quantidade:20,lote:'L1',validade:'01/2027',destino:'ubs',ubsNome:'João Ramos',criadoEm:'2026-11-13T10:00:00Z'});
 r=await call({acao:'confItens',tenant:T,codigo:'4321',ubsId:'a'},'2.2.2.2');
 const d2=r.json.itens.find(x=>x.nome==='Dipirona');
 ok(d2.estimado===60&&d2.fonte==='declarado','depois da conferência: declarado 40 + enviado depois 20 = 60');
 ok(!r.json.itens.some(x=>x.nome==='Amoxicilina'),'item declarado como 0 some da lista da próxima conferência');
 // código: bloqueio por tentativas
 let bl=0;for(let i=0;i<14;i++){const x=await call({acao:'confInfo',tenant:T,codigo:'x'+i},'9.9.9.9');if(x.json.codigo==='muitas_tentativas')bl++;}
 ok(bl>0,'tentativas de código erradas bloqueiam ('+bl+')');
 // Itaquitinga não tem conferência
 r=await call({acao:'confInfo',tenant:'itaquitinga-pe'},'3.3.3.3');ok(!r.json.ok&&r.json.codigo==='conf_inativa','Itaquitinga: conferência não ativada = sem acesso');
 // estimarUbs puro
 const x=U.estimarUbs([{medId:'a',nome:'A',lote:'l1',validade:'3/27',qtd:10,em:'2026-01-01'}],null);
 ok(x.length===1&&x[0].estimado===10,'estimarUbs sem conferência = enviado');
 console.log(falhas?falhas+' FALHAS':'TUDO OK');setTimeout(()=>process.exit(falhas?1:0),300);
})().catch(e=>{console.error(e);process.exit(2);});
