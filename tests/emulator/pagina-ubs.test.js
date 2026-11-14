const H0=require('../lib/harness.js');
process.env.FIRESTORE_EMULATOR_HOST='localhost:8085';
const admin=require('firebase-admin');admin.initializeApp({projectId:process.env.FC_PROJ});const db=admin.firestore();
const {processar}=require('../../functions/ubs.js');
const { chromium } = require('playwright');
(async()=>{
 const T='itaquitinga-pe';
 await db.collection('tenants').doc(T).set({nome:'Itaquitinga',ativo:true});
 await db.collection('medicamentos').doc('m1').set({tenant_id:T,nome:'Dipirona 500mg',unidade:'cp'});
 await db.collection('medicamentos').doc('m2').set({tenant_id:T,nome:'Amoxicilina 500mg',unidade:'cp'});
 await db.collection('ubs').doc('u1').set({tenant_id:T,nome:'UBS Centro',ativa:true,materiais:['m1','m2']});
 const hoje=new Date().toLocaleDateString('en-CA',{timeZone:'America/Recife'});
 await db.collection('ubs_periodos').doc('p1').set({tenant_id:T,nome:'Semana atual',tipo:'semanal',inicio:hoje,fim:hoje});
 const br=await H0.launch();
 const pg=await (await br.newContext({locale:'pt-BR',viewport:{width:390,height:844},deviceScaleFactor:1})).newPage();
 const errs=[];pg.on('pageerror',e=>errs.push(e.message));
 await pg.route('**/ubsApi',async r=>{const b=JSON.parse(r.request().postData());const res=await processar(db,b,{ip:'5.5.5.5',agora:new Date()});await r.fulfill({status:res.status,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(res.json)});});
 await pg.route('**/fonts.*/**',r=>r.abort());
 await pg.goto('file://'+require('path').resolve(__dirname,'..','..')+'/ubs/index.html?m='+T);
 let falhas=0;const ok=(c,m)=>{console.log((c?'OK  ':'FALHA ')+m);if(!c)falhas++;};
 const body=()=>pg.evaluate(()=>document.body.innerText);
 await pg.waitForSelector('#f-ubs');
 ok((await body()).includes('aberto de'),'mostra período aberto');
 await pg.fill('#f-nome','Maria Enfermeira');await pg.selectOption('#f-ubs','u1');
 await pg.click('text=Fazer solicitação');
 await pg.waitForSelector('input[type=search]');
 await pg.fill('input[type=search]','dipi');await pg.click('.sug button');
 await pg.fill('input.q','40');
 await pg.fill('input[type=search]','xyz');await pg.click('text=Nenhum resultado');
 await pg.fill('input[placeholder="Nome do material"]','Fita glicemia');await pg.fill('input[placeholder="Quantidade"]','3');await pg.fill('textarea[placeholder^="Por que"]','Diabéticos');
 await pg.click('text=Adicionar à lista');
 await pg.click('text=Revisar e enviar');
 ok((await body()).includes('Total: 43'),'resumo antes de enviar com total');
 await pg.click('text=Confirmar e enviar');await pg.waitForSelector('.proto');
 const proto=await pg.textContent('.proto');ok(/^UBS-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(proto),'protocolo exibido '+proto);
 // novo envio bloqueado
 await pg.click('text=Voltar ao início');await pg.waitForSelector('#f-ubs');await pg.selectOption('#f-ubs','u1');await pg.fill('#f-nome','Maria Enfermeira');
 await pg.click('text=Fazer solicitação');await pg.waitForSelector('.msg');
 ok((await body()).includes('já enviou'),'segundo envio bloqueado na tela');
 // consultar
 await pg.click('button:has-text("Consultar solicitação")');await pg.fill('input[placeholder="UBS-XXXX-XXXX"]',proto.toLowerCase());await pg.click('button:has-text("Consultar")');
 await pg.waitForSelector('table');
 let t=await body();ok(t.includes('Aguardando')||t.includes('aguardando'),'consulta mostra status')
 ok(!t.includes('Fita')===false&&t.includes('Fora da lista'),'consulta mostra item fora da lista');
 // devolver no banco e corrigir
 await db.collection('ubs_solicitacoes').doc(T+'__'+proto).update({status:'devolvida',obsFarm:'Reduza a dipirona'});
 await pg.click('text=Atualizar');await pg.waitForSelector('text=Corrigir e reenviar');
 ok((await body()).includes('Reduza a dipirona'),'enfermeira vê observação da farmácia');
 await pg.click('text=Corrigir e reenviar');await pg.waitForSelector('input.q');
 await pg.fill('input.q >> nth=0','10');await pg.click('text=Revisar e enviar');await pg.click('text=Reenviar solicitação');await pg.waitForSelector('.proto');
 const d=(await db.collection('ubs_solicitacoes').doc(T+'__'+proto).get()).data();
 ok(d.status==='enviada'&&d.itens[0].qtdSolicitada===10,'correção reenviada e gravada');
 // protocolo errado
 await pg.click('text=Voltar ao início');await pg.waitForSelector('#f-ubs');await pg.selectOption('#f-ubs','u1');await pg.click('button:has-text("Consultar solicitação")');
 await pg.fill('input[placeholder="UBS-XXXX-XXXX"]','UBS-ZZZZ-ZZZZ');await pg.click('button:has-text("Consultar")');await pg.waitForSelector('.m-err');
 ok((await body()).includes('não encontrada'),'protocolo inexistente recusado');
 await pg.fill('input[placeholder="UBS-XXXX-XXXX"]','');await pg.reload();await pg.waitForSelector('#f-ubs');await pg.selectOption('#f-ubs','u1');await pg.click('button:has-text("Consultar solicitação")');await pg.waitForSelector('.meus');
 ok((await body()).includes('Protocolos deste aparelho')&&(await body()).includes(proto),'protocolo salvo no aparelho (perdeu o número)');
 const sw=await pg.evaluate(()=>document.documentElement.scrollWidth);ok(sw<=390,'sem rolagem horizontal no celular ('+sw+')');
 ok(errs.length===0,'sem erros JS '+errs.join('|'));
 console.log(falhas?falhas+' FALHAS':'TUDO OK');await br.close();process.exit(falhas?1:0);
})().catch(e=>{console.error(e);process.exit(2);});
