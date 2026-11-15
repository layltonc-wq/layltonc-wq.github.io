process.env.FIRESTORE_EMULATOR_HOST='localhost:8085';
const admin=require('firebase-admin');admin.initializeApp({projectId:process.env.FC_PROJ});
const db=admin.firestore();const {processar}=require('../../functions/ubs.js');
let falhas=0;const ok=(c,m)=>{console.log((c?'OK  ':'FALHA ')+m);if(!c)falhas++;};
const call=(b,ip,agora)=>processar(db,b,{ip:ip||'1.1.1.1',agora:agora||new Date('2026-11-12T15:00:00Z')});
(async()=>{
 await db.collection('tenants').doc('itaquitinga-pe').set({nome:'Itaquitinga',ativo:true});
 await db.collection('tenants').doc('vicencia-pe').set({nome:'Vicência',ativo:true});
 await db.collection('medicamentos').doc('m1').set({tenant_id:'itaquitinga-pe',nome:'Dipirona 500mg',unidade:'cp'});
 await db.collection('medicamentos').doc('m2').set({tenant_id:'itaquitinga-pe',nome:'Amoxicilina',unidade:'cp'});
 await db.collection('medicamentos').doc('mv').set({tenant_id:'vicencia-pe',nome:'Secreto Vicencia'});
 await db.collection('ubs').doc('u1').set({tenant_id:'itaquitinga-pe',nome:'UBS Centro',ativa:true,materiais:['m1','mv']});
 await db.collection('ubs').doc('u2').set({tenant_id:'itaquitinga-pe',nome:'UBS Norte',ativa:true,materiais:['m1','m2']});
 await db.collection('ubs').doc('u3').set({tenant_id:'itaquitinga-pe',nome:'UBS Velha',ativa:false,materiais:[]});
 await db.collection('ubs').doc('uv').set({tenant_id:'vicencia-pe',nome:'UBS Vicencia',ativa:true,materiais:[]});
 await db.collection('ubs_periodos').doc('p1').set({tenant_id:'itaquitinga-pe',tipo:'semanal',nome:'Semana 46',inicio:'2026-11-09',fim:'2026-11-15'});
 const T='itaquitinga-pe';
 let r=await call({acao:'info',tenant:T});
 ok(r.json.ok&&r.json.ubs.length===2&&r.json.periodo.id==='p1','info lista só UBS ativas e período aberto');
 r=await call({acao:'info',tenant:'nao-existe'});ok(!r.json.ok,'tenant inexistente recusado');
 r=await call({acao:'ubs',tenant:T,ubsId:'u1'});
 ok(r.json.materiais.length===1&&r.json.materiais[0].id==='m1','catálogo só com materiais do próprio tenant e liberados');
 r=await call({acao:'ubs',tenant:T,ubsId:'uv'});ok(!r.json.ok,'UBS de outro município recusada');
 const env={acao:'enviar',tenant:T,ubsId:'u1',nome:'Maria Enf',itens:[{medId:'m1',qtd:50},{nome:'Fita glicemia',qtd:3,justificativa:'diabéticos'}]};
 r=await call(env);ok(r.json.ok&&/^UBS-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(r.json.protocolo),'envio gera protocolo '+r.json.protocolo);const proto=r.json.protocolo;
 r=await call(env);ok(!r.json.ok&&r.json.codigo==='ja_enviou','segundo envio no período bloqueado');
 // concorrência
 const conc=await Promise.all([1,2,3,4,5,6].map(()=>call({...env,ubsId:'u2',itens:[{medId:'m2',qtd:1}]},'9.9.9.'+Math.random())));
 ok(conc.filter(x=>x.json.ok).length===1,'6 envios simultâneos -> só 1 aceito');
 // fora do período
 r=await call({...env,ubsId:'u2'},'2.2.2.2',new Date('2026-11-20T15:00:00Z'));ok(!r.json.ok&&r.json.codigo==='fora_do_periodo','fora do período recusado');
 r=await call({...env,ubsId:'u3'},'3.3.3.3');ok(!r.json.ok,'UBS desativada recusada');
 // material não permitido / vicência
 r=await call({...env,ubsId:'u2',itens:[{medId:'mv',qtd:1}]},'4.4.4.4');ok(!r.json.ok&&r.json.codigo==='material_nao_permitido','material de outro município/não liberado recusado');
 r=await call({...env,ubsId:'u2',itens:[{medId:'m1',qtd:0}]},'4.4.4.4');ok(!r.json.ok,'quantidade zero recusada');
 r=await call({...env,ubsId:'u2',itens:[{medId:'m1',qtd:2.5}]},'4.4.4.4');ok(!r.json.ok,'quantidade decimal recusada');
 // liberação pela gestora
 await db.collection('ubs_envios').doc(`${T}__u1__p1`).delete();
 // consulta
 r=await call({acao:'consultar',tenant:T,ubsId:'u1',protocolo:proto.toLowerCase().replace(/-/g,' ')});
 ok(r.json.ok&&r.json.solicitacao.itens.length===2&&r.json.solicitacao.itens[0].qtdAprovada===null,'consulta por protocolo (formato livre)');
 ok(!JSON.stringify(r.json).match(/estoque|tenant_id|historico.*por/i),'consulta não vaza estoque/tenant');
 r=await call({acao:'consultar',tenant:T,ubsId:'u2',protocolo:proto});ok(!r.json.ok,'protocolo de outra UBS não consulta');
 r=await call({acao:'consultar',tenant:'vicencia-pe',ubsId:'uv',protocolo:proto});ok(!r.json.ok,'protocolo de outro município não consulta');
 // corrigir
 r=await call({acao:'corrigir',tenant:T,ubsId:'u1',protocolo:proto,itens:[{medId:'m1',qtd:5}]});ok(!r.json.ok&&r.json.codigo==='nao_devolvida','correção só se devolvida');
 const sref=db.collection('ubs_solicitacoes').doc(`${T}__${proto}`);
 await sref.update({status:'devolvida',obsFarm:'Reduzir'});
 r=await call({acao:'corrigir',tenant:T,ubsId:'u1',protocolo:proto,nome:'Maria Enf',itens:[{medId:'m1',qtd:5}]});ok(r.json.ok,'correção aceita');
 const d=(await sref.get()).data();ok(d.status==='enviada'&&d.itens.length===1&&d.historico.length===2,'status volta a enviada e histórico registra');
 // reenvio libera novo envio? (gestora liberou antes) -> novo envio permitido
 r=await call(env);ok(r.json.ok,'após liberação nova solicitação aceita');
 // brute force
 let bloq=0;for(let i=0;i<14;i++){const x=await call({acao:'consultar',tenant:T,ubsId:'u2',protocolo:'UBS-AAAA-BBBB'},'7.7.7.'+i);if(x.json.codigo==='muitas_tentativas')bloq++;}
 ok(bloq>0,'tentativas erradas na mesma UBS bloqueiam ('+bloq+' bloqueadas)');
 // ip flood
 let b2=0;for(let i=0;i<45;i++){const x=await call({acao:'consultar',tenant:T,ubsId:'u1',protocolo:proto},'8.8.8.8');if(x.json.codigo==='muitas_tentativas')b2++;}
 ok(b2>0,'excesso de consultas do mesmo IP bloqueia');
 console.log(falhas?'\n'+falhas+' FALHAS':'\nTUDO OK');process.exit(falhas?1:0);
})().catch(e=>{console.error(e);process.exit(2)});
