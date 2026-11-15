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
 ent.s3=sa('s3','m3','Losartana',40,'LS1',mesAno(70),'Agrovila',new Date(Date.now()-10*864e5).toISOString());      // <=90
 ent.s4=sa('s4','m4','Captopril',25,'C1',mesAno(400),'Agrovila',new Date(Date.now()-10*864e5).toISOString());      // em dia
 ent.s5=Object.assign(sa('s5','m1','Dipirona',999,'L1',mesAno(-40),'João Ramos',new Date().toISOString()),{descarte:true});
 ent.s6=sa('s6','m5','Gaze estéril',200,'G1',mesAno(0),'João Ramos',new Date(Date.now()-9*864e5).toISOString());
 return {tenants:{[T]:{nome:'Vicência',ativo:true}},
  medicamentos:{m1:{nome:'Dipirona',categoria:'medicamento',estoqueAtual:400,tenant_id:T},m2:{nome:'Amoxicilina',categoria:'medicamento',estoqueAtual:0,tenant_id:T},m3:{nome:'Losartana',categoria:'medicamento',estoqueAtual:0,tenant_id:T},m4:{nome:'Captopril',categoria:'medicamento',estoqueAtual:0,tenant_id:T},m5:{nome:'Gaze estéril',categoria:'penso',estoqueAtual:0,tenant_id:T}},
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
 ok(await pg.$('[data-ubsmed="cats"]')!==null,'aparecem os botões de categoria');
 let bt=(await pg.textContent('[data-ubsmed="cats"]'));ok(bt.includes('Farm. Básica')&&bt.includes('Penso')&&bt.includes('Todas as categorias'),'categorias: Todas, Farm. Básica, Penso/Material ('+bt.replace(/\s+/g,' ')+')');
 let linhas=await pg.$$('[data-ubsmed="linha"]');ok(linhas.length===4,'sem filtro: 4 itens em risco (3 remédios + a gaze)');
 await pg.click('[data-ubsmed="cat-medicamento"]');await pg.waitForTimeout(150);
 linhas=await pg.$$('[data-ubsmed="linha"]');ok(linhas.length===3&&!(await pg.evaluate(()=>document.body.innerText)).includes('Gaze'),'Farm. Básica: só os 3 medicamentos, sem a gaze');
 const c30=(await pg.textContent('[data-ubsmed="card-d30"]')).replace(/\s+/g,' ');ok(/30 dias\s*60/.test(c30),'cartões também respeitam a categoria (<=30 = 60, sem os 200 da gaze)');
 await pg.click('[data-ubsmed="cat-penso"]');await pg.waitForTimeout(150);
 linhas=await pg.$$('[data-ubsmed="linha"]');ok(linhas.length===1&&(await linhas[0].textContent()).includes('Gaze'),'Penso/Material: só a gaze');
 await pg.click('[data-ubsmed="cat-todas"]');await pg.waitForTimeout(150);
 ok((await pg.$$('[data-ubsmed="linha"]')).length===4,'Todas as categorias volta a mostrar tudo');
 await pg.click('[data-ubsmed="cat-medicamento"]');
 console.log('--- fim do bloco de categorias ---');
 await br.close();process.exit(falhas?1:0);
})().catch(e=>{console.error(e);process.exit(2);});
