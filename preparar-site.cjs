const fs = require('node:fs');
const path = require('node:path');

const SOURCES = [
  { marker: '/* __PANEL_STYLES__ */', filename: 'styles.css' },
  { marker: '/* __PANEL_SCRIPT__ */', filename: 'app.js' },
  { marker: '/* __CATALOG_SCRIPT__ */', filename: 'catalog-sync.js' }
];
const ICONS = ['favicon.svg', 'favicon.png'];
const HEADERS = '/\n  Cache-Control: public, max-age=0, must-revalidate\n/index.html\n  Cache-Control: public, max-age=0, must-revalidate\n';

function compilePage(rootDir = __dirname) {
  const sourceDir = path.join(rootDir, 'src');
  let html = fs.readFileSync(path.join(sourceDir, 'index.html'), 'utf8');

  for (const { marker, filename } of SOURCES) {
    if (html.split(marker).length !== 2) {
      throw new Error(`O template deve conter exatamente um marcador para ${filename}.`);
    }
    const content = fs.readFileSync(path.join(sourceDir, filename), 'utf8');
    // A função de substituição preserva sequências como $& presentes no código.
    html = html.replace(marker, () => content);
  }

  return html;
}

function buildSite({ rootDir = __dirname, outputDir = path.join(rootDir, 'dist') } = {}) {
  const html = compilePage(rootDir);
  fs.mkdirSync(outputDir, { recursive: true });

  // A distribuição continua em um único HTML, inclusive para uso offline.
  fs.writeFileSync(path.join(rootDir, 'index.html'), html);
  fs.writeFileSync(path.join(outputDir, 'index.html'), html);
  for (const icon of ICONS) {
    fs.copyFileSync(path.join(rootDir, icon), path.join(outputDir, icon));
  }
  fs.writeFileSync(path.join(outputDir, '_headers'), HEADERS);
}

if (require.main === module) {
  buildSite();
  console.log('Site pronto: dist/index.html');
}

module.exports = { compilePage, buildSite };
