const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { compilePage, buildSite } = require('../preparar-site.cjs');

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
  fs.writeFileSync(path.join(temp, 'src/index.html'), '<html><style>/* __PANEL_STYLES__ */</style><body><script>/* __PANEL_SCRIPT__ */\n/* __ACCESS_SCRIPT__ */\n/* __ML_IMPORT_SCRIPT__ */\n/* __PENDING_COSTS_SCRIPT__ */\n/* __CATALOG_SCRIPT__ */</script></body></html>');
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
  return temp;
}

test('HTML final incorpora integralmente os fontes e abre sem arquivos externos de JS ou CSS', () => {
  const html = compilePage();
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const styles = html.match(/<style>([\s\S]*?)<\/style>/)[1];
  assert.equal(script, ['app.js','panel-access.js','ml-catalog-import.js','pending-costs.js','catalog-sync.js'].map(file=>fs.readFileSync(path.join(root,'src',file),'utf8')).join('\n'));
  assert.equal(styles, fs.readFileSync(path.join(root, 'src/styles.css'), 'utf8'));
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
