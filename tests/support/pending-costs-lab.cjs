/* QA local de custos por SKU, sem credenciais ou dados de produção. */
const { startLab } = require('./catalog-lab.cjs');
const fixtures = require('./ml-import-fixtures.cjs');
const seed = fixtures.data();
seed.products[0].mercadoLivre.skus = ['SKU-MLB1234567890'];
const ids = Array.from({ length: 3 }, (_, i) => 'MLB' + (9000000001 + i));
seed.pendingProducts = ids.map(id => ({ id:'ml-pending-123-'+id, item:fixtures.response(id,55,id.endsWith('3')?2:0).item, margin:20, feeSnapshot:structuredClone(seed.fees), importedAt:fixtures.stamp }));
const loader = fixtures.requests(['MLB1234567890', ...ids]);
startLab({ ports:[43184], seed, mlRequest:loader.request }).then(lab => {
 console.log('Custos por SKU · dados fictícios: '+lab.peers[0].origin);
 process.on('SIGINT',async()=>{await lab.close();process.exit();});
});
