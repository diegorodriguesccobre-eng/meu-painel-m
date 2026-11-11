// Execute: node validar.cjs (somente para desenvolvimento; o painel não exige Node).
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
new vm.Script(script); // Verifica também a sintaxe de todo o aplicativo.
const context = vm.createContext({});
vm.runInContext(script.slice(0, script.indexOf('let state=defaults()')) +
  script.slice(script.indexOf('function csvCell'), script.indexOf("$('export').onclick")) +
  ';globalThis.api={calculate,minimumPrice,defaults,buildCSV,validState,escapeHTML,parseImportCSV,buildBackup,parseBackup,kitTotals,effectiveFee};', context);
const { calculate, minimumPrice, defaults, buildCSV, validState, escapeHTML,parseImportCSV,buildBackup,parseBackup,kitTotals,effectiveFee } = context.api;
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
assert.equal(products.filter(p=>p.margin<15).length,1);
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
    URL:{createObjectURL(blob){lastBlob=blob;return 'blob:teste';},revokeObjectURL(){}},
    localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},
    setTimeout:()=>1,clearTimeout(){},crypto:{randomUUID:()=> 'new-product'}
  });
  vm.runInContext(script,sandbox);
  return {get,sandbox,storage,headers,downloads,run:code=>vm.runInContext(code,sandbox)};
}
const app=runtime();
assert.equal(app.get('count').textContent,0);
app.get('examples').onclick();
assert.equal(app.get('count').textContent,3);
assert.equal(app.get('warning-count').textContent,1);
assert.ok(app.get('rows').innerHTML.includes('class="warning"'));
assert.ok(app.get('rows').innerHTML.includes('103,23'));
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
app.get('fees-form').onsubmit({preventDefault(){},target:{elements:feeElements}});
assert.equal(app.run('state.fees.ml.commission'),15);
feeElements['ml-commission'].value='99';
app.get('fees-form').onsubmit({preventDefault(){},target:{elements:feeElements}});
assert.equal(app.run('state.fees.ml.commission'),15); // Rejeita taxa inviável.
assert.ok(app.get('fees-error').textContent);
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
const backupText=buildBackup(complete),envelope=JSON.parse(backupText);
assert.equal(envelope.format,'margem-backup');
assert.equal(envelope.version,3);
assert.ok(Number.isFinite(Date.parse(envelope.createdAt)));
assert.deepEqual(JSON.parse(JSON.stringify(parseBackup(backupText))),complete);
assert.equal(parseBackup('\uFEFF'+backupText).products.length,3);
assert.equal(parseBackup(buildBackup(defaults())).products.length,0);
assert.equal(parseBackup(buildBackup({products,fees})).products[0].mlShipping,0);
assert.throws(()=>parseBackup('{incompleto'));
assert.throws(()=>parseBackup(JSON.stringify({...envelope,version:4})));
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
// Modalidades do ML e as quatro combinações dos adicionais da Shopee.
assert.equal(calculate(products[0],fees.ml,'ml').price,60);
assert.equal(calculate(products[0],fees.ml,'mlPremium').price,65.46);
assert.equal(minimumPrice(products[0],fees.ml,'mlPremium').price,55.39);
assert.equal(calculate({...products[0],cost:54,mlShipping:18},fees.ml,'ml').shippingApplied,0);
const premiumShipping=calculate({...products[0],cost:54,mlShipping:18},fees.ml,'mlPremium');
assert.equal(premiumShipping.shippingApplied,18);
assert.equal(premiumShipping.price,141.82);
const scenarios=[];
for(const [easy,event,price] of [[false,false,62.97],[true,false,63.88],[false,true,66.02],[true,true,66.98]]){
 const p={...products[0],shopeeEasyReturn:easy,shopeeOfficialEvent:event};
 const c=calculate(p,fees.shopee,'shopee');
 assert.equal(c.price,price);
 assert.equal(c.feesApplied.commission,event?22.5:20);
 assert.equal(c.feesApplied.fixed,easy?4.49:4);
 assert.ok(c.margin>=20);
 const independentProfit=c.price*(1-(20+(event?2.5:0)+6)/100)-30-4-(easy?.49:0);
 assert.ok(Math.abs(c.profit-independentProfit)<1e-9);
 assert.equal(calculate(p,fees.ml,'ml').price,60);
 assert.equal(calculate(p,fees.ml,'mlPremium').price,65.46);
 scenarios.push({devolucaoFacil:easy,eventosOficiais:event,precoShopee:c.price});
}
const both={...products[0],shopeeEasyReturn:true,shopeeOfficialEvent:true};
assert.equal(minimumPrice(both,fees.shopee,'shopee').price,56.09);
assert.equal(calculate(both,{commission:20,tax:6,fixed:4,easyReturnFee:1,officialEventRate:5},'shopee').price,71.43);
assert.equal(calculate({...both,margin:72},fees.shopee,'shopee'),null);
assert.ok(!validState({products:[{...products[0],shopeeEasyReturn:'sim'}],fees}));
assert.ok(!validState({products,fees:{...fees,ml:{...fees.ml,premiumCommission:99}}}));
const modeCSV=buildCSV([both],fees);
assert.ok(modeCSV.includes('Mercado Livre Clássico - preço (R$)'));
assert.ok(modeCSV.includes('Mercado Livre Premium - preço (R$)'));
assert.ok(modeCSV.includes('"Sim";"Sim"'));
assert.ok(modeCSV.includes('"66,98"'));
assert.ok(modeCSV.includes('"22,50";"4,49"'));
const modes=runtime();modes.get('examples').onclick();
assert.ok(modes.get('market-fields').innerHTML.includes('Comissão Clássica'));
assert.ok(modes.get('market-fields').innerHTML.includes('Comissão Premium'));
assert.ok(modes.get('market-fields').innerHTML.includes('officialEventRate'));
modes.get('product-form').elements={...productForm.elements,shopeeEasyReturn:{checked:false},shopeeOfficialEvent:{checked:false}};
modes.run('openProduct(state.products[0])');
modes.get('product-form').elements.shopeeEasyReturn.checked=true;
modes.get('product-form').elements.shopeeOfficialEvent.checked=true;
modes.get('product-form').onsubmit({preventDefault(){},target:modes.get('product-form')});
assert.equal(modes.run('state.products[0].shopeeEasyReturn'),true);
assert.equal(modes.run('state.products[0].shopeeOfficialEvent'),true);
assert.ok(modes.get('rows').innerHTML.includes('Devolução Fácil: Sim'));
assert.ok(modes.get('rows').innerHTML.includes('Evento oficial: Sim'));
assert.ok(modes.get('rows').innerHTML.includes('data-label="Mercado Livre Premium"'));
assert.equal(runtime(modes.storage).run('state.products[0].shopeeOfficialEvent'),true);
const optionsKit={...kit,shopeeEasyReturn:true,shopeeOfficialEvent:true};
const optionsTotals=kitTotals(optionsKit,products);
assert.equal(calculate(optionsTotals,fees.shopee,'shopee').feesApplied.fixed,4.49);
assert.equal(calculate(optionsTotals,fees.shopee,'shopee').feesApplied.commission,22.5);
assert.equal(kitTotals(kit,[{...products[0],shopeeEasyReturn:true},...products.slice(1)]).shopeeEasyReturn,false);
const allModes={products:[both,...products.slice(1)].map(p=>({...p,mlShipping:p.mlShipping??0})),fees,kits:[optionsKit]};
assert.deepEqual(JSON.parse(JSON.stringify(parseBackup(buildBackup(allModes)))),JSON.parse(JSON.stringify(allModes)));
const oldModeData=parseBackup(JSON.stringify({format:'margem-backup',version:2,data:{products,fees:{ml:{commission:14,fixed:6,tax:6},shopee:{commission:20,fixed:4,tax:6}}}}));
assert.equal(calculate(oldModeData.products[0],oldModeData.fees.ml,'mlPremium').price,60);
assert.equal(calculate(oldModeData.products[0],oldModeData.fees.shopee,'shopee').price,62.97);
const separateRates=Object.fromEntries(Object.entries(fees).flatMap(([k,v])=>Object.entries(v).map(([field,value])=>[k+'-'+field,{value:String(value)}])));
separateRates['ml-commission'].value='12';separateRates['ml-premiumCommission'].value='18';
modes.get('fees-form').onsubmit({preventDefault(){},target:{elements:separateRates}});
assert.equal(modes.run('state.fees.ml.commission'),12);
assert.equal(modes.run('state.fees.ml.premiumCommission'),18);
assert.ok(modes.get('rows').innerHTML.includes('58,07'));
assert.ok(modes.get('rows').innerHTML.includes('64,29'));
modes.get('mobile-sort').onchange({target:{value:'mlPremium'}});
assert.equal(modes.run('sort.key'),'mlPremium');
assert.equal(modes.run('visibleProducts()[0].name'),'Camiseta básica');
modes.run("state.products=[{...state.products[0],id:'A',shopeeEasyReturn:true,shopeeOfficialEvent:true},{...state.products[0],id:'B',shopeeEasyReturn:false,shopeeOfficialEvent:false}];sort={key:'shopee',direction:1};render()");
assert.equal(modes.run('visibleProducts()[0].id'),'B');
const restoreModes=runtime();
restoreModes.run(`previewRestore(${JSON.stringify(buildBackup(allModes))})`);
restoreModes.get('restore-form').onsubmit({preventDefault(){}});
assert.equal(restoreModes.run('state.products[0].shopeeEasyReturn'),true);
assert.equal(restoreModes.run('state.kits[0].shopeeOfficialEvent'),true);
assert.equal(restoreModes.run('state.fees.ml.premiumCommission'),19);
assert.ok(restoreModes.get('saved-kits').innerHTML.includes('Evento oficial: Sim'));
checks+=71;
console.table(results);
console.table(shippingResults);
console.table(minimumResults);
console.table(scenarios);
console.log(`${checks} verificações passaram: cálculos, arredondamento, margem, entradas inviáveis, frete, CSV e eventos com DOM simulado (cadastro, edição, taxas, busca, ordenação, exclusão e persistência).`);
fs.writeFileSync(__dirname+'/resultados-testes.json', JSON.stringify({taxas:fees,produtos:results,freteCondicional:shippingResults,minimosPara10PorCento:minimumResults,opcoesShopee:scenarios,verificacoes:checks},null,2)+'\n');
