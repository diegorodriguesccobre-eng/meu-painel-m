const fs = require('node:fs');
const path = require('node:path');

// Publica somente o painel; documentação e testes ficam fora do site.
const output = path.join(__dirname, 'dist');
fs.mkdirSync(output, { recursive: true });
fs.copyFileSync(path.join(__dirname, 'index.html'), path.join(output, 'index.html'));
fs.writeFileSync(path.join(output, '_headers'), '/\n  Cache-Control: public, max-age=0, must-revalidate\n/index.html\n  Cache-Control: public, max-age=0, must-revalidate\n');
console.log('Site pronto: dist/index.html');
