/* Execute somente para QA local. Banco em memória e anúncios fictícios. */
const { startLab } = require('./catalog-lab.cjs');
const fixtures = require('./ml-import-fixtures.cjs');
const loader = fixtures.requests(['MLB1234567890', ...Array.from({ length: 34 }, (_, i) => 'MLB' + (9000000000 + i))]);
startLab({ ports: [43183], seed: fixtures.data(), mlRequest: loader.request }).then(lab => {
 console.log('Laboratório de importação: ' + lab.peers[0].origin + ' · dados fictícios · sem chamadas externas');
 process.on('SIGINT', async () => { await lab.close(); process.exit(); });
});
