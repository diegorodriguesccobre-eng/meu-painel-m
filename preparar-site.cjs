const fs = require('node:fs');
const path = require('node:path');

// Publica o painel e seu favicon; documentação e testes ficam fora do site.
const output = path.join(__dirname, 'dist');
fs.mkdirSync(output, { recursive: true });
for (const asset of ['index.html', 'favicon.svg', 'favicon.png']) fs.copyFileSync(path.join(__dirname, asset), path.join(output, asset));
fs.writeFileSync(path.join(output, '_headers'), '/\n  Cache-Control: public, max-age=0, must-revalidate\n/index.html\n  Cache-Control: public, max-age=0, must-revalidate\n');
console.log('Site pronto: dist/index.html');
