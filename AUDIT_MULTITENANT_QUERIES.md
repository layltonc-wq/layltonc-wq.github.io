# Detalhe de Coleções e Queries — anexo de AUDIT_MULTITENANT.md

### `_meta` (2 ocorrências)
| Linha | Operações detectadas | .where() args | Trecho |
|---|---|---|---|
| 303 | set, doc |  | `function _bumpEntriesVersion(){try{if(db)db.collection('_meta').doc('entries_version').set({v:Date.n` |
| 9439 | where, doc, onSnapshot | 'status','==','approved'; 'para','==',user.uid; 'status','==','pendente' | `unsubs.push(db.collection('_meta').doc('entries_version').onSnapshot(function(){if(_metaFirst){_meta` |

### `alertas` (4 ocorrências)
| Linha | Operações detectadas | .where() args | Trecho |
|---|---|---|---|
| 1636 | add |  | `var saveFn=(!canMove&&isGuest&&props.onSolicitar)?props.onSolicitar:onSave;saveFn(data).then(functio` |
| 3289 | where, add, update, doc, onSnapshot | 'tipo','==','saida_excessiva'; 'status','==','pendente' | `useEffect(function(){var u1=db.collection('users').onSnapshot(function(s){setUsers(s.docs.map(functi` |
| 3305 | update, doc |  | `{sub==='alerts'&&(alertas.length===0?<div className="card" style={{padding:40,textAlign:'center',col` |
| 9448 | where, onSnapshot | 'lido','==',false; 'tipo','==','saida_excessiva'; 'status','==','pendente' | `unsubs.push(db.collection('alertas').where('lido','==',false).where('tipo','==','saida_excessiva').o` |

### `atas` (7 ocorrências)
| Linha | Operações detectadas | .where() args | Trecho |
|---|---|---|---|
| 5830 | onSnapshot |  | `var u=db.collection('atas').onSnapshot(function(s){` |
| 6111 | add, update, doc |  | `db.collection('atas').add({nome:importNome.trim(),categoria:importCat,limite:0,valorTotal:parseFloat` |
| 6119 | update, doc |  | `var p=[db.collection('atas').doc(ataId).update({itens:novos})];` |
| 6155 | add, update, delete, doc |  | `db.collection('atas').add({nome:novaAta.trim(),categoria:novaAtaCat,limite:0,criadoEm:new Date().toI` |
| 6162 | update, delete, doc |  | `function nx(){if(i>=meds.length){db.collection('atas').doc(ata.id).delete();return;}var m=meds[i++];` |
| 6189 | update, doc |  | `db.collection('atas').doc(ataId).update({limite:parseInt(val)\|\|0}).catch(function(){});` |
| 6246 | update, doc |  | `if(editItens){ops.push(db.collection('atas').doc(ata.id).update({itens:editItens}));}` |

### `avisos` (3 ocorrências)
| Linha | Operações detectadas | .where() args | Trecho |
|---|---|---|---|
| 744 | add, delete, doc, onSnapshot |  | `useEffect(function(){var u=db.collection('avisos').limit(20).onSnapshot(function(s){var list=s.docs.` |
| 747 | add, delete, doc |  | `function post(){if(!aviso.trim()&&!fotoMural)return;setSaving(true);var expAt=new Date();expAt.setHo` |
| 748 | delete, doc |  | `function del(id){db.collection('avisos').doc(id).delete();}` |

### `conferencias` (1 ocorrências)
| Linha | Operações detectadas | .where() args | Trecho |
|---|---|---|---|
| 7004 | doc |  | `var docRef=function(){return db.collection('conferencias').doc(todayStr());};` |

### `config` (3 ocorrências)
| Linha | Operações detectadas | .where() args | Trecho |
|---|---|---|---|
| 3269 | set, doc, onSnapshot |  | `useEffect(function(){var ut=db.collection('config').doc('tours').onSnapshot(function(s){var d=s.exis` |
| 3274 | set, doc |  | `db.collection('config').doc('tours').set({ativos:novo,atualizadoEm:new Date().toISOString(),atualiza` |
| 7803 | doc, onSnapshot |  | `var u2=db.collection('config').doc('tours').onSnapshot(function(s){var d=s.exists?s.data():{};setAti` |

### `divergencias` (14 ocorrências)
| Linha | Operações detectadas | .where() args | Trecho |
|---|---|---|---|
| 1874 | add |  | `var p3=db.collection('divergencias').add({` |
| 1964 | add |  | `var pDiv3=db.collection('divergencias').add({` |
| 3188 | update, doc |  | `return db.collection('divergencias').doc(d.id).update(upd);` |
| 3228 | onSnapshot, orderBy |  | `return db.collection('divergencias').orderBy('registradoEm','desc').limit(100).onSnapshot(function(s` |
| 8189 | set, doc |  | `batch.set(db.collection('divergencias').doc(),{medicamentoId:d.medicamentoId,medicamentoNome:d.medic` |
| 8193 | set, doc |  | `batch.set(db.collection('divergencias').doc(),{medicamentoId:'',medicamentoNome:x.medicamentoNome,qt` |
| 8267 | update, doc |  | `var divRef=bate?null:db.collection('divergencias').doc();` |
| 8323 | update, delete, doc |  | `if(it.divergenciaId)batch.delete(db.collection('divergencias').doc(it.divergenciaId));` |
| 8521 | where, onSnapshot, orderBy | 'status','==','pendente' | `return db.collection('divergencias').where('status','==','pendente').orderBy('criadoEm','desc').limi` |
| 8525 | onSnapshot, orderBy |  | `db.collection('divergencias').orderBy('criadoEm','desc').limit(200).onSnapshot(function(sn){` |
| 8540 | update, doc |  | `db.collection('divergencias').doc(d.id).update({status:'resolvido',resolvidoEm:new Date().toISOStrin` |
| 8546 | update, doc |  | `db.collection('divergencias').doc(d.id).update({status:'resolvido',resolvidoEm:new Date().toISOStrin` |
| 9505 | where, get | 'realMedId','==',obj.medicamentoId; 'tipo','==','substituicao' | `return db.collection('divergencias')` |
| 9526 | update, doc |  | `return db.collection('divergencias').doc(doc.id).update({` |

### `entries` (36 ocorrências)
| Linha | Operações detectadas | .where() args | Trecho |
|---|---|---|---|
| 2285 | add, update, doc |  | `db.collection('entries').add({medicamentoId:med.id,medicamentoNome:med.nome,tipo:'entrada',quantidad` |
| 2286 | add, update, doc |  | `db.collection('entries').add({medicamentoId:med.id,medicamentoNome:med.nome,tipo:'saida',quantidade:` |
| 2292 | update, doc |  | `var batch=entsDoLote.map(function(e){return db.collection('entries').doc(e.id).update({lote:novoLote` |
| 2302 | add, delete, doc |  | `db.collection('entries').add({medicamentoId:med.id,medicamentoNome:med.nome,tipo:tipo,quantidade:Mat` |
| 2309 | delete, doc |  | `Promise.all(entsDoLote.map(function(e){return db.collection('entries').doc(e.id).delete();})).then(f` |
| 2320 | add, delete, doc |  | `db.collection('entries').doc(e.id).delete().then(function(){` |
| 2540 | where, get, add, update, doc | 'nome','==',item.nome | `function salvarEditLote(){if(!editLote)return;setSaving(true);var ps=[];if(editLote.medId)ps.push(db` |
| 2541 | where, get, add | 'nome','==',item.nome | `function salvarAjuste(){if(!ajusteMed)return;var nq=parseInt(ajusteQty);if(isNaN(nq)\|\|nq<0){alert('Q` |
| 2542 | where, get, add | 'nome','==',item.nome | `function handleImportXls(file){if(!file)return;setImporting(true);setImportStatus('Lendo arquivo...'` |
| 2589 | where, get | 'obs','==','Vencido — baixa automática' | `db.collection('entries').where('obs','==','Vencido — baixa automática').limit(1000).get().then(funct` |
| 2601 | update, doc |  | `f.slice(i,i+CHUNK).forEach(function(e){batch.update(db.collection('entries').doc(e.id),{descarte:tru` |
| 3183 | add, update, doc |  | `db.collection('entries').add(ficObj).then(function(){` |
| 3296 | add, update, doc |  | `function approveSolicit(s){db.collection('entries').add({medicamentoId:s.medicamentoId,medicamentoNo` |
| 3336 | get, delete, onSnapshot |  | `{sub==='reset'&&(<div><div className="wn" style={{marginBottom:16}}>Atenção: estas acoes sao permane` |
| 3336 | get, delete, onSnapshot |  | `{sub==='reset'&&(<div><div className="wn" style={{marginBottom:16}}>Atenção: estas acoes sao permane` |
| 3375 | delete, doc, onSnapshot, orderBy |  | `var u2=db.collection('entries').orderBy('criadoEm','desc').limit(100).onSnapshot(function(sn){setLog` |
| 4407 | add |  | `await db.collection('entries').add({tipo:'entrada',medicamentoId:it.medId,medicamentoNome:it.xProd,q` |
| 4955 | add |  | `await db.collection('entries').add({tipo:'saida',medicamentoId:medSel,medicamentoNome:mO.nome\|\|'',qu` |
| 4980 | add, update, doc |  | `await db.collection('entries').add({tipo:'saida',medicamentoId:t.medicamentoId,medicamentoNome:t.med` |
| 5632 | update, doc |  | `var upd={nfNumero:editGF.nota,nfFornecedor:editGF.forn,editadoPor:user.name,editadoEm:new Date().toI` |
| 5640 | update, doc |  | `db.collection('entries').doc(editEntry.id).update({nfNumero:editF.nota,nfFornecedor:editF.forn,medic` |
| 5700 | delete, doc |  | `Promise.all(g.itens.map(function(it){return db.collection('entries').doc(it.id).delete();}))` |
| 7087 | where, onSnapshot | 'date','==',todayStr( | `var unsub=db.collection('entries').where('date','==',todayStr()).onSnapshot(function(snap){` |
| 7199 | add |  | `ops.push(db.collection('entries').add({medicamentoId:m.id,medicamentoNome:m.nome,tipo:'entrada',quan` |
| 7200 | add |  | `ops.push(db.collection('entries').add({medicamentoId:m.id,medicamentoNome:m.nome,tipo:'saida',quanti` |
| 7225 | delete, set, doc |  | `var ref=db.collection('entries').doc();` |
| 7312 | set, doc |  | `var ref=db.collection('entries').doc();` |
| 7360 | set, doc |  | `var ref=db.collection('entries').doc();` |
| 8687 | doc |  | `var entryRef=db.collection('entries').doc();` |
| 8741 | update, set, doc |  | `batch.set(db.collection('entries').doc(),entryObj);` |
| 8827 | where, get | 'origemRecebimento','==',true | `var entSnap=await db.collection('entries').where('origemRecebimento','==',true).get();` |
| 8853 | set, doc |  | `batch.set(db.collection('entries').doc(),obj);` |
| 9430 | where, get, onSnapshot | 'criadoEm','>=',_ws | `var col=db.collection('entries');` |
| 9436 | where, doc, onSnapshot | 'criadoEm','>=',_ws; 'status','==','approved'; 'para','==',user.uid | `unsubs.push(db.collection('entries').where('criadoEm','>=',_ws).onSnapshot(function(s){setRecentEntr` |
| 9489 | add, update, doc |  | `var promise=db.collection('entries').add(obj);` |
| 9524 | add, update, doc |  | `db.collection('entries').add(ficObj).then(function(){` |

### `logs_acesso` (8 ocorrências)
| Linha | Operações detectadas | .where() args | Trecho |
|---|---|---|---|
| 422 | add |  | `function logAcessoPaciente(user,acao,detalhe){try{db.collection('logs_acesso').add({uid:(user&&user.` |
| 569 | get, add, set, doc |  | `function login(){if(!email\|\|!pass){setErr('Preencha email e senha.');return;}setLoad(true);setErr(''` |
| 2321 | add |  | `try{db.collection('logs_acesso').add({uid:user.uid\|\|'',nome:user.name\|\|'',cargo:user.role\|\|'',acao:'` |
| 3339 | onSnapshot |  | `function TabLog(){var _logs=useState([]);var logs=_logs[0];var setLogs=_logs[1];useEffect(function()` |
| 3377 | delete, doc, onSnapshot, orderBy |  | `var u4=db.collection('logs_acesso').orderBy('criadoEm','desc').limit(100).onSnapshot(function(sn){se` |
| 8120 | add |  | `function logAcao(acao,det){try{db.collection('logs_acesso').add({uid:user.uid\|\|'',nome:user.name\|\|''` |
| 8631 | add |  | `try{db.collection('logs_acesso').add({uid:user.uid\|\|'',nome:user.name\|\|'',cargo:user.role\|\|'',acao:a` |
| 9547 | add |  | `function logout(){if(!confirm('Sair do sistema?'))return;db.collection('logs_acesso').add({uid:user.` |

### `logs_contas` (8 ocorrências)
| Linha | Operações detectadas | .where() args | Trecho |
|---|---|---|---|
| 3291 | add, update, doc |  | `function approve(uid){db.collection('users').doc(uid).update({status:'approved'}).then(function(){va` |
| 3292 | add, update, doc |  | `function reject(uid){db.collection('users').doc(uid).update({status:'rejected'}).then(function(){var` |
| 3294 | add, update, doc |  | `function deactivate(uid,nome){if(!confirm('Desativar '+nome+'?'))return;var u=users.find(function(x)` |
| 3295 | add, update, doc |  | `function reactivate(u){if(!confirm('Reativar '+u.name+'?'))return;db.collection('users').doc(u.id).u` |
| 3335 | get, add, delete, doc, onSnapshot |  | `{sub==='inativo'&&(inactive.length===0?<div className="card" style={{padding:40,textAlign:'center',c` |
| 3341 | onSnapshot |  | `function TabHistContas(){var _logs=useState([]);var logs=_logs[0];var setLogs=_logs[1];useEffect(fun` |
| 3376 | delete, doc, onSnapshot, orderBy |  | `var u3=db.collection('logs_contas').orderBy('criadoEm','desc').limit(100).onSnapshot(function(sn){se` |
| 3376 | delete, doc, onSnapshot, orderBy |  | `var u3=db.collection('logs_contas').orderBy('criadoEm','desc').limit(100).onSnapshot(function(sn){se` |

### `medicamentos` (31 ocorrências)
| Linha | Operações detectadas | .where() args | Trecho |
|---|---|---|---|
| 1812 | add |  | `function create(){if(!newNome.trim()){setErr('Nome obrigatorio.');return;}setSaving(true);db.collect` |
| 1901 | add |  | `db.collection('medicamentos').add({nome:novoMedNome.trim().toUpperCase(),categoria:novoMedCat,tipo:n` |
| 2133 | update, doc |  | `db.collection('medicamentos').doc(selNota.id).update({categoria:k}).catch(function(){});` |
| 2537 | where, get, add, update, delete, doc | 'nome','==',item.nome | `function saveNew(){if(!newNome.trim())return;setSaving(true);db.collection('medicamentos').add({nome` |
| 2538 | where, get, add, update, delete, doc | 'nome','==',item.nome | `function saveEdit(){setSaving(true);db.collection('medicamentos').doc(editId).update({nome:editNome.` |
| 2539 | where, get, add, update, delete, doc | 'nome','==',item.nome | `function delMed(id){if(!confirm('Excluir medicamento?'))return;db.collection('medicamentos').doc(id)` |
| 2540 | where, get, add, update, doc | 'nome','==',item.nome | `function salvarEditLote(){if(!editLote)return;setSaving(true);var ps=[];if(editLote.medId)ps.push(db` |
| 2542 | where, get, add | 'nome','==',item.nome | `function handleImportXls(file){if(!file)return;setImporting(true);setImportStatus('Lendo arquivo...'` |
| 2542 | where, get, add | 'nome','==',item.nome | `function handleImportXls(file){if(!file)return;setImporting(true);setImportStatus('Lendo arquivo...'` |
| 3336 | get, delete, onSnapshot |  | `{sub==='reset'&&(<div><div className="wn" style={{marginBottom:16}}>Atenção: estas acoes sao permane` |
| 3336 | get, delete, onSnapshot |  | `{sub==='reset'&&(<div><div className="wn" style={{marginBottom:16}}>Atenção: estas acoes sao permane` |
| 6125 | update, doc |  | `p.push(db.collection('medicamentos').doc(novoItem.medicamentoId).update({ataId:ataId}));` |
| 6129 | update, doc |  | `p.push(db.collection('medicamentos').doc(antigo).update({ataId:''}));` |
| 6142 | add |  | `db.collection('medicamentos').add({nome:nome,categoria:ata.categoria\|\|'medicamento',ean:'',minEstoqu` |
| 6162 | update, delete, doc |  | `function nx(){if(i>=meds.length){db.collection('atas').doc(ata.id).delete();return;}var m=meds[i++];` |
| 6167 | update, doc |  | `db.collection('medicamentos').doc(vincMed).update({ataId:vincAta}).then(function(){` |
| 6181 | update, doc |  | `db.collection('medicamentos').doc(id).update(upd).then(nx).catch(nx);` |
| 6186 | update, doc |  | `db.collection('medicamentos').doc(medId).update({ataId:''}).catch(function(){});` |
| 6247 | update, doc |  | `adicionar.forEach(function(id){ops.push(db.collection('medicamentos').doc(id).update({ataId:ata.id})` |
| 6248 | update, doc |  | `remover.forEach(function(id){ops.push(db.collection('medicamentos').doc(id).update({ataId:''}));});` |
| 7161 | add |  | `db.collection('medicamentos').add({nome:nome.toUpperCase(),categoria:cadCat,tipo:cadCat,minEstoque:p` |
| 7173 | delete, doc |  | `db.collection('medicamentos').doc(m.id).delete()` |
| 7182 | update, doc |  | `db.collection('medicamentos').doc(m.id).update({nome:nome.toUpperCase()})` |
| 7195 | add, update, doc |  | `var ops=[db.collection('medicamentos').doc(m.id).update({loteAtual:lote,validadeAtual:val})];` |
| 7243 | update, doc |  | `if(resultante===0&&(rawm.loteAtual\|\|rawm.validadeAtual))db.collection('medicamentos').doc(m.id).upda` |
| 7379 | update, doc |  | `zerar.forEach(function(mid){db.collection('medicamentos').doc(mid).update({loteAtual:'',validadeAtua` |
| 8643 | add |  | `db.collection('medicamentos').add({nome:nome,ean:(nmEan\|\|'').trim(),minEstoque:parseInt(nmMin)\|\|0,ca` |
| 8709 | update, doc |  | `lotesParaAtualizar.forEach(function(x){db.collection('medicamentos').doc(x.medId).update({loteAtual:` |
| 9440 | where, onSnapshot | 'status','==','approved'; 'para','==',user.uid; 'status','==','pendente' | `unsubs.push(db.collection('medicamentos').onSnapshot(function(s){var list=s.docs.map(function(d){var` |
| 9497 | update, doc |  | `db.collection('medicamentos').doc(obj.medicamentoId).update({loteAtual:obj.lote,validadeAtual:obj.va` |
| 9540 | add, update, doc |  | `db.collection('medicamentos').doc(obj.medicamentoId).update({loteAtual:'',validadeAtual:''}).catch(f` |

### `medications` (2 ocorrências)
| Linha | Operações detectadas | .where() args | Trecho |
|---|---|---|---|
| 3393 | delete, doc |  | `db.collection('medications').doc(id).delete().then(function(){` |
| 9445 | where, onSnapshot | 'status','==','pending'; 'lido','==',false; 'tipo','==','saida_excessiva' | `if(user.role==='gestor'\|\|user.role==='tecnico'){unsubs.push(db.collection('medications').onSnapshot(` |

### `notas_fiscais` (14 ocorrências)
| Linha | Operações detectadas | .where() args | Trecho |
|---|---|---|---|
| 4227 | onSnapshot, orderBy |  | `var u=db.collection('notas_fiscais').orderBy('criadoEm','desc').onSnapshot(function(sn){` |
| 4411 | add |  | `await db.collection('notas_fiscais').add({nNF:preview.nNF,dataEmissao:preview.dataEmissao,fornecedor` |
| 5594 | where, onSnapshot, orderBy | 'arquivadaHistorico','==',true | `var u=db.collection('notas_fiscais').where('arquivadaHistorico','==',true).orderBy('arquivadaEm','de` |
| 5598 | onSnapshot |  | `db.collection('notas_fiscais').limit(300).onSnapshot(function(sn){` |
| 5772 | update, doc |  | `{confirmDesarquivar&&<ModalConfirm titulo="Desfazer entrada conferida" msg={'Voltar a NF '+(confirmD` |
| 8115 | add, onSnapshot, orderBy |  | `var u1=db.collection('notas_fiscais').orderBy('criadoEm','desc').limit(100).onSnapshot(function(sn){` |
| 8159 | set, doc |  | `novasNotas.forEach(function(n){var ref=db.collection('notas_fiscais').doc();batch.set(ref,n);notasCo` |
| 8210 | update, doc |  | `batch.update(db.collection('notas_fiscais').doc(notaId),{itens:novosItens,status:todosProcessados?'p` |
| 8270 | update, set, doc |  | `batch.update(db.collection('notas_fiscais').doc(notaId),{itens:novosItensNota,status:todosProcNota?'` |
| 8304 | update, doc |  | `db.collection('notas_fiscais').doc(notaId).update({itens:novosItens,status:todosProc?'processada':(n` |
| 8320 | update, delete, doc |  | `batch.update(db.collection('notas_fiscais').doc(notaId),{itens:novosItensNota,status:'pendente'});` |
| 8345 | delete, doc |  | `db.collection('notas_fiscais').doc(nota.id).delete()` |
| 8357 | update, doc |  | `db.collection('notas_fiscais').doc(nota.id).update({arquivadaHistorico:true,arquivadaEm:new Date().t` |
| 8368 | update, doc |  | `db.collection('notas_fiscais').doc(notaId).update({nfNumero:(editNotaForm.numero\|\|'').trim(),fornece` |

### `pacientes_controlados` (5 ocorrências)
| Linha | Operações detectadas | .where() args | Trecho |
|---|---|---|---|
| 1501 | onSnapshot |  | `return db.collection('pacientes_controlados').limit(2000).onSnapshot(function(sn){` |
| 1524 | add |  | `db.collection('pacientes_controlados').add({nome:buscaTrim,criadoEm:new Date().toISOString(),criadoP` |
| 9157 | onSnapshot, orderBy |  | `var u1=db.collection('pacientes_controlados').limit(2000).onSnapshot(function(snap){` |
| 9193 | add |  | `db.collection('pacientes_controlados').add({nome:nome,criadoEm:new Date().toISOString(),criadoPor:us` |
| 9205 | delete, doc |  | `db.collection('pacientes_controlados').doc(p.id).delete()` |

### `pacientes_leite` (6 ocorrências)
| Linha | Operações detectadas | .where() args | Trecho |
|---|---|---|---|
| 3635 | onSnapshot, orderBy |  | `var unsub1=db.collection('pacientes_leite').onSnapshot(function(snap){` |
| 3701 | add, update, doc |  | `op=db.collection('pacientes_leite').doc(editing.id).update(obj);` |
| 3706 | add, delete, doc |  | `op=db.collection('pacientes_leite').add(obj);` |
| 3714 | delete, doc |  | `db.collection('pacientes_leite').doc(p.id).delete().then(function(){` |
| 3726 | update, doc |  | `db.collection('pacientes_leite').doc(p.id).update({status:novo,atualizadoEm:new Date().toISOString()` |
| 3807 | update, doc |  | `return db.collection('pacientes_leite').doc(showBaixa.id).update({status:'falta',ultimaRetirada:bDat` |

### `plantao_convites` (5 ocorrências)
| Linha | Operações detectadas | .where() args | Trecho |
|---|---|---|---|
| 9443 | where, onSnapshot | 'para','==',user.uid; 'status','==','pendente'; 'status','==','pending' | `unsubs.push(db.collection('plantao_convites').where('para','==',user.uid).where('status','==','pende` |
| 9467 | where, get, doc | 'para','==',u.uid; 'status','==','pendente' | `function checkShift(u){if(shiftChecked)return;setShiftChecked(true);autoFecharPlantoesAntigos();var ` |
| 9476 | where, get, add, update, doc | 'de','==',user.uid; 'data','==',hoje; 'status','==','pendente' | `function handleConfirmInvite(invite){var today=todayStr();db.collection('plantao_convites').doc(invi` |
| 9477 | where, get, add, update, doc | 'de','==',user.uid; 'data','==',hoje; 'status','==','pendente' | `function handleDenyInvite(invite){db.collection('plantao_convites').doc(invite.id).update({status:'n` |
| 9660 | update, doc |  | `<button onClick={function(){db.collection('plantao_convites').doc(convites[0].id).update({status:'co` |

### `plantao_solicitacoes` (5 ocorrências)
| Linha | Operações detectadas | .where() args | Trecho |
|---|---|---|---|
| 9451 | where, onSnapshot | 'para','==',user.uid; 'status','==','pendente' | `if(user.role==='farmaceutico'){unsubs.push(db.collection('plantao_solicitacoes').where('para','==',u` |
| 9478 | where, get, add, update, doc | 'de','==',user.uid; 'data','==',hoje; 'status','==','pendente' | `function solicitarEntradaPlantao(){if(!plantao\|\|!shiftId)return;if(!confirm('Solicitar entrada no pl` |
| 9478 | where, get, add, update, doc | 'de','==',user.uid; 'data','==',hoje; 'status','==','pendente' | `function solicitarEntradaPlantao(){if(!plantao\|\|!shiftId)return;if(!confirm('Solicitar entrada no pl` |
| 9479 | add, update, doc |  | `function aprovarEntradaPlantao(sol){var hoje=todayStr();var novoMembro={id:sol.de,nome:sol.deNome,ca` |
| 9480 | add, update, doc |  | `function recusarEntradaPlantao(sol){db.collection('plantao_solicitacoes').doc(sol.id).update({status` |

### `plantoes` (15 ocorrências)
| Linha | Operações detectadas | .where() args | Trecho |
|---|---|---|---|
| 265 | where, get, update | 'ativo','==',true | `db.collection('plantoes').where('ativo','==',true).get().then(function(snap){` |
| 624 | set, doc |  | `});}function startShift(){setSaving(true);var today=todayStr();var leader={id:user.uid,nome:user.nam` |
| 657 | update, doc |  | `db.collection('plantoes').doc(shiftId).update({equipe:novaEquipe})` |
| 669 | update, doc |  | `db.collection('plantoes').doc(shiftId).update({equipe:novaEquipe}).catch(function(e){alert('Erro: '+` |
| 9344 | update, doc |  | `db.collection('plantoes').doc(shiftId).update({equipe:eq}).catch(function(){});` |
| 9356 | update, doc |  | `db.collection('plantoes').doc(shiftId).update({ativo:false,encerradoEm:new Date().toISOString(),ence` |
| 9375 | doc, onSnapshot |  | `var unsub=db.collection('plantoes').doc(today).onSnapshot(function(snap){` |
| 9467 | where, get, doc | 'para','==',u.uid; 'status','==','pendente' | `function checkShift(u){if(shiftChecked)return;setShiftChecked(true);autoFecharPlantoesAntigos();var ` |
| 9467 | where, get, doc | 'para','==',u.uid; 'status','==','pendente' | `function checkShift(u){if(shiftChecked)return;setShiftChecked(true);autoFecharPlantoesAntigos();var ` |
| 9467 | where, get, doc | 'para','==',u.uid; 'status','==','pendente' | `function checkShift(u){if(shiftChecked)return;setShiftChecked(true);autoFecharPlantoesAntigos();var ` |
| 9476 | where, get, add, update, doc | 'de','==',user.uid; 'data','==',hoje; 'status','==','pendente' | `function handleConfirmInvite(invite){var today=todayStr();db.collection('plantao_convites').doc(invi` |
| 9476 | where, get, add, update, doc | 'de','==',user.uid; 'data','==',hoje; 'status','==','pendente' | `function handleConfirmInvite(invite){var today=todayStr();db.collection('plantao_convites').doc(invi` |
| 9479 | add, update, doc |  | `function aprovarEntradaPlantao(sol){var hoje=todayStr();var novoMembro={id:sol.de,nome:sol.deNome,ca` |
| 9481 | add, update, doc |  | `function encerrarPlantao(){if(!shiftId)return;if(!confirm('Encerrar o plantao de hoje?'))return;db.c` |
| 9482 | add, update, doc |  | `function sairDoPlantao(){if(!confirm('Sair do plantao?'))return;localStorage.setItem('fc_shift_saiu_` |

### `recebimentos` (12 ocorrências)
| Linha | Operações detectadas | .where() args | Trecho |
|---|---|---|---|
| 8116 | add, onSnapshot, orderBy |  | `var u2=db.collection('recebimentos').orderBy('criadoEm','desc').limit(200).onSnapshot(function(sn){s` |
| 8204 | update, doc |  | `batch.update(db.collection('recebimentos').doc(recId),{itens:novosItens,status:statusNovo,statusLabe` |
| 8275 | update, set, doc |  | `batch.update(db.collection('recebimentos').doc(rec.id),{itens:novosItensRec,status:statusNovoRec,sta` |
| 8331 | update, doc |  | `batch.update(db.collection('recebimentos').doc(rec.id),{itens:novosItensRec,status:statusNovoRec,sta` |
| 8615 | onSnapshot, orderBy |  | `var u=db.collection('recebimentos').orderBy('criadoEm','desc').limit(200).onSnapshot(function(sn){` |
| 8676 | doc |  | `var recRef=db.collection('recebimentos').doc();  // gera id sem escrever ainda` |
| 8743 | update, doc |  | `batch.update(db.collection('recebimentos').doc(rec.id),{status:'cancelado',statusLabel:'Cancelado',j` |
| 8764 | update, doc |  | `db.collection('recebimentos').doc(rec.id).update({status:'conciliado',statusLabel:'Conferido manualm` |
| 8776 | update, doc |  | `db.collection('recebimentos').doc(rec.id).update({status:statusVolta,statusLabel:rec.statusLabelAnte` |
| 8787 | delete, doc |  | `db.collection('recebimentos').doc(rec.id).delete().then(function(){` |
| 8798 | update, doc |  | `db.collection('recebimentos').doc(recId).update({fornecedor:novoForn,data:editRecebForm.data\|\|'',res` |
| 8825 | where, get | 'origemRecebimento','==',true | `var recsSnap=await db.collection('recebimentos').limit(1000).get();` |

### `retiradas_leite` (2 ocorrências)
| Linha | Operações detectadas | .where() args | Trecho |
|---|---|---|---|
| 3640 | onSnapshot, orderBy |  | `var unsub2=db.collection('retiradas_leite').orderBy('criadoEm','desc').limit(2000).onSnapshot(functi` |
| 3791 | add |  | `db.collection('retiradas_leite').add(retObj).then(function(){` |

### `saidas_controladas` (3 ocorrências)
| Linha | Operações detectadas | .where() args | Trecho |
|---|---|---|---|
| 1511 | where, get | 'pacienteId','==',pacSel.id | `db.collection('saidas_controladas').where('pacienteId','==',pacSel.id).get().then(function(sn){` |
| 1642 | add |  | `return db.collection('saidas_controladas').add(payload);` |
| 9162 | onSnapshot, orderBy |  | `var u2=db.collection('saidas_controladas').orderBy('criadoEm','desc').limit(1000).onSnapshot(functio` |

### `solicitacoes` (6 ocorrências)
| Linha | Operações detectadas | .where() args | Trecho |
|---|---|---|---|
| 3289 | where, add, update, doc, onSnapshot | 'tipo','==','saida_excessiva'; 'status','==','pendente' | `useEffect(function(){var u1=db.collection('users').onSnapshot(function(s){setUsers(s.docs.map(functi` |
| 3296 | add, update, doc |  | `function approveSolicit(s){db.collection('entries').add({medicamentoId:s.medicamentoId,medicamentoNo` |
| 3297 | update, doc |  | `function rejectSolicit(id){db.collection('solicitacoes').doc(id).update({status:'recusado',recusadoP` |
| 4204 | add |  | `function solicitar(){if(!sel){setErr('Selecione um medicamento.');return;}var q=parseInt(qty);if(!q\|` |
| 9449 | where, onSnapshot | 'status','==','pendente'; 'para','==',user.uid; 'status','==','pendente' | `unsubs.push(db.collection('solicitacoes').where('status','==','pendente').onSnapshot(function(s){set` |
| 9483 | add |  | `function addSolicitacao(data){var obj={medicamentoId:data.medicamentoId,medicamentoNome:data.medicam` |

### `tratamentos_atb` (11 ocorrências)
| Linha | Operações detectadas | .where() args | Trecho |
|---|---|---|---|
| 3374 | onSnapshot, orderBy |  | `var u1=db.collection('tratamentos_atb').orderBy('criadoEm','desc').limit(50).onSnapshot(function(sn)` |
| 4830 | onSnapshot, orderBy |  | `var u=db.collection('tratamentos_atb').orderBy('criadoEm','desc').limit(1000).onSnapshot(function(sn` |
| 4936 | update, doc |  | `async function salvarTelEdit(t){setTelEditSaving(true);try{await db.collection('tratamentos_atb').do` |
| 4957 | add |  | `await db.collection('tratamentos_atb').add({pacienteNome:nomePac.trim(),diasTratamento:parseInt(dias` |
| 4966 | update, doc |  | `async function ataqueBtn(t){if(!window.confirm('Marcar como Dose de Ataque? O estoque ja foi baixado` |
| 4985 | update, delete, doc |  | `await db.collection('tratamentos_atb').doc(t.id).update({doses:nd,status:ns});` |
| 4988 | update, delete, doc |  | `async function finalizar(t){if(!window.confirm('Concluir tratamento de '+t.pacienteNome+'?'))return;` |
| 4989 | update, delete, doc |  | `async function reabrir(t){if(!window.confirm('Reabrir tratamento de '+t.pacienteNome+'?'))return;awa` |
| 4990 | update, delete, doc |  | `async function excluir(t){if(!window.confirm('EXCLUIR permanentemente '+t.pacienteNome+'?'))return;a` |
| 4991 | update, doc |  | `async function desistir(t){await db.collection('tratamentos_atb').doc(t.id).update({status:'desistiu` |
| 4995 | update, doc |  | `await db.collection('tratamentos_atb').doc(t.id).update(u);` |

### `users` (18 ocorrências)
| Linha | Operações detectadas | .where() args | Trecho |
|---|---|---|---|
| 569 | get, add, set, doc |  | `function login(){if(!email\|\|!pass){setErr('Preencha email e senha.');return;}setLoad(true);setErr(''` |
| 570 | get, set, doc |  | `function register(){if(!name\|\|!email\|\|!pass){setErr('Preencha todos os campos.');return;}if(pass.len` |
| 570 | get, set, doc |  | `function register(){if(!name\|\|!email\|\|!pass){setErr('Preencha todos os campos.');return;}if(pass.len` |
| 641 | get |  | `db.collection('users').get().then(function(s){` |
| 3286 | where, add, update, doc, onSnapshot | 'tipo','==','saida_excessiva'; 'status','==','pendente' | `alvo.forEach(function(u){batch.update(db.collection('users').doc(u.id),{tutoriaisVistos:firebase.fir` |
| 3289 | where, add, update, doc, onSnapshot | 'tipo','==','saida_excessiva'; 'status','==','pendente' | `useEffect(function(){var u1=db.collection('users').onSnapshot(function(s){setUsers(s.docs.map(functi` |
| 3291 | add, update, doc |  | `function approve(uid){db.collection('users').doc(uid).update({status:'approved'}).then(function(){va` |
| 3292 | add, update, doc |  | `function reject(uid){db.collection('users').doc(uid).update({status:'rejected'}).then(function(){var` |
| 3293 | add, update, doc |  | `function changeRole(uid,role){db.collection('users').doc(uid).update({role:role});}` |
| 3294 | add, update, doc |  | `function deactivate(uid,nome){if(!confirm('Desativar '+nome+'?'))return;var u=users.find(function(x)` |
| 3295 | add, update, doc |  | `function reactivate(u){if(!confirm('Reativar '+u.name+'?'))return;db.collection('users').doc(u.id).u` |
| 3335 | get, add, delete, doc, onSnapshot |  | `{sub==='inativo'&&(inactive.length===0?<div className="card" style={{padding:40,textAlign:'center',c` |
| 4053 | update, doc |  | `function save(){setSaving(true);var upd={color:color,sessionTimeout:parseInt(sessionH)\|\|12,photoURL:` |
| 7802 | doc, onSnapshot |  | `var u1=db.collection('users').doc(user.uid).onSnapshot(function(s){var d=s.exists?s.data():{};setVis` |
| 7860 | set, doc |  | `db.collection('users').doc(user.uid).set({tutoriaisVistos:firebase.firestore.FieldValue.arrayUnion(i` |
| 9301 | get, doc |  | `useEffect(function(){var cfg=loadCfg();if(cfg&&initFB(cfg)){setReady(true);var saved=localStorage.ge` |
| 9441 | where, onSnapshot | 'status','==','approved'; 'para','==',user.uid; 'status','==','pendente' | `unsubs.push(db.collection('users').where('status','==','approved').onSnapshot(function(s){setAllUser` |
| 9447 | where, onSnapshot | 'status','==','pending'; 'lido','==',false; 'tipo','==','saida_excessiva' | `unsubs.push(db.collection('users').where('status','==','pending').onSnapshot(function(s){setPending(` |

### `vinculos_nfe` (4 ocorrências)
| Linha | Operações detectadas | .where() args | Trecho |
|---|---|---|---|
| 4233 | onSnapshot |  | `var u=db.collection('vinculos_nfe').onSnapshot(function(sn){` |
| 4254 | where, get, add, update, doc | 'chaveNota','==',chave | `var sn=await db.collection('vinculos_nfe').where('chaveNota','==',chave).get();` |
| 4255 | add, update, doc |  | `if(sn.empty){await db.collection('vinculos_nfe').add({chaveNota:chave,nomeOriginal:nomeNota,medId:me` |
| 4256 | update, doc |  | `else{await db.collection('vinculos_nfe').doc(sn.docs[0].id).update({medId:medId,medNome:medNome,conf` |
