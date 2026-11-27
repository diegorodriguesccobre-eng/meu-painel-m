/* QA local de custos por SKU, sem credenciais ou dados de produção. */
const { startLab } = require('./catalog-lab.cjs');
const fixtures = require('./ml-import-fixtures.cjs');
const seed = fixtures.data();
const existingOnly = process.argv.includes('--existing-only');
const freshen = value => Array.isArray(value) ? value.map(freshen) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key,val]) => [key,key==='fetchedAt'?new Date().toISOString():freshen(val)])) : value;
seed.products[0].mercadoLivre.skus = ['SKU-MLB1234567890'];
const ids = existingOnly ? [] : Array.from({ length: 3 }, (_, i) => 'MLB' + (9000000001 + i));
seed.pendingProducts = ids.map(id => ({ id:'ml-pending-123-'+id, item:fixtures.response(id,55,id.endsWith('3')?2:0).item, margin:20, feeSnapshot:structuredClone(seed.fees), importedAt:fixtures.stamp }));
const loader = fixtures.requests(['MLB1234567890', ...ids]);
startLab({ ports:[43184], seed:freshen(seed), mlRequest:async(action,options)=>freshen(await loader.request(action,options)) }).then(lab => {
 console.log('Custos por SKU · dados fictícios: '+lab.peers[0].origin);
 process.on('SIGINT',async()=>{await lab.close();process.exit();});
});
