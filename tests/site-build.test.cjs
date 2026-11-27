const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { compileStyles, compilePage, buildSite } = require('../preparar-site.cjs');

const root = path.join(__dirname, '..');

function fixture(t) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'conduz-site-build-'));
  t.after(() => {
    const relative = path.relative(os.tmpdir(), temp);
    assert.ok(relative.startsWith('conduz-site-build-') && !path.isAbsolute(relative));
    assert.ok(!relative.split(path.sep).includes('..'));
    fs.rmSync(temp, { recursive: true, force: true });
  });
  fs.mkdirSync(path.join(temp, 'src'));
  fs.mkdirSync(path.join(temp, 'src/css'));
  fs.mkdirSync(path.join(temp, 'shared'));
  fs.writeFileSync(path.join(temp,'shared/ml-data-rules.js'),'globalThis.rules = true;');
  fs.writeFileSync(path.join(temp,'src/ml-data-policy.js'),'globalThis.policy = true;');
  fs.writeFileSync(path.join(temp, 'src/index.html'), '<html><style>/* __PANEL_STYLES__ */</style><body><script>/* __ML_DATA_RULES__ */\n/* __PANEL_SCRIPT__ */\n/* __ACCESS_SCRIPT__ */\n/* __ML_IMPORT_SCRIPT__ */\n/* __PENDING_COSTS_SCRIPT__ */\n/* __CATALOG_SCRIPT__ */\n/* __ML_DATA_POLICY__ */</script></body></html>');
  fs.writeFileSync(path.join(temp, 'src/styles.css'), 'body { color: #abcdef; }');
  fs.writeFileSync(path.join(temp, 'src/app.js'), 'globalThis.value = "$& precificação";');
  fs.writeFileSync(path.join(temp, 'src/panel-access.js'), 'globalThis.access = true;');
  fs.writeFileSync(path.join(temp, 'src/ml-catalog-import.js'), 'globalThis.importReview = true;');
  fs.writeFileSync(path.join(temp, 'src/pending-costs.js'), 'globalThis.pendingCosts = true;');
  fs.writeFileSync(path.join(temp, 'src/catalog-sync.js'), 'globalThis.sharing = true;');
  for (const filename of ['favicon.svg', 'favicon.png']) {
    fs.copyFileSync(path.join(root, filename), path.join(temp, filename));
  }
  for (const filename of ['termos.html', 'privacidade.html']) fs.copyFileSync(path.join(root, 'src', filename), path.join(temp, 'src', filename));
  fs.copyFileSync(path.join(root, 'src/css/documentos.css'), path.join(temp, 'src/css/documentos.css'));
  return temp;
}

test('HTML final incorpora integralmente os fontes e abre sem arquivos externos de JS ou CSS', () => {
  const html = compilePage();
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const styles = html.match(/<style>([\s\S]*?)<\/style>/)[1];
  assert.equal(script, ['../shared/ml-data-rules.js','app.js','panel-access.js','ml-catalog-import.js','pending-costs.js','catalog-sync.js','ml-data-policy.js'].map(file=>fs.readFileSync(path.join(root,'src',file),'utf8')).join('\n'));
  assert.equal(styles, compileStyles());
  assert.doesNotMatch(styles, /@import\b/);
  assert.doesNotMatch(html, /<script\b[^>]*\bsrc\s*=/i);
  assert.doesNotMatch(html, /<link\b[^>]*\brel\s*=\s*["']stylesheet["']/i);
  assert.doesNotThrow(() => new vm.Script(script));
});

test('build gera o mesmo HTML portátil na raiz e na publicação, sem publicar fontes ou testes', t => {
  const temp = fixture(t);
  buildSite({ rootDir: temp });
  const standalone = fs.readFileSync(path.join(temp, 'index.html'), 'utf8');
  assert.equal(standalone, fs.readFileSync(path.join(temp, 'dist/index.html'), 'utf8'));
  assert.deepEqual(fs.readdirSync(path.join(temp, 'dist')).sort(), ['_headers', 'favicon.png', 'favicon.svg', 'index.html', 'privacidade.html', 'termos.html']);
  assert.ok(standalone.includes('$& precificação'));
  const script = standalone.match(/<script>([\s\S]*?)<\/script>/)[1];
  const context = vm.createContext({});
  vm.runInContext(script, context);
  assert.equal(context.value, '$& precificação');
  for (const page of ['termos.html', 'privacidade.html']) {
    const legal = fs.readFileSync(path.join(temp, 'dist', page), 'utf8');
    assert.ok(legal.includes(compileStyles(temp, 'css/documentos.css')));
    assert.doesNotMatch(legal, /__DOCUMENT_STYLES__|@import\b/);
  }
});

test('módulos CSS locais e aninhados mantêm a ordem da cascata no HTML portátil', t => {
  const temp = fixture(t);
  fs.writeFileSync(path.join(temp, 'src/styles.css'), '@import "./css/base.css";\n@import "./css/tela.css";');
  fs.writeFileSync(path.join(temp, 'src/css/base.css'), 'body { color: red; }\n@import "./componente.css";');
  fs.writeFileSync(path.join(temp, 'src/css/componente.css'), '.btn::after { content: "$&"; }');
  fs.writeFileSync(path.join(temp, 'src/css/tela.css'), '@media (max-width: 650px) { body { color: blue; } }');
  const html = compilePage(temp);
  assert.ok(html.indexOf('color: red') < html.indexOf('content: "$&"'));
  assert.ok(html.indexOf('content: "$&"') < html.indexOf('color: blue'));
  assert.doesNotMatch(html, /@import\b/);
});

test('imports CSS circulares ou fora dos fontes falham sem sobrescrever a versão utilizável', t => {
  const temp = fixture(t);
  buildSite({ rootDir: temp });
  const previous = fs.readFileSync(path.join(temp, 'index.html'), 'utf8');
  fs.writeFileSync(path.join(temp, 'src/styles.css'), '@import "./css/ciclo.css";');
  fs.writeFileSync(path.join(temp, 'src/css/ciclo.css'), '@import "../styles.css";');
  assert.throws(() => buildSite({ rootDir: temp }), /circular/);
  assert.equal(fs.readFileSync(path.join(temp, 'index.html'), 'utf8'), previous);
  fs.writeFileSync(path.join(temp, 'src/styles.css'), '@import "../fora.css";');
  assert.throws(() => buildSite({ rootDir: temp }), /dentro de src/);
  assert.equal(fs.readFileSync(path.join(temp, 'index.html'), 'utf8'), previous);
});

test('template com marcador ausente ou duplicado falha antes de sobrescrever a versão utilizável', t => {
  const temp = fixture(t);
  buildSite({ rootDir: temp });
  const previous = fs.readFileSync(path.join(temp, 'index.html'), 'utf8');
  for (const template of ['<html>Sem marcadores</html>', '/* __PANEL_STYLES__ */ /* __PANEL_STYLES__ */ /* __PANEL_SCRIPT__ */']) {
    fs.writeFileSync(path.join(temp, 'src/index.html'), template);
    assert.throws(() => buildSite({ rootDir: temp }), /exatamente um marcador/);
    assert.equal(fs.readFileSync(path.join(temp, 'index.html'), 'utf8'), previous);
  }
});
