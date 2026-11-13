// Execute: node validar.cjs (somente para desenvolvimento; o painel não exige Node).
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
new vm.Script(script); // Verifica também a sintaxe de todo o aplicativo.
const context = vm.createContext({URL});
vm.runInContext(script.slice(0, script.indexOf('let state=defaults()')) +
  script.slice(script.indexOf('function csvCell'), script.indexOf("$('export').onclick")) +
  ';globalThis.api={calculate,minimumPrice,defaults,buildCSV,validState,escapeHTML,parseImportCSV,buildBackup,parseBackup,kitTotals,effectiveFee,copyFees,preserveCatalogFees,validMlLink,readProductFees,profitRateHealth,pricingHealth,pricingAverage,profitRate,profitHealth,averageProfit,saleBreakdown,highestProfitScenario,saleCardHTML,saleResult,currentScenario};', context);
const { calculate, minimumPrice, defaults, buildCSV, validState, escapeHTML,parseImportCSV,buildBackup,parseBackup,kitTotals,effectiveFee,copyFees,preserveCatalogFees,validMlLink,readProductFees,profitRateHealth,pricingHealth,pricingAverage,profitRate,profitHealth,averageProfit,saleBreakdown,highestProfitScenario,saleCardHTML,saleResult,currentScenario } = context.api;
const fees = defaults().fees;
const products = [
  { id:'1', name:'Garrafa térmica 500 ml',category:'Casa e cozinha',cost:30,weight:.35,margin:20,extra:0 },
  { id:'2', name:'Camiseta básica',category:'Moda',cost:25,weight:.2,margin:25,extra:0 },
  { id:'3', name:'Fone Bluetooth',category:'Eletrônicos',cost:60,weight:.15,margin:12,extra:0 }
];
const expected = [[60,62.97],[56.37,59.19],[97.06,103.23]];
let checks = 1;
const results = [];
for (const [index, p] of products.entries()) {
  const row = { Produto:p.name, Custo:p.cost, 'Margem desejada':p.margin+'%' };
  for (const [column, market] of ['ml','shopee'].entries()) {
    const c = calculate(p, fees[market],market);
    assert.equal(c.price, expected[index][column]);
    // Confere a receita líquida e o percentual independentemente da fórmula de preço.
    const deductions = p.cost+p.extra+fees[market].fixed+c.price*fees[market].commission/100+c.price*fees[market].tax/100;
    assert.ok(Math.abs(c.profit-(c.price-deductions))<1e-9);
    assert.ok(c.profit/c.price*100>=p.margin-1e-9);
    assert.ok(((c.price-.01)-(p.cost+p.extra+fees[market].fixed)-(c.price-.01)*(fees[market].commission+fees[market].tax)/100)/(c.price-.01)*100 < p.margin+1e-9);
    row[market+' preço']=c.price;row[market+' lucro']=Number(c.profit.toFixed(4));row[market+' margem']=Number(c.margin.toFixed(4));
    checks+=4;
  }
  results.push(row);
}
assert.equal(calculate({...products[0],margin:80},fees.ml),null);
assert.equal(calculate({...products[0],margin:90},fees.ml),null);
assert.equal(calculate({...products[0],cost:Infinity},fees.ml),null);
assert.equal(calculate({...products[0],extra:12},fees.ml).price,80);
assert.equal(calculate({...products[0],margin:0},{commission:0,fixed:0,tax:0}).price,30);
assert.ok(validState({products,fees}));
assert.ok(!validState({products:[{...products[0],cost:-1}],fees}));
assert.ok(!validState({products,fees:{...fees,ml:{commission:95,fixed:0,tax:6}}}));
assert.equal(products.filter(p=>pricingHealth(p,fees).level==='risk').length,1);
assert.equal(escapeHTML('<script>"&'), '&lt;script&gt;&quot;&amp;');
checks+=10;
// Diferentes combinações de custo, taxa, frete e margem: mantém o lucro desejado.
for(let i=1;i<=300;i++){
  const p={cost:i*.37,extra:i%9,margin:i%30};
  const f={commission:i%25,tax:i%10,fixed:i%7};
  const c=calculate(p,f);
  assert.ok(c && c.margin>=p.margin-1e-8);
  assert.ok(Math.abs(c.price*100-Math.round(c.price*100))<1e-6);
  checks+=2;
}
const csv = buildCSV(products,fees);
assert.ok(csv.startsWith('\uFEFF'));
assert.equal(csv.split('\r\n').length,4);
assert.ok(csv.includes('"60,00";"12,00";"20,00"'));
const hostile=buildCSV([{...products[0],name:'=HYPERLINK("teste")',category:'Casa; "teste"\nlinha'}],fees);
assert.ok(hostile.includes('"\'=HYPERLINK(""teste"")"'));
assert.ok(hostile.includes('"Casa; ""teste""\nlinha"'));
checks+=5;
// Executa o aplicativo completo com um DOM mínimo para conferir seus eventos
// e armazenamento. Isto não substitui inspeção visual em navegador real.
function runtime(storage=new Map()) {
  const nodes=new Map();
  const downloads=[];let lastBlob;
  const get=id=>{
    if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',innerHTML:'',dataset:{},disabled:false,
      classList:{add(){},remove(){},toggle(){}},showModal(){this.open=true;},close(){this.open=false;},
      reset(){},setAttribute(k,v){this[k]=v;},elements:{}});
    return nodes.get(id);
  };
  const headers=['name','cost','weight','margin','ml','mlPremium','shopee'].map(key=>{
    const button={textContent:key+' ↕'};
    const th={dataset:{key},setAttribute(k,v){this[k]=v;},querySelector(){return button;}};
    button.parentElement=th;return th;
  });
  const sandbox=vm.createContext({
    document:{getElementById:get,querySelectorAll:selector=>selector.includes(' button')?headers.map(th=>th.querySelector()):headers,
      body:{append(){}},createElement(){return {click(){downloads.push({filename:this.download,blob:lastBlob});},remove(){}};}},
    Blob:class{constructor(parts,options){this.parts=parts;this.type=options.type;}},
    URL:class extends URL{static createObjectURL(blob){lastBlob=blob;return 'blob:teste';}static revokeObjectURL(){}},
    localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},
    setTimeout:()=>1,clearTimeout(){},crypto:{randomUUID:()=> 'new-product'}
  });
  vm.runInContext(script,sandbox);
  return {get,sandbox,storage,headers,downloads,run:code=>vm.runInContext(code,sandbox)};
}
// Varia os padrões legados guardados em backups para verificar a preservação dos cadastros.
function changeDefaultFixture(app,elements){
 const candidate=JSON.parse(JSON.stringify(copyFees(fees)));
 for(const market of Object.keys(candidate))for(const field of Object.keys(candidate[market])){const input=elements[market+'-'+field];candidate[market][field]=typeof candidate[market][field]==='boolean'?Boolean(input?.checked):Number(input?.value);}
 return app.run(`(()=>{const candidate=${JSON.stringify(candidate)};if(!validState({...state,fees:candidate}))return false;state.fees=candidate;persist();render();renderProductRates(state.fees);return true;})()`);
}
const app=runtime();
assert.equal(app.get('count').textContent,0);
app.get('examples').onclick();
assert.equal(app.get('count').textContent,3);
assert.equal(app.get('warning-count').textContent,0);
assert.ok(app.get('rows').innerHTML.includes('class="health-risk"'));
assert.ok(app.get('rows').innerHTML.includes('117,65'));
app.get('examples').onclick();
assert.equal(app.get('count').textContent,3); // Não duplica exemplos.
app.get('search').value='MODA';app.get('search').oninput();
assert.equal(app.get('table-count').textContent,'1 de 3 produtos');
assert.ok(app.get('rows').innerHTML.includes('Camiseta básica'));
assert.ok(!app.get('rows').innerHTML.includes('Fone Bluetooth'));
app.get('search').value='';app.get('search').oninput();
app.headers.find(th=>th.dataset.key==='cost').querySelector().onclick();
assert.equal(app.run('visibleProducts()[0].cost'),25);
app.headers.find(th=>th.dataset.key==='cost').querySelector().onclick();
assert.equal(app.run('visibleProducts()[0].cost'),60);
app.get('add').onclick();
const productForm={elements:Object.fromEntries(Object.entries({name:'Produto teste',category:'Teste',cost:10,weight:.3,margin:20,extra:2,mlShipping:18}).map(([k,v])=>[k,{value:String(v)}]))};
app.get('product-form').elements=productForm.elements;
app.get('product-form').onsubmit({preventDefault(){},target:productForm});
assert.equal(app.get('count').textContent,4);
assert.equal(app.run("state.products.find(p=>p.id==='new-product').extra"),2);
app.run("openProduct(state.products.find(p=>p.id==='new-product'))");
productForm.elements.cost.value='15';
app.get('product-form').onsubmit({preventDefault(){},target:productForm});
assert.equal(app.run("state.products.find(p=>p.id==='new-product').cost"),15);
assert.equal(app.get('count').textContent,4);
const feeElements=Object.fromEntries(Object.entries(fees).flatMap(([k,v])=>Object.entries(v).map(([f,value])=>[k+'-'+f,{value:String(value)}])));
feeElements['ml-commission'].value='15';
changeDefaultFixture(app,feeElements);
assert.equal(app.run('state.fees.ml.commission'),15);
feeElements['ml-commission'].value='99';
changeDefaultFixture(app,feeElements);
assert.equal(app.run('state.fees.ml.commission'),15); // Rejeita taxa inviável.
assert.equal(changeDefaultFixture(app,feeElements),false);
const reloaded=runtime(app.storage);
assert.equal(reloaded.get('count').textContent,4);
assert.equal(reloaded.run('state.fees.ml.commission'),15);
app.run("deleting='new-product'");app.get('delete-confirm').onclick();
assert.equal(app.get('count').textContent,3);
assert.ok(!app.run("state.products.some(p=>p.id==='new-product')"));
const broken=runtime(new Map([['margem.painel.v1','{broken']]));
assert.equal(broken.get('count').textContent,0);
assert.ok(broken.get('save-status').textContent.includes('Verifique'));
checks+=24;
// Frete condicional: verifica o limite, o lucro e a independência da Shopee.
const shippingResults=[];
for(const [cost,expectedPrice,expectedShipping] of [[53.99,99.99,0],[54,100,0],[54.01,130.02,18]]){
  const p={...products[0],cost,mlShipping:18};
  const c=calculate(p,fees.ml,'ml');
  assert.equal(c.price,expectedPrice);
  assert.equal(c.shippingApplied,expectedShipping);
  assert.ok(Math.abs(c.profit-(c.price*.8-cost-6-expectedShipping))<1e-9);
  assert.ok(c.margin>=20-1e-9);
  const shopee=calculate(p,fees.shopee,'shopee');
  assert.equal(shopee.price,calculate({...p,mlShipping:0},fees.shopee,'shopee').price);
  assert.equal(shopee.shippingApplied,0);
  shippingResults.push({custo:cost,freteCadastrado:18,precoML:c.price,freteAplicado:c.shippingApplied,margem:c.margin});
  checks+=6;
}
assert.equal(calculate({...products[0],cost:90,mlShipping:0},fees.ml,'ml').price,160);
assert.equal(calculate({...products[0],cost:90,mlShipping:18},fees.ml,'ml').price,190);
assert.ok(!validState({products:[{...products[0],mlShipping:-1}],fees}));
const shippingCSV=buildCSV([{...products[0],cost:90,mlShipping:18}],fees);
assert.ok(shippingCSV.includes('"Frete ML cadastrado (R$)"'));
assert.ok(shippingCSV.includes('"Mercado Livre Clássico - frete aplicado (R$)"'));
assert.ok(shippingCSV.includes('"190,00";"38,00";"20,00"'));
assert.equal(app.run("state.products[0].mlShipping"),0);
assert.equal(reloaded.run("state.products.find(p=>p.id==='new-product').mlShipping"),18);
const legacy=runtime(new Map([['margem.painel.v1',JSON.stringify({products,fees})]]));
assert.equal(legacy.get('count').textContent,3);
assert.equal(legacy.run('state.products[0].mlShipping'),0);
assert.equal(legacy.run('state.products[0].cost'),30);
checks+=11;
// O mínimo usa 10% de forma independente da margem cadastrada e reavalia o frete.
const minimumResults=[];
const expectedMinimum=[[51.43,53.13],[44.29,45.32],[94.29,100]];
for(const [index,p] of products.entries()){
  const row={produto:p.name};
  for(const [column,market] of ['ml','shopee'].entries()){
    const c=minimumPrice(p,fees[market],market);
    assert.equal(c.price,expectedMinimum[index][column]);
    assert.ok(c.margin>=10-1e-9);
    const lower=c.price-.01;
    const profit=lower*(1-(fees[market].commission+fees[market].tax)/100)-p.cost-p.extra-fees[market].fixed-c.shippingApplied;
    assert.ok(profit/lower*100<10);
    assert.equal(minimumPrice({...p,margin:5},fees[market],market).price,c.price);
    row[market]=c.price;
    checks+=4;
  }
  minimumResults.push(row);
}
for(const [cost,price,shipping] of [[63.99,99.99,0],[64,100,0],[64.01,125.73,18]]){
  const c=minimumPrice({...products[0],cost,mlShipping:18},fees.ml,'ml');
  assert.equal(c.price,price);assert.equal(c.shippingApplied,shipping);
  assert.ok(c.margin>=10-1e-9);checks+=3;
}
assert.equal(minimumPrice({...products[0],cost:54.01,mlShipping:18},fees.ml,'ml').shippingApplied,0);
assert.equal(minimumPrice(products[0],{commission:84,tax:6,fixed:0},'ml'),null);
assert.ok(buildCSV(products,fees).includes('preço mínimo para margem de 10% (R$)'));
assert.ok(buildCSV(products,fees).includes('"51,43"'));
assert.ok(app.get('rows').innerHTML.includes('Mínimo para 10%'));
// Uma margem desejada inviável não oculta o mínimo viável de 10%.
app.run('state.products[0].margin=85;render()');
assert.ok(app.get('rows').innerHTML.includes('Inviável'));
assert.ok(app.get('rows').innerHTML.includes('Mínimo para 10%'));
checks+=7;
const importOptions={category:'Importados',margin:20};
const simpleCSV='\uFEFFnome;custo;peso\r\nGarrafa térmica;30,00;0,350\r\nCamiseta;25;0,2\r\n\r\n';
const imported=parseImportCSV(simpleCSV,importOptions);
assert.equal(imported.products.length,2);
assert.equal(imported.errors.length,0);
assert.equal(imported.products[0].cost,30);
assert.equal(imported.products[0].weight,.35);
assert.equal(imported.products[0].mlShipping,0);
assert.equal(imported.products[0].category,'Importados');
assert.equal(imported.products[0].margin,20);
const quoted=parseImportCSV('peso,nome,custo\n0.2,"Kit, 2 peças ""premium""",25.50',importOptions);
assert.equal(quoted.products[0].name,'Kit, 2 peças "premium"');
assert.equal(quoted.products[0].cost,25.5);
assert.equal(parseImportCSV('nome,custo,peso\nCaneca,"15,90","0,250"',importOptions).products[0].cost,15.9);
assert.equal(parseImportCSV('nome;custo;peso\n"Produto\ncom quebra";10;0.1',importOptions).products[0].name,'Produto\ncom quebra');
assert.equal(parseImportCSV('sep=;\r\nnome;custo;peso\r\nTeste;10;0,1',importOptions).products.length,1);
assert.equal(parseImportCSV('nome\tcusto\tpeso\nTeste\t10\t0.1',importOptions).products.length,1);
assert.equal(parseImportCSV('NOME;CUSTO;PESO\nTeste;10;0.1',importOptions).products.length,1);
assert.equal(parseImportCSV('\n\r\nnome,custo,peso\nTeste,10,0.1',importOptions).products.length,1);
assert.equal(parseImportCSV(buildCSV(products,fees),importOptions).products.length,3);
const invalid=parseImportCSV('nome;custo;peso\n;10;0.1\nTeste;abc;0.2\nTeste;10;-1\nTeste;0;1\nTeste;2.345;0.1\nTeste;10;0.1234\nTeste;10;0.1;excesso',importOptions);
assert.equal(invalid.errors.length,7);
assert.equal(invalid.products.length,0);
assert.ok(invalid.errors[0].startsWith('Linha 2:'));
assert.throws(()=>parseImportCSV('nome;custo\nTeste;10',importOptions));
assert.throws(()=>parseImportCSV('nome;nome;custo;peso\nA;A;10;1',importOptions));
assert.throws(()=>parseImportCSV('nome;custo;peso\n"Teste;10;1',importOptions));
assert.throws(()=>parseImportCSV('nome;custo;peso\n"Teste"erro;10;1',importOptions));
assert.throws(()=>parseImportCSV('nome;custo;peso',importOptions));
assert.throws(()=>parseImportCSV(' '.repeat(2*1024*1024+1),importOptions));
assert.throws(()=>parseImportCSV('nome;custo;peso\n'+('Teste;1;0\n').repeat(5001),importOptions));
assert.throws(()=>parseImportCSV(simpleCSV,{category:' ',margin:20}));
assert.throws(()=>parseImportCSV(simpleCSV,{category:'Teste',margin:100}));
// Fluxo completo de prévia e confirmação, mantendo os produtos existentes.
const bulk=runtime();bulk.get('examples').onclick();
bulk.get('import-category').value='Lote teste';bulk.get('import-margin').value='20';
bulk.get('import').onclick();
assert.equal(bulk.get('import-confirm').disabled,true);
bulk.run(`importText=${JSON.stringify(simpleCSV)};previewImport()`);
assert.equal(bulk.get('count').textContent,3);
assert.equal(bulk.get('import-confirm').disabled,false);
assert.ok(bulk.get('import-preview').innerHTML.includes('Garrafa térmica'));
bulk.get('import-form').onsubmit({preventDefault(){}});
assert.equal(bulk.get('count').textContent,5);
assert.equal(bulk.run('state.products[3].category'),'Lote teste');
assert.notEqual(bulk.run('state.products[3].id'),bulk.run('state.products[4].id'));
assert.equal(runtime(bulk.storage).get('count').textContent,5);
// Clique repetido e cancelamento não cadastram o lote novamente.
bulk.get('import-form').onsubmit({preventDefault(){}});
assert.equal(bulk.get('count').textContent,5);
bulk.run(`importText=${JSON.stringify(simpleCSV)};previewImport()`);
bulk.get('import-cancel').onclick();
assert.equal(bulk.run('importBatch.length'),0);
bulk.run("importText='nome;custo;peso\\nInválido;-1;0.1';previewImport()");
assert.equal(bulk.get('import-confirm').disabled,true);
assert.ok(bulk.get('import-errors').innerHTML.includes('Linha 2'));
bulk.get('import-form').onsubmit({preventDefault(){}});
assert.equal(bulk.get('count').textContent,5);
bulk.run(`importText=${JSON.stringify(simpleCSV)};state.fees.ml.commission=90;previewImport()`);
assert.equal(bulk.get('import-confirm').disabled,true);
bulk.run(`state.fees.ml.commission=14;importText='nome;custo;peso\\n<img src=x onerror=alert(1)>;10;1';previewImport()`);
assert.ok(!bulk.get('import-preview').innerHTML.includes('<img'));
assert.ok(bulk.get('import-preview').innerHTML.includes('&lt;img'));
checks+=45;
// Backup completo, validação do formato e restauração atômica.
const complete={products:products.map((p,i)=>({...p,extra:i+2,mlShipping:18+i})),kits:[],fees:{ml:{commission:15,fixed:5,tax:7},shopee:{commission:19,fixed:3,tax:5}}};
complete.products=complete.products.map(p=>({...p,feeSnapshot:JSON.parse(JSON.stringify(copyFees(complete.fees)))}));
const backupText=buildBackup(complete),envelope=JSON.parse(backupText);
assert.equal(envelope.format,'margem-backup');
assert.equal(envelope.version,14);
assert.ok(Number.isFinite(Date.parse(envelope.createdAt)));
assert.deepEqual(JSON.parse(JSON.stringify(parseBackup(backupText))),complete);
assert.equal(parseBackup('\uFEFF'+backupText).products.length,3);
assert.equal(parseBackup(buildBackup(defaults())).products.length,0);
assert.equal(parseBackup(buildBackup({products,fees})).products[0].mlShipping,0);
assert.throws(()=>parseBackup('{incompleto'));
assert.throws(()=>parseBackup(JSON.stringify({...envelope,version:15})));
assert.throws(()=>parseBackup(JSON.stringify({...envelope,format:'outro-app'})));
assert.throws(()=>parseBackup(JSON.stringify({...envelope,data:{products:[null],fees}})));
assert.throws(()=>parseBackup(JSON.stringify({...envelope,data:{products:[products[0],products[0]],fees}})));
assert.throws(()=>parseBackup(JSON.stringify({...envelope,data:{products:[{...products[0],cost:'30'}],fees}})));
assert.throws(()=>parseBackup(JSON.stringify({...envelope,data:{products,fees:{...fees,ml:{commission:99,fixed:0,tax:6}}}})));
assert.throws(()=>parseBackup(JSON.stringify({...envelope,data:{products:[{...products[0],mlShipping:-1}],fees}})));
assert.throws(()=>parseBackup(' '.repeat(20*1024*1024+1)));
const recovered=runtime();recovered.get('examples').onclick();
recovered.get('search').value='Moda';recovered.get('search').oninput();
recovered.get('download-backup').onclick();
assert.equal(recovered.downloads.length,1);
assert.ok(recovered.downloads[0].filename.endsWith('.json'));
assert.equal(parseBackup(recovered.downloads[0].blob.parts[0]).products.length,3);
recovered.get('restore-backup').onclick();
assert.equal(recovered.get('restore-confirm').disabled,true);
const before=recovered.run('JSON.stringify(state)');
recovered.run(`previewRestore(${JSON.stringify(backupText)})`);
assert.equal(recovered.run('JSON.stringify(state)'),before);
assert.equal(recovered.get('restore-confirm').disabled,false);
assert.ok(recovered.get('restore-summary').textContent.includes('15%'));
recovered.get('restore-cancel').onclick();
assert.equal(recovered.run('JSON.stringify(state)'),before);
assert.equal(recovered.run('restoreCandidate'),null);
recovered.run(`previewRestore(${JSON.stringify(backupText)})`);
recovered.get('restore-form').onsubmit({preventDefault(){}});
assert.deepEqual(JSON.parse(recovered.run('JSON.stringify(state)')),complete);
assert.equal(recovered.get('search').value,'');
assert.equal(recovered.get('count').textContent,3);
assert.equal(recovered.get('restore-dialog').open,false);
assert.deepEqual(JSON.parse(runtime(recovered.storage).run('JSON.stringify(state)')),complete);
recovered.run("previewRestore('{arquivo inválido')");
assert.equal(recovered.get('restore-confirm').disabled,true);
assert.deepEqual(JSON.parse(recovered.run('JSON.stringify(state)')),complete);
// Uma falha de gravação não substitui nem o estado em memória nem o já salvo.
const failing=runtime();failing.get('examples').onclick();
const oldMemory=failing.run('JSON.stringify(state)'),oldSaved=failing.storage.get('margem.painel.v1');
failing.run(`previewRestore(${JSON.stringify(backupText)});localStorage.setItem=()=>{throw Error('Sem espaço');}`);
failing.get('restore-form').onsubmit({preventDefault(){}});
assert.equal(failing.run('JSON.stringify(state)'),oldMemory);
assert.equal(failing.storage.get('margem.painel.v1'),oldSaved);
assert.ok(failing.get('restore-error').textContent.includes('mantidos'));
assert.equal(failing.get('restore-confirm').disabled,false);
checks+=36;
// Kits: quantidades, custos atuais, taxa fixa única, frete, edição e backup.
const kit={id:'kit-exemplo',name:'Kit garrafas e camiseta',margin:20,extra:5,mlShipping:18,items:[{productId:'1',quantity:2},{productId:'2',quantity:1}]};
const total=kitTotals(kit,products);
assert.equal(total.cost,85);
assert.equal(total.extra,5);
assert.equal(total.weight,.9);
assert.equal(total.units,3);
assert.equal(calculate(total,fees.ml,'ml').price,190);
assert.equal(calculate(total,fees.shopee,'shopee').price,174.08);
assert.ok(calculate(total,fees.ml,'ml').margin>=20);
const withExtras=kitTotals(kit,products.map((p,i)=>({...p,extra:i===0?2:3})));
assert.equal(withExtras.extra,12);
assert.equal(calculate(withExtras,fees.ml,'ml').price,201.67);
assert.equal(kitTotals({...kit,items:[]},products),null);
assert.equal(kitTotals({...kit,items:[{productId:'missing',quantity:1}]},products),null);
assert.equal(kitTotals({...kit,items:[{productId:'1',quantity:1.5}]},products),null);
assert.equal(kitTotals({...kit,items:[{productId:'1',quantity:0}]},products),null);
assert.equal(kitTotals({...kit,items:[{productId:'1',quantity:10000}]},products),null);
assert.equal(kitTotals({...kit,items:[null]},products),null);
assert.equal(kitTotals({...kit,items:[kit.items[0],kit.items[0]]},products),null);
assert.ok(!validState({products,fees,kits:[{...kit,margin:100}]}));
assert.ok(validState({products,fees,kits:[kit]}));
const kitBackup=buildBackup({products,fees,kits:[kit]});
assert.deepEqual(JSON.parse(JSON.stringify(parseBackup(kitBackup).kits)),[kit]);
const legacyBackup=JSON.stringify({format:'margem-backup',version:1,data:{products,fees}});
assert.equal(parseBackup(legacyBackup).kits.length,0);
assert.equal(runtime(new Map([['margem.painel.v1',JSON.stringify({products,fees})]])).run('state.kits.length'),0);
const kitApp=runtime();kitApp.get('examples').onclick();
kitApp.get('view-kits').onclick();
assert.equal(kitApp.get('view-kits')['aria-pressed'],'true');
assert.ok(kitApp.get('kit-picker').innerHTML.includes('Garrafa térmica'));
kitApp.get('kit-picker').onchange({target:{dataset:{kitProduct:'example-Garrafa térmica 500 ml'},checked:true}});
kitApp.get('kit-picker').onchange({target:{dataset:{kitQuantity:'example-Garrafa térmica 500 ml'},value:'2'}});
kitApp.get('kit-picker').onchange({target:{dataset:{kitProduct:'example-Camiseta básica'},checked:true}});
kitApp.get('kit-name').value='Kit teste';kitApp.get('kit-extra').value='5';kitApp.get('kit-shipping').value='18';kitApp.get('kit-margin').oninput();
assert.equal(kitApp.get('kit-save').disabled,false);
assert.ok(kitApp.get('kit-prices').innerHTML.includes('190,00'));
kitApp.get('kit-form').onsubmit({preventDefault(){}});
assert.equal(kitApp.run('state.kits.length'),1);
assert.equal(kitApp.run('state.kits[0].items[0].quantity'),2);
assert.equal(runtime(kitApp.storage).run('state.kits.length'),1);
assert.ok(kitApp.get('saved-kits').innerHTML.includes('Kit teste'));
kitApp.run('state.products[0].cost=40;render()');
assert.ok(kitApp.get('saved-kits').innerHTML.includes('223,34'));
kitApp.get('saved-kits').onclick({target:{closest(){return {dataset:{editKit:'kit-new-product'}};}}});
assert.equal(kitApp.get('kit-name').value,'Kit teste');
kitApp.get('kit-name').value='Kit editado';kitApp.get('kit-form').onsubmit({preventDefault(){}});
assert.equal(kitApp.run('state.kits.length'),1);
assert.equal(kitApp.run('state.kits[0].name'),'Kit editado');
kitApp.run("deleting='example-Garrafa térmica 500 ml'");kitApp.get('delete-confirm').onclick();
assert.equal(kitApp.run('state.products.length'),3);
kitApp.run(`previewRestore(${JSON.stringify(kitBackup)})`);kitApp.get('restore-form').onsubmit({preventDefault(){}});
assert.equal(kitApp.run('state.kits[0].name'),'Kit garrafas e camiseta');
assert.equal(kitApp.run('kitItems.size'),0);
assert.ok(kitApp.get('saved-kits').innerHTML.includes('190,00'));
kitApp.get('saved-kits').onclick({target:{closest(){return {dataset:{deleteKit:'kit-exemplo'}};}}});
kitApp.get('kit-delete-confirm').onclick();
assert.equal(kitApp.run('state.kits.length'),0);
assert.equal(kitApp.run('state.products.length'),3);
checks+=39;
// As duas caixas globais controlam os adicionais para todos os produtos e kits.
assert.equal(calculate(products[0],fees.ml,'ml').price,60);
assert.equal(calculate(products[0],fees.ml,'mlPremium').price,65.46);
assert.equal(minimumPrice(products[0],fees.ml,'mlPremium').price,55.39);
const premiumShipping=calculate({...products[0],cost:54,mlShipping:18},fees.ml,'mlPremium');
assert.equal(premiumShipping.shippingApplied,18);
assert.equal(premiumShipping.price,141.82);
const scenarios=[];
for(const [easy,event,price] of [[false,false,62.97],[true,false,63.88],[false,true,66.02],[true,true,66.98]]){
 const serviceFees={...fees.shopee,easyReturnEnabled:easy,officialEventEnabled:event};
 const c=calculate(products[0],serviceFees,'shopee');
 assert.equal(c.price,price);
 assert.equal(c.feesApplied.commission,event?22.5:20);
 assert.equal(c.feesApplied.fixed,easy?4.49:4);
 assert.ok(c.margin>=20);
 assert.ok(Math.abs(c.profit-(c.price*(1-(20+(event?2.5:0)+6)/100)-30-4-(easy?.49:0)))<1e-9);
 // Marcações antigas do produto não podem contrariar as caixas globais.
 assert.equal(calculate({...products[0],shopeeEasyReturn:!easy,shopeeOfficialEvent:!event},serviceFees,'shopee').price,price);
 assert.equal(calculate(products[0],fees.ml,'ml').price,60);
 assert.equal(calculate(products[0],fees.ml,'mlPremium').price,65.46);
 scenarios.push({devolucaoFacilIntegrada:easy,eventosOficiaisIntegrados:event,precoShopee:c.price});
}
const bothFees={...fees,shopee:{...fees.shopee,easyReturnEnabled:true,officialEventEnabled:true}};
assert.equal(minimumPrice(products[0],bothFees.shopee,'shopee').price,56.09);
assert.equal(calculate(products[0],{...bothFees.shopee,easyReturnFee:1,officialEventRate:5},'shopee').price,71.43);
assert.equal(calculate({...products[0],margin:72},bothFees.shopee,'shopee'),null);
assert.ok(!validState({products,fees:{...fees,shopee:{...fees.shopee,easyReturnEnabled:'sim'}}}));
assert.ok(!validState({products,fees:{...fees,ml:{...fees.ml,premiumCommission:99}}}));
const modeCSV=buildCSV(products,bothFees);
assert.ok(modeCSV.includes('Mercado Livre Clássico - preço (R$)'));
assert.ok(modeCSV.includes('Mercado Livre Premium - preço (R$)'));
assert.equal((modeCSV.match(/"Sim";"Sim"/g)??[]).length,3);
assert.ok(modeCSV.includes('"66,98"'));
assert.ok(modeCSV.includes('"22,50";"4,49"'));
const modes=runtime();modes.get('examples').onclick();modes.run('renderProductRates(state.fees)');
assert.ok(modes.get('product-rate-fields').innerHTML.includes('name="product-shopee-easyReturnEnabled"'));
assert.ok(modes.get('product-rate-fields').innerHTML.includes('name="product-shopee-officialEventEnabled"'));
assert.ok(!html.includes('name="shopeeEasyReturn"'));
assert.ok(!html.includes('id="kit-easy-return"'));
const formElements=configuration=>Object.fromEntries(Object.entries(configuration).flatMap(([k,v])=>Object.entries(v).map(([field,value])=>[k+'-'+field,typeof value==='boolean'?{checked:value}:{value:String(value)}])));
modes.run("state.kits=[{id:'service-kit',name:'Kit com serviços',margin:20,extra:0,mlShipping:0,items:[{productId:state.products[0].id,quantity:2},{productId:state.products[1].id,quantity:1}]}]");
const integrationElements=formElements(bothFees);
changeDefaultFixture(modes,integrationElements);
assert.equal(modes.run('state.fees.shopee.easyReturnEnabled'),true);
assert.equal(modes.run('state.fees.shopee.officialEventEnabled'),true);
assert.ok(modes.get('rows').innerHTML.includes('Devolução Fácil: Não'));
assert.ok(modes.get('rows').innerHTML.includes('Campanhas de Destaque: Não'));
assert.ok(modes.get('saved-kits').innerHTML.includes('173,77'));
assert.ok(modes.get('saved-kits').innerHTML.includes('Evento oficial: Sim'));
assert.equal(runtime(modes.storage).run('state.fees.shopee.easyReturnEnabled'),true);
assert.ok(modes.get('product-rate-fields').innerHTML.includes('name="product-shopee-easyReturnEnabled" checked'));
const kitCharge=calculate(kitTotals(kit,products),bothFees.shopee,'shopee');
assert.equal(kitCharge.feesApplied.fixed,4.49); // Uma cobrança por venda do kit.
assert.equal(kitCharge.feesApplied.commission,22.5);
integrationElements['shopee-easyReturnEnabled'].checked=false;
changeDefaultFixture(modes,integrationElements);
assert.ok(modes.get('rows').innerHTML.includes('63,90'));
assert.ok(modes.get('rows').innerHTML.includes('Devolução Fácil: Não'));
integrationElements['shopee-officialEventEnabled'].checked=false;
changeDefaultFixture(modes,integrationElements);
assert.ok(modes.get('rows').innerHTML.includes('63,90'));
assert.ok(modes.get('saved-kits').innerHTML.includes('164,82'));
assert.equal(modes.run('state.fees.shopee.easyReturnFee'),.49);
assert.equal(modes.run('state.fees.shopee.officialEventRate'),2.5);
assert.equal(runtime(modes.storage).run('state.fees.shopee.officialEventEnabled'),false);
const allModes={products:products.map(p=>({...p,mlShipping:p.mlShipping??0})),fees:bothFees,kits:[kit]};
assert.deepEqual(JSON.parse(JSON.stringify(parseBackup(buildBackup(allModes)))),JSON.parse(JSON.stringify(allModes)));
const oldModeData=parseBackup(JSON.stringify({format:'margem-backup',version:3,data:{products:[{...products[0],shopeeEasyReturn:true,shopeeOfficialEvent:true},...products.slice(1)],fees,kits:[]}}));
assert.equal(calculate(oldModeData.products[0],oldModeData.fees.shopee,'shopee').price,62.97);
const restoreModes=runtime();restoreModes.run(`previewRestore(${JSON.stringify(buildBackup(allModes))})`);
restoreModes.get('restore-form').onsubmit({preventDefault(){}});
assert.equal(restoreModes.run('state.fees.shopee.easyReturnEnabled'),true);
assert.equal(restoreModes.run('state.fees.shopee.officialEventEnabled'),true);
assert.ok(restoreModes.get('saved-kits').innerHTML.includes('Evento oficial: Sim'));
const separateRates=formElements(bothFees);
separateRates['ml-commission'].value='12';separateRates['ml-premiumCommission'].value='18';
changeDefaultFixture(modes,separateRates);
assert.equal(modes.run('state.fees.ml.commission'),12);
assert.equal(modes.run('state.fees.ml.premiumCommission'),18);
assert.ok(modes.get('rows').innerHTML.includes('60,00'));
assert.ok(modes.get('rows').innerHTML.includes('65,46'));
modes.get('mobile-sort').onchange({target:{value:'mlPremium'}});
assert.equal(modes.run('visibleProducts()[0].name'),'Camiseta básica');
checks+=93;
// Cada produto mantém as taxas completas do momento do cadastro.
const snapshotApp=runtime();snapshotApp.run("let feeTestId=0;crypto.randomUUID=()=> 'fee-test-'+(++feeTestId)");
function addFeeProduct(app,name){
 app.get('add').onclick();
 const form={elements:Object.fromEntries(Object.entries({name,category:'Teste',cost:30,weight:.35,margin:20,extra:0,mlShipping:0}).map(([k,v])=>[k,{value:String(v)}]))};
 app.get('product-form').elements=form.elements;app.get('product-form').onsubmit({preventDefault(){},target:form});
 return form;
}
addFeeProduct(snapshotApp,'Produto anterior');
const originalSnapshot=snapshotApp.run('JSON.stringify(state.products[0].feeSnapshot)');
const changedFees={ml:{commission:30,premiumCommission:35,fixed:10,tax:8},shopee:{commission:25,fixed:7,tax:9,easyReturnFee:.99,officialEventRate:3,easyReturnEnabled:true,officialEventEnabled:true}};
changeDefaultFixture(snapshotApp,formElements(changedFees));
assert.equal(snapshotApp.run('JSON.stringify(state.products[0].feeSnapshot)'),originalSnapshot);
assert.equal(snapshotApp.run("calculate(state.products[0],state.fees.ml,'ml').price"),60);
assert.equal(snapshotApp.run("calculate(state.products[0],state.fees.ml,'mlPremium').price"),65.46);
assert.equal(snapshotApp.run("calculate(state.products[0],state.fees.shopee,'shopee').price"),62.97);
assert.equal(snapshotApp.run("minimumPrice(state.products[0],state.fees.shopee,'shopee').price"),53.13);
assert.ok(snapshotApp.get('rows').innerHTML.includes('Devolução Fácil: Não'));
addFeeProduct(snapshotApp,'Produto novo');
assert.equal(snapshotApp.run('state.products[1].feeSnapshot.ml.fixed'),10);
assert.equal(snapshotApp.run('state.products[1].feeSnapshot.ml.commission'),30);
assert.equal(snapshotApp.run('state.products[1].feeSnapshot.ml.premiumCommission'),35);
assert.equal(snapshotApp.run('state.products[1].feeSnapshot.shopee.easyReturnEnabled'),true);
assert.equal(snapshotApp.run("calculate(state.products[1],state.fees.ml,'ml').price"),95.24);
assert.equal(snapshotApp.run("calculate(state.products[1],state.fees.ml,'mlPremium').price"),108.11);
assert.equal(snapshotApp.run("calculate(state.products[1],state.fees.shopee,'shopee').price"),88.35);
assert.equal(snapshotApp.run("minimumPrice(state.products[1],state.fees.shopee,'shopee').price"),71.68);
assert.ok(snapshotApp.run('state.products[0].feeSnapshot!==state.fees && state.products[1].feeSnapshot.shopee!==state.fees.shopee'));
snapshotApp.run('state.fees.ml.fixed=99;state.fees.shopee.easyReturnFee=5;render()');
assert.equal(snapshotApp.run('state.products[1].feeSnapshot.ml.fixed'),10);
assert.equal(snapshotApp.run('state.products[1].feeSnapshot.shopee.easyReturnFee'),.99);
assert.equal(snapshotApp.run("calculate(state.products[1],state.fees.shopee,'shopee').price"),88.35);
// Editar nome, custo e margem mantém a mesma cópia de taxas.
snapshotApp.run('openProduct(state.products[0])');
snapshotApp.get('product-form').elements.name.value='Produto anterior editado';
snapshotApp.get('product-form').elements.cost.value='40';
snapshotApp.get('product-form').onsubmit({preventDefault(){},target:snapshotApp.get('product-form')});
assert.equal(snapshotApp.run('JSON.stringify(state.products[0].feeSnapshot)'),originalSnapshot);
assert.equal(snapshotApp.run("calculate(state.products[0],state.fees.ml,'ml').price"),76.67);
const mixedCSV=snapshotApp.run('buildCSV(state.products,state.fees)');
assert.ok(mixedCSV.split('\r\n')[1].includes('"14,00";"6,00";"6,00"'));
assert.ok(mixedCSV.split('\r\n')[2].includes('"30,00";"10,00";"8,00"'));
assert.ok(mixedCSV.split('\r\n')[1].includes('"Não";"Não"'));
assert.ok(mixedCSV.split('\r\n')[2].includes('"Sim";"Sim"'));
const snapshotReload=runtime(snapshotApp.storage);
assert.equal(snapshotReload.run('JSON.stringify(state.products[0].feeSnapshot)'),originalSnapshot);
assert.equal(snapshotReload.run("calculate(state.products[1],state.fees.shopee,'shopee').price"),88.35);
const snapshotBackup=snapshotApp.run('buildBackup(state)'),snapshotRestore=runtime();
snapshotRestore.run(`previewRestore(${JSON.stringify(snapshotBackup)})`);snapshotRestore.get('restore-form').onsubmit({preventDefault(){}});
assert.equal(snapshotRestore.run('JSON.stringify(state.products[0].feeSnapshot)'),originalSnapshot);
assert.equal(snapshotRestore.run('state.products[1].feeSnapshot.ml.fixed'),10);
assert.equal(snapshotRestore.run("calculate(state.products[1],state.fees.shopee,'shopee').price"),88.35);
// Produtos antigos capturam e gravam as taxas atuais na primeira abertura.
const migrateStorage=new Map([['margem.painel.v1',JSON.stringify({products,fees})]]),migrated=runtime(migrateStorage);
assert.equal(migrated.run('state.products[0].feeSnapshot.ml.commission'),14);
assert.ok(JSON.parse(migrateStorage.get('margem.painel.v1')).products.every(p=>p.feeSnapshot));
changeDefaultFixture(migrated,formElements(changedFees));
assert.equal(migrated.run("calculate(state.products[0],state.fees.ml,'ml').price"),60);
assert.equal(runtime(migrateStorage).run('state.products[0].feeSnapshot.ml.fixed'),6);
// Um backup antigo usa as taxas do próprio arquivo, não as do navegador de destino.
const oldSnapshotBackup=JSON.stringify({format:'margem-backup',version:4,data:{products,fees:{ml:{commission:11,fixed:3,tax:5},shopee:{commission:12,fixed:2,tax:4}}}});
snapshotRestore.run(`previewRestore(${JSON.stringify(oldSnapshotBackup)})`);snapshotRestore.get('restore-form').onsubmit({preventDefault(){}});
assert.equal(snapshotRestore.run('state.products[0].feeSnapshot.ml.commission'),11);
assert.equal(snapshotRestore.run('state.products[0].feeSnapshot.ml.premiumCommission'),11);
assert.ok(!validState({products:[{...products[0],feeSnapshot:{ml:{commission:'14'},shopee:{}}}],fees}));
const importedSnapshot=runtime();importedSnapshot.get('import-category').value='Importados';importedSnapshot.get('import-margin').value='20';
importedSnapshot.run(`importText=${JSON.stringify(simpleCSV)};previewImport()`);importedSnapshot.get('import-form').onsubmit({preventDefault(){}});
assert.equal(importedSnapshot.run('state.products[0].feeSnapshot.ml.fixed'),6);
changeDefaultFixture(importedSnapshot,formElements(changedFees));
assert.equal(importedSnapshot.run("calculate(state.products[0],state.fees.ml,'ml').price"),60);
assert.ok(importedSnapshot.run('state.products[0].feeSnapshot.ml!==state.products[1].feeSnapshot.ml'));
checks+=40;
// Kits também preservam suas taxas, independentemente das taxas dos componentes.
const frozenKits=runtime();frozenKits.run("let kitFeeId=0;crypto.randomUUID=()=> 'kit-fee-'+(++kitFeeId)");frozenKits.get('examples').onclick();
function saveFeeKit(app,name){
 app.get('kit-new').onclick();app.get('kit-name').value=name;app.get('kit-margin').value='20';app.get('kit-extra').value='5';app.get('kit-shipping').value='18';
 app.get('kit-picker').onchange({target:{dataset:{kitProduct:'example-Garrafa térmica 500 ml'},checked:true}});
 app.get('kit-picker').onchange({target:{dataset:{kitQuantity:'example-Garrafa térmica 500 ml'},value:'2'}});
 app.get('kit-picker').onchange({target:{dataset:{kitProduct:'example-Camiseta básica'},checked:true}});
 app.get('kit-form').onsubmit({preventDefault(){}});
}
function savedKitPrice(app,index,scenario,minimum=false){return app.run(`${minimum?'minimumPrice':'calculate'}(kitTotals(state.kits[${index}],state.products),state.fees[marketOf('${scenario}')],'${scenario}').price`);}
saveFeeKit(frozenKits,'Kit anterior');
const firstKitId=frozenKits.run('state.kits[0].id'),kitOriginalFees=frozenKits.run('JSON.stringify(state.kits[0].feeSnapshot)');
assert.equal(savedKitPrice(frozenKits,0,'ml'),190);
assert.equal(savedKitPrice(frozenKits,0,'mlPremium'),207.28);
assert.equal(savedKitPrice(frozenKits,0,'shopee'),183.34);
assert.equal(savedKitPrice(frozenKits,0,'shopee',true),157.15);
changeDefaultFixture(frozenKits,formElements(changedFees));
assert.equal(frozenKits.run('JSON.stringify(state.kits[0].feeSnapshot)'),kitOriginalFees);
assert.equal(savedKitPrice(frozenKits,0,'ml'),190);
assert.equal(savedKitPrice(frozenKits,0,'mlPremium'),207.28);
assert.equal(savedKitPrice(frozenKits,0,'shopee'),183.34);
assert.equal(savedKitPrice(frozenKits,0,'shopee',true),157.15);
assert.ok(frozenKits.get('saved-kits').innerHTML.includes('Devolução Fácil: Não'));
saveFeeKit(frozenKits,'Kit novo');
assert.equal(frozenKits.run('state.kits.length'),2);
assert.equal(frozenKits.run('state.kits[1].feeSnapshot.ml.commission'),30);
assert.equal(frozenKits.run('state.products[0].feeSnapshot.ml.commission'),14);
assert.equal(savedKitPrice(frozenKits,1,'ml'),280.96);
assert.equal(savedKitPrice(frozenKits,1,'mlPremium'),318.92);
assert.equal(savedKitPrice(frozenKits,1,'shopee'),224.02);
assert.equal(savedKitPrice(frozenKits,1,'shopee',true),178.21);
assert.ok(frozenKits.get('saved-kits').innerHTML.includes('Devolução Fácil: Sim'));
assert.ok(frozenKits.run('state.kits[1].feeSnapshot!==state.fees && state.kits[1].feeSnapshot.ml!==state.kits[0].feeSnapshot.ml'));
frozenKits.run('state.fees.ml.fixed=99;state.fees.shopee.easyReturnFee=5;render()');
assert.equal(frozenKits.run('state.kits[1].feeSnapshot.ml.fixed'),10);
assert.equal(frozenKits.run('state.kits[1].feeSnapshot.shopee.easyReturnFee'),.49);
assert.equal(savedKitPrice(frozenKits,1,'shopee'),224.02);
// Uma configuração geral incompatível com a margem não impede editar o kit antigo.
const highFees={ml:{commission:85,premiumCommission:85,fixed:10,tax:8},shopee:{...changedFees.shopee,commission:80}};
changeDefaultFixture(frozenKits,formElements(highFees));
frozenKits.get('kit-new').onclick();
frozenKits.get('kit-picker').onchange({target:{dataset:{kitProduct:'example-Garrafa térmica 500 ml'},checked:true}});
assert.equal(frozenKits.get('kit-save').disabled,true);
frozenKits.get('saved-kits').onclick({target:{closest(){return {dataset:{editKit:firstKitId}};}}});
assert.equal(frozenKits.get('kit-save').disabled,false);
assert.ok(frozenKits.get('kit-prices').innerHTML.includes('190,00'));
frozenKits.get('kit-name').value='Kit anterior editado';
frozenKits.get('kit-picker').onchange({target:{dataset:{kitQuantity:'example-Garrafa térmica 500 ml'},value:'1'}});
assert.ok(frozenKits.get('kit-prices').innerHTML.includes('140,00'));
frozenKits.get('kit-form').onsubmit({preventDefault(){}});
assert.equal(frozenKits.run('state.kits.length'),2);
assert.equal(frozenKits.run('JSON.stringify(state.kits[0].feeSnapshot)'),kitOriginalFees);
assert.equal(savedKitPrice(frozenKits,0,'ml'),140);
assert.equal(savedKitPrice(frozenKits,0,'ml',true),94.29);
// Custos dos componentes continuam atuais; somente as taxas ficam preservadas.
frozenKits.run('state.products[0].cost=40;persist();render()');
assert.equal(savedKitPrice(frozenKits,0,'ml'),156.67);
assert.equal(frozenKits.run('JSON.stringify(state.kits[0].feeSnapshot)'),kitOriginalFees);
const frozenReload=runtime(frozenKits.storage);
assert.equal(frozenReload.run('JSON.stringify(state.kits[0].feeSnapshot)'),kitOriginalFees);
assert.equal(savedKitPrice(frozenReload,0,'ml'),156.67);
const frozenBackup=frozenKits.run('buildBackup(state)'),restoredKits=runtime();
restoredKits.run(`previewRestore(${JSON.stringify(frozenBackup)})`);restoredKits.get('restore-form').onsubmit({preventDefault(){}});
assert.equal(restoredKits.run('JSON.stringify(state.kits[0].feeSnapshot)'),kitOriginalFees);
assert.equal(restoredKits.run('state.kits[1].feeSnapshot.ml.fixed'),10);
assert.equal(savedKitPrice(restoredKits,0,'ml'),156.67);
const legacyKitData={products:products.map(p=>({...p,mlShipping:0,feeSnapshot:JSON.parse(JSON.stringify(copyFees(fees)))})),kits:[kit],fees:changedFees};
const kitMigrationStorage=new Map([['margem.painel.v1',JSON.stringify(legacyKitData)]]),kitMigrated=runtime(kitMigrationStorage);
assert.equal(kitMigrated.run('state.kits[0].feeSnapshot.ml.commission'),30);
assert.equal(kitMigrated.run('state.products[0].feeSnapshot.ml.commission'),14);
assert.equal(JSON.parse(kitMigrationStorage.get('margem.painel.v1')).kits[0].feeSnapshot.ml.fixed,10);
assert.equal(savedKitPrice(kitMigrated,0,'ml'),280.96);
const legacyKitBackup=JSON.stringify({format:'margem-backup',version:5,data:legacyKitData});
restoredKits.run(`previewRestore(${JSON.stringify(legacyKitBackup)})`);restoredKits.get('restore-form').onsubmit({preventDefault(){}});
assert.equal(restoredKits.run('state.kits[0].feeSnapshot.ml.commission'),30);
assert.equal(savedKitPrice(restoredKits,0,'ml'),280.96);
const invalidKitFees=JSON.parse(JSON.stringify(fees));invalidKitFees.ml.fixed=-1;
assert.ok(!validState({products,fees,kits:[{...kit,feeSnapshot:invalidKitFees}]}));
assert.throws(()=>parseBackup(JSON.stringify({format:'margem-backup',version:6,data:{products,fees,kits:[{...kit,feeSnapshot:invalidKitFees}]}})));
checks+=44;
// Dados do anúncio são referência e não substituem o custo de compra ou as taxas.
const mlMetadata={itemId:'MLB1234567890',sellerId:123,title:'Garrafa do catálogo',categoryId:'MLB1234',categoryName:'Casa',catalogProductId:null,listingType:'gold_special',permalink:'https://produto.mercadolivre.com.br/MLB-1234567890-_JM',price:99.9,weight:.35,thumbnail:null,variationCount:0,fetchedAt:'2026-11-11T12:00:00.000Z'};
assert.ok(validMlLink(mlMetadata));
assert.ok(!validMlLink({...mlMetadata,permalink:'javascript:alert(1)'}));
assert.ok(!validMlLink({...mlMetadata,thumbnail:'https://evil.example/foto.png'}));
assert.ok(!validState({products:[{...products[0],mercadoLivre:{...mlMetadata,sellerId:'123'}}],fees}));
const mlApp=runtime();addFeeProduct(mlApp,'Produto vinculado');
mlApp.run('openProduct(state.products[0])');
const individualRates=JSON.parse(JSON.stringify(copyFees(fees)));individualRates.ml.commission=10;individualRates.ml.premiumCommission=30;individualRates.shopee.easyReturnEnabled=true;individualRates.shopee.officialEventEnabled=true;
const individualElements=Object.fromEntries(Object.entries(formElements(individualRates)).map(([key,value])=>['product-'+key,value]));
mlApp.get('product-form').elements={...mlApp.get('product-form').elements,...individualElements};
mlApp.run(`mlLinkedDraft=${JSON.stringify(mlMetadata)}`);
mlApp.get('product-form').onsubmit({preventDefault(){},target:mlApp.get('product-form')});
assert.equal(mlApp.run('state.products[0].cost'),30);
assert.equal(mlApp.run('state.products[0].mercadoLivre.price'),99.9);
assert.equal(mlApp.run('state.products[0].feeSnapshot.ml.commission'),10);
assert.equal(mlApp.run('state.fees.ml.commission'),14);
assert.equal(mlApp.run("calculate(state.products[0],state.fees.ml,'ml').price"),56.25);
assert.equal(mlApp.run("calculate(state.products[0],state.fees.shopee,'shopee').price"),66.98);
assert.ok(mlApp.get('rows').innerHTML.includes('ML vinculado: MLB1234567890'));
assert.ok(mlApp.run('buildCSV(state.products,state.fees)').includes('MLB1234567890'));
assert.ok(mlApp.run('buildCSV(state.products,state.fees)').includes('"99,90"'));
assert.equal(runtime(mlApp.storage).run('state.products[0].mercadoLivre.itemId'),'MLB1234567890');
const mlBackup=mlApp.run('buildBackup(state)'),mlRestore=runtime();mlRestore.run(`previewRestore(${JSON.stringify(mlBackup)})`);mlRestore.get('restore-form').onsubmit({preventDefault(){}});
assert.equal(mlRestore.run('state.products[0].mercadoLivre.itemId'),'MLB1234567890');
assert.equal(mlRestore.run('state.products[0].feeSnapshot.ml.commission'),10);
mlApp.run('openProduct(state.products[0])');mlApp.get('ml-unlink').onclick();
assert.equal(mlApp.run('state.products[0].mercadoLivre.itemId'),'MLB1234567890');
mlApp.get('product-form').onsubmit({preventDefault(){},target:mlApp.get('product-form')});
assert.equal(mlApp.run('state.products[0].mercadoLivre'),undefined);
assert.equal(readProductFees({elements:{'product-ml-commission':{value:'abc'}}},fees),null);
checks+=21;
// Cotações oficiais são preservadas, exportadas e não recalculadas com taxas gerais.
const officialQuoteFixture=(price,commission,fixed,target)=>{const feeAmount=Math.round(price*commission)/100+fixed,profit=price*.94-30-feeAmount;return {price,commission,fixed,profit,margin:profit/price*100,shippingApplied:0,saleFeeAmount:feeAmount,listingFeeAmount:0,feeAmount};};
const officialFixture={source:'mercadolivre-listing-prices',fetchedAt:'2026-11-12T12:00:00.000Z',itemId:mlMetadata.itemId,categoryId:'MLB1234',shippingMode:'me2',logisticType:'cross_docking',inputs:{cost:30,extra:0,margin:20,tax:6,mlShipping:0,weight:.35},quotes:{ml:{desired:officialQuoteFixture(60,14,6),minimum:officialQuoteFixture(51.43,14,6)},mlPremium:{desired:officialQuoteFixture(65.46,19,6),minimum:officialQuoteFixture(55.39,19,6)}}};
const officialProduct={...products[0],mlShipping:0,feeSnapshot:copyFees(fees),mercadoLivre:mlMetadata,mlPricing:officialFixture};
assert.ok(validState({products:[officialProduct],fees,kits:[]}));
assert.equal(calculate(officialProduct,changedFees.ml,'ml').price,60);
assert.equal(calculate(officialProduct,changedFees.ml,'mlPremium').price,65.46);
assert.equal(minimumPrice(officialProduct,fees.ml,'ml').price,51.43);
assert.equal(calculate({...officialProduct,cost:31},fees.ml,'ml'),null);
assert.equal(calculate({...officialProduct,weight:.4},fees.ml,'ml'),null);
assert.equal(calculate({...officialProduct,feeSnapshot:{...officialProduct.feeSnapshot,ml:{...officialProduct.feeSnapshot.ml,tax:7}}},fees.ml,'ml'),null);
const officialBackup=buildBackup({products:[officialProduct],fees,kits:[]}),officialRestored=parseBackup(officialBackup);
assert.equal(officialRestored.products[0].mlPricing.quotes.ml.desired.feeAmount,14.4);
assert.equal(calculate(officialRestored.products[0],fees.ml,'ml').price,60);
assert.ok(buildCSV([officialProduct],fees).includes('"API oficial Mercado Livre"'));
const invalidPricing=JSON.parse(JSON.stringify(officialProduct));invalidPricing.mlPricing.quotes.ml.desired.feeAmount=-1;
assert.ok(!validState({products:[invalidPricing],fees}));
checks+=11;
const freightFixture={source:'mercadolivre-shipping-options',itemId:mlMetadata.itemId,amount:20,currency:'BRL',fetchedAt:'2026-11-12T15:00:00.000Z',price:93.34,listingType:'gold_special',shippingMode:'me2',logisticType:'cross_docking',freeShipping:true,billableWeight:950};
const quoteWithFreight=(price,rate)=>{const q=officialQuoteFixture(price,rate,6);q.shippingApplied=20;q.profit-=20;q.margin=q.profit/price*100;return q;};
const freightProduct={...officialProduct,mlShipping:20,mercadoLivre:{...mlMetadata,shippingQuote:freightFixture},mlPricing:{...officialFixture,inputs:{...officialFixture.inputs,mlShipping:20,autoShipping:true},shippingQuote:freightFixture,quotes:{ml:{desired:quoteWithFreight(93.34,14),minimum:quoteWithFreight(80,14)},mlPremium:{desired:quoteWithFreight(101.83,19),minimum:quoteWithFreight(86.16,19)}}}};
assert.ok(validState({products:[freightProduct],fees}));
assert.equal(calculate(freightProduct,changedFees.ml,'ml').shippingApplied,20);
assert.ok(calculate(freightProduct,changedFees.ml,'ml').margin>=20);
const restoredFreight=parseBackup(buildBackup({products:[freightProduct],fees})).products[0];
assert.equal(restoredFreight.mercadoLivre.shippingQuote.amount,20);
assert.equal(restoredFreight.mlPricing.shippingQuote.billableWeight,950);
assert.equal(restoredFreight.mlPricing.inputs.autoShipping,true);
assert.equal(calculate(restoredFreight,fees.ml,'ml').price,93.34);
const manualWithFreight={...freightProduct,mlPricing:undefined};
assert.equal(calculate(manualWithFreight,fees.ml,'ml').shippingApplied,20);
checks+=8;
const tableFreightProduct=JSON.parse(JSON.stringify(freightProduct));for(const q of [tableFreightProduct.mercadoLivre.shippingQuote,tableFreightProduct.mlPricing.shippingQuote])Object.assign(q,{source:'mercadolivre-shipping-table',tableCheckedAt:'2026-11-12T16:35:00.000Z',dimensionsKnown:false});
const tableFreightRestored=parseBackup(buildBackup({products:[tableFreightProduct],fees})).products[0];
assert.equal(tableFreightRestored.mercadoLivre.shippingQuote.source,'mercadolivre-shipping-table');assert.equal(tableFreightRestored.mlPricing.shippingQuote.dimensionsKnown,false);
assert.ok(buildCSV([tableFreightRestored],fees).includes('Tabela oficial 40538'));
checks+=3;
// Os campos visíveis exibem a consulta oficial e preservam a alternativa manual.
const fieldApp=runtime();addFeeProduct(fieldApp,'Campos de comissão');
fieldApp.run('openProduct(state.products[0])');
const fieldForm=fieldApp.get('product-form');fieldForm.elements={...fieldForm.elements,...Object.fromEntries(Object.entries(formElements(fees)).map(([k,v])=>['product-'+k,v]))};
fieldForm.elements.mlShipping.value='20';
const displayedPricing=JSON.parse(JSON.stringify(freightProduct.mlPricing));displayedPricing.quotes.ml.desired.commission=11.5;displayedPricing.quotes.mlPremium.desired.commission=16.5;
fieldApp.run(`mlLinkedDraft=${JSON.stringify(freightProduct.mercadoLivre)};mlPricingDraft=${JSON.stringify(displayedPricing)}`);
fieldApp.get('ml-auto-fees').checked=true;fieldApp.run('renderAutoPricing()');
assert.equal(fieldForm.elements['product-ml-commission'].value,'11.5');assert.equal(fieldForm.elements['product-ml-premiumCommission'].value,'16.5');
assert.equal(fieldForm.elements['product-ml-commission'].readOnly,true);assert.equal(fieldForm.elements['product-ml-commission'].disabled,false);assert.equal(fieldForm.elements['product-ml-commission'].required,false);
assert.ok(fieldApp.get('product-ml-commission-info').textContent.includes('Categoria: Casa'));
assert.equal(fieldApp.run('state.fees.ml.commission'),14);
fieldForm.elements.cost.value='31';fieldApp.run('renderAutoPricing()');
assert.equal(fieldForm.elements['product-ml-commission'].value,'');assert.equal(fieldForm.elements['product-ml-premiumCommission'].value,'');
fieldApp.get('ml-auto-fees').checked=false;fieldApp.run('renderAutoPricing()');
assert.equal(fieldForm.elements['product-ml-commission'].value,'14');assert.equal(fieldForm.elements['product-ml-premiumCommission'].value,'19');assert.equal(fieldForm.elements['product-ml-commission'].readOnly,false);
const referenceFixture={itemId:mlMetadata.itemId,categoryId:mlMetadata.categoryId,price:60,fetchedAt:'2026-11-12T16:40:00.000Z',quotes:{ml:{commission:11.5,fixed:0,feeAmount:6.9},mlPremium:{commission:16.5,fixed:0,feeAmount:9.9}}};
fieldForm.elements.cost.value='';fieldApp.run(`mlCommissionReference=${JSON.stringify(referenceFixture)}`);fieldApp.get('ml-auto-fees').checked=true;fieldApp.run('renderAutoPricing()');
assert.equal(fieldForm.elements['product-ml-commission'].value,'11.5');assert.equal(fieldForm.elements['product-ml-premiumCommission'].value,'16.5');
assert.ok(fieldApp.get('product-ml-commission-info').textContent.includes('Referência do anúncio'));
checks+=15;
// A taxa fixa existente acompanha a consulta e a modalidade, inclusive zero, preservando o imposto.
assert.equal(fieldForm.elements['product-ml-fixed'].value,'0');
assert.equal(fieldForm.elements['product-ml-fixed'].readOnly,true);
assert.equal(fieldForm.elements['product-ml-fixed'].disabled,false);
const referenceWithDifferentFixed={...referenceFixture,quotes:{ml:{...referenceFixture.quotes.ml,fixed:0},mlPremium:{...referenceFixture.quotes.mlPremium,fixed:2.5}}};
fieldApp.run(`mlLinkedDraft.listingType='gold_pro';mlCommissionReference=${JSON.stringify(referenceWithDifferentFixed)};renderAutoPricing()`);
assert.equal(fieldForm.elements['product-ml-fixed'].value,'2.5');
assert.ok(fieldApp.get('product-ml-premiumCommission-info').textContent.includes('taxa fixa de R$'));
assert.equal(fieldForm.elements['product-ml-tax'].value,'6');
assert.equal(fieldApp.run('state.fees.ml.fixed'),6);
fieldApp.get('ml-auto-fees').checked=false;fieldApp.run('renderAutoPricing()');
assert.equal(fieldForm.elements['product-ml-fixed'].value,'6');
assert.equal(fieldForm.elements['product-ml-fixed'].readOnly,false);
assert.equal(fieldForm.elements['product-ml-tax'].value,'6');
fieldForm.elements.cost.value='31';fieldApp.get('ml-auto-fees').checked=true;fieldApp.run('renderAutoPricing()');
assert.equal(fieldForm.elements['product-ml-fixed'].value,'');
assert.equal(fieldForm.elements['product-ml-tax'].value,'6');
const immutablePricing=JSON.stringify(displayedPricing);
fieldForm.elements.cost.value='30';fieldApp.run(`mlLinkedDraft.listingType='gold_special';mlPricingDraft=${immutablePricing};renderAutoPricing()`);
assert.equal(fieldForm.elements['product-ml-fixed'].value,String(displayedPricing.quotes.ml.desired.fixed));
assert.equal(fieldForm.elements['product-ml-tax'].value,'6');
assert.equal(fieldApp.run('JSON.stringify(mlPricingDraft)'),immutablePricing);
checks+=15;
// Os campos existentes da Shopee preenchem a faixa sem alterar imposto nem marcar programas.
const shopeeFieldsApp=runtime();addFeeProduct(shopeeFieldsApp,'Automação CNPJ');shopeeFieldsApp.run('openProduct(state.products[0])');
const shopeeForm=shopeeFieldsApp.get('product-form');shopeeForm.elements={...shopeeForm.elements,...Object.fromEntries(Object.entries(formElements(fees)).map(([key,value])=>['product-'+key,value]))};
const untouchedSnapshot=shopeeFieldsApp.run('JSON.stringify(state.products[0].feeSnapshot)'),untouchedDefaults=shopeeFieldsApp.run('JSON.stringify(state.fees)');
shopeeForm.elements.cost.value='10';shopeeForm.elements.margin.value='8';shopeeForm.elements['product-shopee-tax'].value='11.3';
shopeeFieldsApp.run('renderShopeePricing()');
assert.equal(shopeeForm.elements['product-shopee-commission'].value,'20');assert.equal(shopeeForm.elements['product-shopee-fixed'].value,'4.5');
assert.equal(shopeeForm.elements['product-shopee-easyReturnFee'].value,'0.49');assert.equal(shopeeForm.elements['product-shopee-officialEventRate'].value,'5');
assert.equal(shopeeForm.elements['product-shopee-tax'].value,'11.3');assert.equal(shopeeForm.elements['product-shopee-commission'].readOnly,true);
assert.equal(shopeeForm.elements['product-shopee-easyReturnEnabled'].checked,false);assert.equal(shopeeForm.elements['product-shopee-officialEventEnabled'].checked,false);
assert.ok(shopeeFieldsApp.get('product-shopee-policy-status').textContent.includes('23,90'));
shopeeForm.elements.cost.value='100';shopeeForm.elements.margin.value='10';shopeeFieldsApp.run('renderShopeePricing()');
assert.equal(shopeeForm.elements['product-shopee-commission'].value,'14');assert.equal(shopeeForm.elements['product-shopee-fixed'].value,'20');
shopeeForm.elements['product-shopee-easyReturnEnabled'].checked=true;shopeeForm.elements['product-shopee-officialEventEnabled'].checked=true;shopeeFieldsApp.run('renderShopeePricing()');
assert.equal(shopeeForm.elements['product-shopee-fixed'].value,'26');assert.equal(shopeeForm.elements['product-shopee-tax'].value,'11.3');
assert.equal(shopeeForm.elements['product-shopee-easyReturnEnabled'].checked,true);assert.equal(shopeeForm.elements['product-shopee-officialEventEnabled'].checked,true);
assert.equal(shopeeFieldsApp.run('JSON.stringify(state.products[0].feeSnapshot)'),untouchedSnapshot);assert.equal(shopeeFieldsApp.run('JSON.stringify(state.fees)'),untouchedDefaults);
const readAutoShopee=shopeeFieldsApp.run("readProductFees($('product-form'),state.fees)");assert.ok(readAutoShopee.shopee.policyId);assert.equal(readAutoShopee.shopee.tax,11.3);
shopeeFieldsApp.get('product-form').onsubmit({preventDefault(){},target:shopeeForm});
assert.equal(shopeeFieldsApp.run('state.products[0].feeSnapshot.shopee.officialEventRate'),5);
assert.equal(shopeeFieldsApp.run('state.products[0].feeSnapshot.shopee.easyReturnFee'),.49);
checks+=21;
// Kits têm categoria própria, uma cotação do conjunto e backup preservado.
const kitContextFixture={categoryId:'MLB1234',categoryName:'Categoria do kit',referenceItemId:mlMetadata.itemId,dimensions:null};
const kitQuoteFixture=(price,rate)=>{const feeAmount=Math.round(price*rate)/100+6,profit=price*.94-55-20-feeAmount;return {price,commission:rate,fixed:6,profit,margin:profit/price*100,shippingApplied:20,saleFeeAmount:feeAmount,listingFeeAmount:0,feeAmount};};
const kitOfficialFixture={...freightProduct.mlPricing,kind:'kit',context:kitContextFixture,inputs:{cost:55,extra:0,weight:.55,margin:20,tax:6,mlShipping:20,autoShipping:true},shippingQuote:{...freightFixture,price:135},quotes:{ml:{desired:kitQuoteFixture(135,14),minimum:kitQuoteFixture(115.72,14)},mlPremium:{desired:kitQuoteFixture(147.28,19),minimum:kitQuoteFixture(124.62,19)}}};
const linkedKitProducts=[{...products[0],mercadoLivre:mlMetadata,mlShipping:0,feeSnapshot:copyFees(fees)},{...products[1],mlShipping:0,feeSnapshot:copyFees(fees)}];
const officialKit={id:'kit-oficial',name:'Kit oficial de teste',margin:20,extra:0,mlShipping:20,feeSnapshot:copyFees(fees),mlContext:kitContextFixture,mlPricing:kitOfficialFixture,items:[{productId:'1',quantity:1},{productId:'2',quantity:1}]};
assert.ok(validState({products:linkedKitProducts,fees,kits:[officialKit]}));
const officialKitTotals=kitTotals(officialKit,linkedKitProducts);assert.equal(officialKitTotals.cost,55);assert.equal(officialKitTotals.weight,.55);
assert.equal(calculate(officialKitTotals,changedFees.ml,'ml').price,135);assert.equal(calculate(officialKitTotals,changedFees.ml,'mlPremium').price,147.28);
assert.equal(minimumPrice(officialKitTotals,fees.ml,'ml').price,115.72);
const changedKitTotals=kitTotals({...officialKit,items:[{productId:'1',quantity:2},{productId:'2',quantity:1}]},linkedKitProducts);assert.equal(calculate(changedKitTotals,fees.ml,'ml'),null);
const officialKitRestored=parseBackup(buildBackup({products:linkedKitProducts,fees,kits:[officialKit]}));assert.equal(officialKitRestored.kits[0].mlContext.categoryName,'Categoria do kit');assert.equal(officialKitRestored.kits[0].mlPricing.kind,'kit');assert.equal(officialKitRestored.kits[0].mlPricing.shippingQuote.amount,20);
const wrongKit={...officialKit,mlContext:{...kitContextFixture,categoryId:'MLB9999'}};assert.ok(!validState({products:linkedKitProducts,fees,kits:[wrongKit]}));
const autoKitApp=runtime(new Map([['margem.painel.v1',JSON.stringify({products:linkedKitProducts,fees,kits:[officialKit]})]]));
autoKitApp.get('saved-kits').onclick({target:{closest(){return {dataset:{editKit:'kit-oficial'}};}}});
assert.equal(autoKitApp.get('kit-auto-fees').checked,true);assert.equal(autoKitApp.get('kit-ml-classic').value,14);assert.equal(autoKitApp.get('kit-ml-premium').value,19);assert.equal(autoKitApp.get('kit-shipping').readOnly,true);assert.equal(autoKitApp.get('kit-save').disabled,false);
autoKitApp.get('kit-picker').oninput({target:{dataset:{kitQuantity:'1'},value:'2'}});assert.equal(autoKitApp.get('kit-save').disabled,true);assert.equal(autoKitApp.get('kit-ml-classic').value,'');
assert.ok(autoKitApp.get('kit-prices').innerHTML.includes('Aguardando cotação oficial'));
assert.equal(autoKitApp.run('state.kits[0].mlPricing.inputs.cost'),55);
checks+=20;
// Classificação usa margens efetivas, respeita as fronteiras e não sinaliza cotações pendentes como seguras.
for(const [margin,level] of [[-1,'low'],[0,'low'],[9.99,'low'],[10,'risk'],[14.99,'risk'],[15,'safe'],[35,'safe'],[15-1e-12,'safe'],[10-1e-12,'risk'],[null,'pending'],[undefined,'pending'],[NaN,'pending']]){assert.equal(profitRateHealth(margin).level,level);checks++;}
const zeroFees=copyFees(fees);Object.assign(zeroFees.ml,{commission:0,premiumCommission:0,fixed:0,tax:0});Object.assign(zeroFees.shopee,{commission:0,fixed:0,tax:0});
const roundedHealthProduct={...products[0],cost:.01,extra:0,margin:12,feeSnapshot:zeroFees};
assert.equal(calculate(roundedHealthProduct,fees.ml,'ml').margin,50);
assert.equal(pricingHealth(roundedHealthProduct,fees).level,'safe');
assert.equal(pricingHealth({...officialProduct,cost:31},fees).level,'pending');
assert.equal(pricingHealth(null,fees).level,'pending');
checks+=4;
const healthProducts=products.map((p,i)=>({...p,margin:[8,12,18][i],feeSnapshot:copyFees(fees)}));
const healthKits=[8,12,18].map((margin,i)=>({id:'health-kit-'+i,name:'Kit margem '+margin,margin,extra:0,mlShipping:0,feeSnapshot:copyFees(fees),items:[{productId:'1',quantity:1}]}));
const healthApp=runtime(new Map([['margem.painel.v1',JSON.stringify({products:healthProducts,fees,kits:healthKits})]]));
assert.equal(healthApp.get('warning-count').textContent,1);assert.equal(healthApp.get('risk-count').textContent,1);assert.equal(healthApp.get('safe-count').textContent,1);
for(const cls of ['health-low','health-risk','health-safe']){assert.ok(healthApp.get('rows').innerHTML.includes('class="'+cls+'"'));assert.ok(healthApp.get('saved-kits').innerHTML.includes('class="saved-kit '+cls+'"'));checks+=2;}
const healthCSV=buildCSV(healthProducts,fees);
assert.ok(healthCSV.includes('Classificação pelo lucro líquido'));assert.ok(healthCSV.includes('"Lucro baixo";"Lucro baixo";"Lucro baixo";"Lucro baixo"'));assert.ok(healthCSV.includes('"Em risco";"Em risco";"Em risco";"Em risco"'));assert.ok(healthCSV.includes('"Seguro";"Seguro";"Seguro";"Seguro"'));
const staleHealth=runtime(new Map([['margem.painel.v1',JSON.stringify({products:[{...officialProduct,cost:31}],fees,kits:[]})]]));assert.equal(staleHealth.get('safe-count').textContent,0);assert.equal(staleHealth.get('pending-count').textContent,'1 para recalcular');assert.ok(staleHealth.get('rows').innerHTML.includes('class="health-pending"'));
checks+=10;
// Média simples dos três cenários: um canal abaixo de 10% não determina sozinho a cor do produto.
const mixedAverageProduct={...officialProduct,mercadoLivre:{...mlMetadata,price:null},margin:5,mlPricing:{...officialFixture,inputs:{...officialFixture.inputs,margin:5},quotes:{ml:{...officialFixture.quotes.ml,desired:officialQuoteFixture(50,14,6)},mlPremium:{...officialFixture.quotes.mlPremium,desired:officialQuoteFixture(90,19,6)}}}};
const mixedMargins=['ml','mlPremium','shopee'].map(k=>calculate(mixedAverageProduct,fees[k==='mlPremium'?'ml':k],k).margin),expectedAverage=mixedMargins.reduce((sum,m)=>sum+m,0)/3;
assert.ok(Math.abs(pricingAverage(mixedAverageProduct,fees)-expectedAverage)<1e-9);
assert.equal(Math.round(pricingAverage(mixedAverageProduct,fees)*100)/100,16);
assert.equal(profitRateHealth(mixedMargins[0]).level,'low');assert.equal(pricingHealth(mixedAverageProduct,fees).level,'safe');
assert.equal(pricingAverage({...officialProduct,cost:31},fees),null);assert.equal(pricingAverage(null,fees),null);
const averageApp=runtime(new Map([['margem.painel.v1',JSON.stringify({products:[mixedAverageProduct],fees,kits:[]})]]));
assert.ok(averageApp.get('rows').innerHTML.includes('Lucro sobre venda: 16%'));
assert.ok(averageApp.get('rows').innerHTML.includes('class="health-safe"'));assert.ok(averageApp.get('rows').innerHTML.includes('class="price-health health-low"'));
assert.equal(averageApp.get('average').textContent,averageApp.run('money(averageProfit(state.products[0],state.fees))'));assert.equal(averageApp.get('safe-count').textContent,1);
const averageExportCSV=buildCSV([mixedAverageProduct],fees);assert.ok(averageExportCSV.includes('Lucro líquido médio sobre a venda (%)'));assert.ok(averageExportCSV.trimEnd().endsWith('"16,00"'));
assert.equal(staleHealth.get('average').textContent,'—');assert.ok(staleHealth.get('average-help').textContent.includes('0 de 1'));
checks+=15;

// A cor depende do lucro apurado, mesmo se a margem informada ou recebida divergir.
for(const [profit,expected] of [[-2,'low'],[9.99,'low'],[10,'risk'],[14.99,'risk'],[15,'safe']]){assert.equal(profitHealth({price:100,profit,margin:90}).level,expected);checks++;}
assert.equal(profitHealth({price:100,profit:15,margin:1}).level,'safe');
assert.equal(profitHealth({price:0,profit:15,margin:90}).level,'pending');
assert.equal(profitRate({price:50,profit:7.5,margin:1}),15);
checks+=3;
// Os descontos apresentados reconciliam com o lucro, inclusive tarifas oficiais com parcela fixa.
for(const product of [products[0],{...products[0],extra:2,mlShipping:18},officialProduct,officialKitTotals])for(const key of ['ml','mlPremium','shopee']){
 const base=fees[key==='mlPremium'?'ml':key],result=calculate(product,base,key);if(!result)continue;
 const d=saleBreakdown(product,base,key,result);
 assert.ok(Math.abs(result.price-d.cost-d.extra-d.tax-d.commission-d.fixed-d.shipping-result.profit)<1e-8);
 if(result.official)assert.equal(d.fixed,0);
 checks++;
}
const bestChannel=highestProfitScenario(products[0],fees);
const rankedChannels=['ml','mlPremium','shopee'].map(key=>({key,result:calculate(products[0],fees[key==='mlPremium'?'ml':key],key)})).sort((a,b)=>b.result.profit-a.result.profit);
assert.equal(bestChannel,rankedChannels[0].key);
assert.equal(highestProfitScenario({...products[0],feeSnapshot:zeroFees},fees),null);
assert.equal(highestProfitScenario({...officialProduct,cost:31},fees),null);
assert.ok(Math.abs(averageProfit(mixedAverageProduct,fees)-['ml','mlPremium','shopee'].reduce((sum,key)=>sum+calculate(mixedAverageProduct,fees[key==='mlPremium'?'ml':key],key).profit,0)/3)<1e-9);
const card=saleCardHTML(products[0],fees.ml,'ml',{best:'ml'});
assert.ok(card.includes('Preço sugerido de venda')&&card.includes('Lucros:')&&card.includes('sale-profits')&&card.includes('Maior lucro'));
assert.ok(averageExportCSV.includes('Lucro líquido médio por venda (R$)'));
checks+=6;

// Produtos existentes usam o preço do anúncio na modalidade vinculada, mesmo abaixo da meta.
const currentSaleFixture=price=>({...officialProduct,mercadoLivre:{...mlMetadata,price,currentFees:{...referenceFixture,price,quotes:{ml:{commission:11.5,fixed:0,feeAmount:price*.115},mlPremium:{commission:16.5,fixed:0,feeAmount:price*.165}}},currentShipping:{...freightFixture,price,amount:6.85}}});
for(const [price,level] of [[50,'low'],[52.5,'risk'],[60,'safe']]){
 const product=currentSaleFixture(price),result=saleResult(product,fees.ml,'ml');
 const expected=price-price*.06-price*.115-30-6.85;
 assert.equal(result.price,price);assert.equal(result.basis,'current');
 assert.ok(Math.abs(result.profit-expected)<1e-9);assert.equal(pricingHealth(product,fees).level,level);
 assert.ok(Math.abs(pricingAverage(product,fees)-expected/price*100)<1e-9);
 assert.equal(saleResult(product,fees.ml,'mlPremium').basis,'suggested');
 assert.equal(calculate(product,fees.ml,'ml').price,calculate(officialProduct,fees.ml,'ml').price);
 assert.ok(validState({products:[product],fees}));checks+=8;
}
const currentSale=currentSaleFixture(50),currentRestored=parseBackup(buildBackup({products:[currentSale],fees})).products[0];
assert.equal(saleResult(currentRestored,fees.ml,'ml').profit,saleResult(currentSale,fees.ml,'ml').profit);
assert.equal(currentRestored.mercadoLivre.currentFees.price,50);assert.equal(currentRestored.mercadoLivre.currentShipping.amount,6.85);
assert.equal(saleResult(officialProduct,fees.ml,'ml'),null); // Nunca aplica a tarifa do preço sugerido em outro preço.
assert.equal(pricingHealth(officialProduct,fees).level,'pending');
assert.ok(!validMlLink({...currentSale.mercadoLivre,currentFees:{...currentSale.mercadoLivre.currentFees,price:99}}));
const manualCurrent={...products[0],feeSnapshot:copyFees(fees),mercadoLivre:{...mlMetadata,price:40}};
assert.ok(Math.abs(saleResult(manualCurrent,fees.ml,'ml').profit+4)<1e-9);
assert.equal(pricingHealth(manualCurrent,fees).level,'low');assert.equal(currentScenario({...manualCurrent,mercadoLivre:{...mlMetadata,listingType:'gold_pro'}}),'mlPremium');
assert.ok(saleCardHTML(currentSale,fees.ml,'ml').includes('Preço de venda atual'));
const currentCSV=buildCSV([currentSale],fees);assert.ok(currentCSV.includes('Preço atual do anúncio vinculado'));assert.ok(currentCSV.includes('"50,00";"4,40";"8,80"'));
const currentMerge=runtime();currentMerge.run(`state.products=[${JSON.stringify(officialProduct)}]`);
const originalFees=currentMerge.run('JSON.stringify(state.products[0].feeSnapshot)'),originalSuggestions=currentMerge.run('JSON.stringify(state.products[0].mlPricing)');
currentMerge.run(`state.products[0].mercadoLivre=currentLinkFromResponse(state.products[0].mercadoLivre,{item:${JSON.stringify({...mlMetadata,price:50,shippingQuote:{...freightFixture,price:50,amount:6.85}})},commissions:${JSON.stringify(currentSale.mercadoLivre.currentFees)}});render();persist();`);
assert.equal(currentMerge.run('JSON.stringify(state.products[0].feeSnapshot)'),originalFees);assert.equal(currentMerge.run('JSON.stringify(state.products[0].mlPricing)'),originalSuggestions);
assert.ok(currentMerge.get('rows').innerHTML.includes('Lucro no preço atual'));assert.ok(currentMerge.get('rows').innerHTML.includes('8,8%'));
checks+=16;
currentMerge.run(`state.products[0].mercadoLivre=currentLinkFromResponse(state.products[0].mercadoLivre,{item:${JSON.stringify({...mlMetadata,price:50})},commissions:null});`);
assert.equal(currentMerge.run('state.products[0].mercadoLivre.currentFees.price'),50);
assert.equal(currentMerge.run('state.products[0].mercadoLivre.currentShipping.amount'),6.85);
currentMerge.run(`state.products[0].mercadoLivre=currentLinkFromResponse(state.products[0].mercadoLivre,{item:${JSON.stringify({...mlMetadata,price:55})},commissions:null});`);
assert.equal(currentMerge.run('saleResult(state.products[0],state.fees.ml,"ml")'),null);
checks+=3;
console.table(results);
console.table(shippingResults);
console.table(minimumResults);
console.table(scenarios);
console.log(`${checks} verificações passaram: cálculos, arredondamento, margem, entradas inviáveis, frete, CSV e eventos com DOM simulado (cadastro, edição, taxas, busca, ordenação, exclusão e persistência).`);
fs.writeFileSync(__dirname+'/resultados-testes.json', JSON.stringify({taxas:fees,produtos:results,freteCondicional:shippingResults,minimosPara10PorCento:minimumResults,opcoesShopee:scenarios,verificacoes:checks},null,2)+'\n');
