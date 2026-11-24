const H0=require('../lib/harness.js');
const { chromium } = require('playwright');
const H=require('../lib/harness.js');const harness=(b,o)=>H.preparar(b,o);
const R=require('path').resolve(__dirname,'..','..')+'/';
const T='vicencia-pe';
function mesAno(offDias){const d=new Date(Date.now()+offDias*864e5);return String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear();}
function seed(){
 const t0=new Date(Date.now()-40*864e5).toISOString();
 const sa=(id,med,nome,q,lote,val,ubs,em)=>({medicamentoId:med,medicamentoNome:nome,tipo:'saida',quantidade:q,lote,validade:val,destino:'ubs',destinoNome:'UBS',ubsNome:ubs,criadoEm:em,date:em.slice(0,10),tenant_id:T});
 const ent={};
 ent.e0={medicamentoId:'m1',medicamentoNome:'Dipirona',tipo:'entrada',quantidade:500,lote:'L1',validade:'01/2030',criadoEm:t0,date:t0.slice(0,10),tenant_id:T};
 ent.s1=sa('s1','m1','Dipirona',100,'L1',mesAno(-40),'João Ramos',new Date(Date.now()-30*864e5).toISOString());   // vencido
 ent.s2=sa('s2','m2','Amoxicilina',60,'A1',mesAno(0),'João Ramos',new Date(Date.now()-20*864e5).toISOString());   // <=30
 ent.s3=sa('s3','m3','Losartana',40,'LS1',mesAno(50),'Agrovila',new Date(Date.now()-10*864e5).toISOString());      // <=90
 ent.s4=sa('s4','m4','Captopril',25,'C1',mesAno(400),'Agrovila',new Date(Date.now()-10*864e5).toISOString());      // em dia
 ent.s5=Object.assign(sa('s5','m1','Dipirona',999,'L1',mesAno(-40),'João Ramos',new Date().toISOString()),{descarte:true});
 return {tenants:{[T]:{nome:'Vicência',ativo:true}},
  medicamentos:{m1:{nome:'Dipirona',categoria:'medicamento',estoqueAtual:400,tenant_id:T},m2:{nome:'Amoxicilina',categoria:'medicamento',estoqueAtual:0,tenant_id:T},m3:{nome:'Losartana',categoria:'medicamento',estoqueAtual:0,tenant_id:T},m4:{nome:'Captopril',categoria:'medicamento',estoqueAtual:0,tenant_id:T}},
  entries:ent,users:{},ubs:{},ubs_periodos:{},ubs_solicitacoes:{},ubs_envios:{},plantoes:{},config:{},reposicoes:{},ubs_conferencias:{}};
}
async function abrir(br,user,mod){
 const o={store:(mod?mod(seed()):seed()),uid:user.uid,tenant:T,user:Object.assign({status:'approved',tenant_id:T,homeTenant:T,color:'#1351B4',email:'x@x',sessionTimeout:12},user)};
 o.store.users[user.uid]={name:user.name,role:user.role,status:'approved',tenant_id:T,email:'x@x'};
 const {pg,errs}=await harness(br,o);
 await pg.goto('file://'+require('path').resolve(__dirname,'..','lib','blank.html'));
 await pg.addScriptTag({path:require('../lib/harness.js').reactPaths().react});
 await pg.addScriptTag({path:require('../lib/harness.js').reactPaths().reactDom});
 await pg.evaluate(()=>{window.XLSX={utils:{book_new(){},aoa_to_sheet(r){window.__rows=r;},book_append_sheet(){}},writeFile(){window.__xl=(window.__xl||0)+1;}};});
 await pg.addScriptTag({path:R+'app.js'});
 await pg.waitForTimeout(1200);
 return {pg,errs};
}
(async()=>{
 const br=await H0.launch();
 let falhas=0;const ok=(c,m)=>{console.log((c?'OK  ':'FALHA ')+m);if(!c)falhas++;};
 const body=pg=>pg.evaluate(()=>document.body.innerText);
 let {pg,errs}=await abrir(br,{uid:'t1',name:'Laylton',role:'tecnico'});
 const go=async(id)=>{await pg.click('text=Menu >> nth=0').catch(()=>{});await pg.click('[data-tour="nav-'+id+'"]');await pg.waitForTimeout(300);};
 await go('ubsmed');
 let t=(await body(pg)).replace(/\n/g,' ');
 ok(t.includes('UBS: validades')&&t.includes('Resumo por UBS'),'aba "UBS: validades" abre em Vicência');
 const cardTxt=async(k)=>(await pg.textContent('[data-ubsmed="card-'+k+'"]')).replace(/\s+/g,' ');
 ok(/Vencidos\s*100/.test(await cardTxt('venc')),'cartão Vencidos = 100 (ignora descarte)');
 ok(/30 dias\s*60/.test(await cardTxt('d30')),'cartão ≤30 dias = 60');
 ok(/90 dias\s*40/.test(await cardTxt('d90')),'cartão ≤90 dias = 40');
 let linhas=await pg.$$('[data-ubsmed="linha"]');
 ok(linhas.length===3,'lista "em risco" mostra 3 itens (o em dia fica de fora)');
 const first=(await linhas[0].textContent());ok(first.includes('Dipirona')&&first.includes('vencido há'),'ordenado: o vencido vem primeiro');
 await pg.click('[data-ubsmed="chip-todos"]');ok((await pg.$$('[data-ubsmed="linha"]')).length===4,'filtro Todos mostra os 4');
 await pg.selectOption('[data-ubsmed="f-ubs"]','Agrovila');ok((await pg.$$('[data-ubsmed="linha"]')).length===2,'filtro por UBS (Agrovila: 2)');
 await pg.selectOption('[data-ubsmed="f-ubs"]','todas');
 t=(await body(pg)).replace(/\n/g,' ');ok(/João Ramos\s+2\s+160\s+160\s+nunca conferiu/.test(t)||t.includes('nunca conferiu'),'resumo por UBS: "nunca conferiu"');
 await pg.click('[data-ubsmed="pdf"]');await pg.click('[data-ubsmed="xlsx"]');
 ok(await pg.evaluate(()=>window.__xl===1&&window.__rows.length>1),'exporta Excel');
 // conferência declarada: Dipirona L1 -> 30; depois nova remessa 10
 await pg.evaluate(()=>{const c=new Date(Date.now()-5*864e5).toISOString();window.__store.ubs_conferencias.c1={tenant_id:'vicencia-pe',ubsNome:'João Ramos',enfermeira:'Maria',criadoEm:c,itens:[{medId:'m1',nome:'Dipirona',lote:'L1',validade:window.__vl,qtd:30,origem:'lista'},{medId:'',nome:'Paracetamol',lote:'P1',validade:'05/2027',qtd:12,origem:'extra'}]};window.__ls.forEach(l=>l.run());});
 // precisa da validade igual à do envio; recalcula a partir dos dados
 const val=await pg.evaluate(()=>window.__store.entries.s1.validade);
 await pg.evaluate((v)=>{window.__store.ubs_conferencias.c1.itens[0].validade=v;window.__ls.forEach(l=>l.run());},val);
 await pg.click('[data-ubsmed="chip-todos"]');await pg.waitForTimeout(200);
 t=(await body(pg)).replace(/\n/g,' ');
 ok(/Dipirona[^|]*declarado em/.test(t)&&/30\s*un\./.test(t),'conferência corrige a estimativa (Dipirona 100 -> 30 declarado)');
 ok(t.includes('Paracetamol')&&t.includes('sem envio registrado'),'item declarado sem envio registrado aparece');
 // remessa nova depois da conferência soma
 await pg.evaluate(()=>{window.__store.entries.s9={medicamentoId:'m1',medicamentoNome:'Dipirona',tipo:'saida',quantidade:10,lote:'L1',validade:window.__store.entries.s1.validade,destino:'ubs',ubsNome:'João Ramos',criadoEm:new Date().toISOString(),tenant_id:'vicencia-pe'};window.__ls.forEach(l=>l.run());});
 await pg.waitForTimeout(250);t=(await body(pg)).replace(/\n/g,' ');
 ok(/Dipirona[^|]*?40\s*un\./.test(t),'remessa depois da conferência soma (30 + 10 = 40)');
 // link/ativação
 await pg.click('[data-ubsmed="toggle-link"]');await pg.waitForTimeout(250);
 let cfg=await pg.evaluate(()=>window.__store.config['ubsconf__vicencia-pe']);
 ok(cfg&&cfg.ativo===true&&cfg.tenant_id==='vicencia-pe','ativar o link grava config/ubsconf__vicencia-pe');
 await pg.fill('[data-ubsmed="codigo"]','2468');await pg.click('[data-ubsmed="salvar-codigo"]');await pg.waitForTimeout(250);
 cfg=await pg.evaluate(()=>window.__store.config['ubsconf__vicencia-pe']);ok(cfg.codigo==='2468'&&cfg.ativo===true,'código de acesso salvo');
 ok(errs.filter(e=>!e.includes('ERR_FAILED')).length===0,'sem erros JS '+errs.join('|'));
 // alerta na saída
 const al=await pg.evaluate(()=>[_alertaValidadeUbs([{lote:'X',validade:'01/2020',qty:5}]),_alertaValidadeUbs([{lote:'Y',validade:'12/2035',qty:5}]),_alertaValidadeUbs([{lote:'',validade:'',qty:5}])]);
 ok(al[0].includes('VENCIDO')&&al[1]===''&&al[2]==='','alerta de validade curta: vencido avisa; longe de vencer e sem validade não');
 const al2=await pg.evaluate((m)=>_alertaValidadeUbs([{lote:'Z',validade:m,qty:7}]),(function(){const d=new Date(Date.now()+60*864e5);return String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear();})());
 ok(al2.includes('vence em'),'alerta para lote que vence em ≤90 dias');
 await pg.context().close();
 // Itaquitinga: sem a aba
 console.log(falhas?falhas+' FALHAS':'TUDO OK');await br.close();process.exit(falhas?1:0);
})().catch(e=>{console.error(e);process.exit(2);});
