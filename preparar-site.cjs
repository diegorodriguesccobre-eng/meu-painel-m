const fs = require('node:fs');
const path = require('node:path');

const SOURCES = [
  { marker: '/* __ML_DATA_RULES__ */', filename: '../shared/ml-data-rules.js' },
  { marker: '/* __PANEL_STYLES__ */', filename: 'styles.css' },
  { marker: '/* __PANEL_SCRIPT__ */', filename: 'app.js' },
  { marker: '/* __ACCESS_SCRIPT__ */', filename: 'panel-access.js' },
  { marker: '/* __ML_IMPORT_SCRIPT__ */', filename: 'ml-catalog-import.js' },
  { marker: '/* __PENDING_COSTS_SCRIPT__ */', filename: 'pending-costs.js' },
  { marker: '/* __CATALOG_SCRIPT__ */', filename: 'catalog-sync.js' },
  { marker: '/* __ML_DATA_POLICY__ */', filename: 'ml-data-policy.js' }
];
const ICONS = ['favicon.svg', 'favicon.png'];
const PAGES = ['termos.html', 'privacidade.html'];
const HEADERS = '/\n  Cache-Control: public, max-age=0, must-revalidate\n/index.html\n  Cache-Control: public, max-age=0, must-revalidate\n';

// Expande somente imports locais, na ordem declarada pelo arquivo de entrada.
// O navegador recebe CSS incorporado ao HTML e continua sem dependências externas.
function compileStyles(rootDir = __dirname, entry = 'styles.css') {
  const sourceDir = path.resolve(rootDir, 'src');
  function readStyles(filename, parents = []) {
    const relative = path.relative(sourceDir, filename);
    if (path.isAbsolute(relative) || relative === '..' || relative.startsWith('..' + path.sep)) {
      throw new Error('O CSS deve permanecer dentro de src.');
    }
    if (parents.includes(filename)) {
      throw new Error(`Importação circular de CSS: ${[...parents, filename].map(file => path.relative(sourceDir, file)).join(' → ')}`);
    }
    const content = fs.readFileSync(filename, 'utf8');
    const expanded = content.replace(/^[\t ]*@import\s+["']([^"']+)["'][\t ]*;[\t ]*\r?$/gm, (_match, imported) => {
      if (!imported.startsWith('.') || !imported.endsWith('.css')) {
        throw new Error('Use somente imports relativos de arquivos .css.');
      }
      return readStyles(path.resolve(path.dirname(filename), imported), [...parents, filename]);
    });
    if (/^\s*@import\b/m.test(expanded)) {
      throw new Error('Import de CSS não suportado: use @import "./arquivo.css"; em uma linha própria.');
    }
    return expanded;
  }
  return readStyles(path.resolve(sourceDir, entry));
}

function compilePage(rootDir = __dirname, page = 'index.html') {
  const sourceDir = path.join(rootDir, 'src');
  let html = fs.readFileSync(path.join(sourceDir, page), 'utf8');
  const sources = page === 'index.html' ? SOURCES : [
    { marker: '/* __DOCUMENT_STYLES__ */', filename: 'css/documentos.css' }
  ];

  for (const { marker, filename } of sources) {
    if (html.split(marker).length !== 2) {
      throw new Error(`O template deve conter exatamente um marcador para ${filename}.`);
    }
    const content = filename.endsWith('.css') ? compileStyles(rootDir, filename) : fs.readFileSync(path.join(sourceDir, filename), 'utf8');
    // A função de substituição preserva sequências como $& presentes no código.
    html = html.replace(marker, () => content);
  }

  return html;
}

function buildSite({ rootDir = __dirname, outputDir = path.join(rootDir, 'dist') } = {}) {
  const html = compilePage(rootDir);
  const pages = PAGES.map(page => ({ page, html: compilePage(rootDir, page) }));
  fs.mkdirSync(outputDir, { recursive: true });

  // A distribuição continua em um único HTML, inclusive para uso offline.
  fs.writeFileSync(path.join(rootDir, 'index.html'), html);
  fs.writeFileSync(path.join(outputDir, 'index.html'), html);
  for (const icon of ICONS) {
    fs.copyFileSync(path.join(rootDir, icon), path.join(outputDir, icon));
  }
  for (const page of pages) fs.writeFileSync(path.join(outputDir, page.page), page.html);
  fs.writeFileSync(path.join(outputDir, '_headers'), HEADERS);
}

if (require.main === module) {
  buildSite();
  console.log('Site pronto: dist/index.html');
}

module.exports = { compileStyles, compilePage, buildSite };
