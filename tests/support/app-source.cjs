const fs = require('node:fs');
const path = require('node:path');

function readAppScript() {
  return fs.readFileSync(path.join(__dirname, '../../src/app.js'), 'utf8');
}

module.exports = { readAppScript };
