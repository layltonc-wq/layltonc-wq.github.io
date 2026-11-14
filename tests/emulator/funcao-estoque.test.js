process.env.FIRESTORE_EMULATOR_HOST='localhost:8085';process.env.GCLOUD_PROJECT=process.env.FC_PROJ;
const Module=require('module');const orig=Module._resolveFilename;
Module._resolveFilename=function(r,...a){return orig.call(this,r,...a);};
const admin=require('firebase-admin');
const fn=require('../../functions/index.js');
const db=admin.firestore();
(async()=>{
 await db.collection('medicamentos').doc('m1').set({nome:'X',estoqueAtual:100});
 const ev=(b,a)=>({params:{entryId:'e'},data:{before:{exists:!!b,data:()=>b},after:{exists:!!a,data:()=>a}}});
 const run=fn.atualizarEstoqueAtual.run||fn.atualizarEstoqueAtual;
 const ent=(tipo,q,local)=>({medicamentoId:'m1',tipo,quantidade:q,local});
 // transferência CAF->Sat 30
 await run(ev(null,ent('saida',30,'caf')));await run(ev(null,ent('entrada',30,'satelite')));
 // saída no satélite 5
 await run(ev(null,ent('saida',5,'satelite')));
 // lançamento antigo sem local (CAF) entrada 10
 await run(ev(null,{medicamentoId:'m1',tipo:'entrada',quantidade:10}));
 const d=(await db.collection('medicamentos').doc('m1').get()).data();
 const tot=d.estoqueAtual,sat=(d.estoqueLocal||{}).satelite||0;
 console.log('total',tot,'sat',sat,'caf',tot-sat);
 const okk=tot===105&&sat===25&&tot-sat===80;
 // exclusão da saída do satélite
 await run(ev(ent('saida',5,'satelite'),null));
 const d2=(await db.collection('medicamentos').doc('m1').get()).data();
 console.log(okk&&d2.estoqueAtual===110&&d2.estoqueLocal.satelite===30?'OK função local':'FALHA função local',d2);
 setTimeout(()=>process.exit(0),300);
})().catch(e=>{console.error(e);process.exit(1);});
