import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';
import { buildPages, rewritePublicUrls } from '../scripts/build-pages.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

test('Pages rewrites project URLs without changing external URLs or JavaScript regexes', () => {
  const input = '<a href="/privacy/">Privacy</a><a href="/">Home</a>' +
    '<a href="https://example.org/">External</a><a href="//example.org/">Protocol</a>' +
    "const src = `/assets/images/${course.image}.webp`; const valid = /^\\d{6}$/;" +
    "background:url(/assets/logo.svg);font:url('/assets/fonts/a.woff2');";
  const output = rewritePublicUrls(input, '/apkagro/');
  assert.match(output, /href="\/apkagro\/privacy\/"/);
  assert.match(output, /href="\/apkagro\/"/);
  assert.ok(output.includes('`/apkagro/assets/images/${course.image}.webp`'));
  assert.ok(output.includes('url(/apkagro/assets/logo.svg)'));
  assert.ok(output.includes("url('/apkagro/assets/fonts/a.woff2')"));
  assert.ok(output.includes('https://example.org/'));
  assert.ok(output.includes('//example.org/'));
  assert.ok(output.includes('/^\\d{6}$/'));
});

test('Pages built icon renderer retains canonical custom file classes and rebases built-in sprites', async () => {
  const source = await readFile(path.join(root, 'public/assets/js/content-icons.js'), 'utf8');
  const built = rewritePublicUrls(source, '/apkagro/');
  const { renderContentIcon } = await import('data:text/javascript;base64,' + Buffer.from(built).toString('base64'));
  const uuid = '11111111-1111-4111-8111-111111111111';
  const url = '/media/' + uuid + '.webp';
  const document = parseHTML('<html><body><svg class="icon rotate" width="24" style="color:red" aria-hidden="true"></svg></body></html>').document;
  let node = document.querySelector('svg');
  for (const mode of ['text', 'original']) {
    node = renderContentIcon(node, 'custom:' + mode + ':' + url, {
      inlineStyle: false,
      resolveUrl: value => '/private-preview' + value,
    });
    assert.deepEqual([...node.classList].filter(name => name.startsWith('content-icon-file-')), ['content-icon-file-' + uuid]);
    assert.ok(node.classList.contains('content-icon--' + mode));
    assert.ok(node.classList.contains('rotate'));
    assert.equal(node.getAttribute('width'), '24');
    assert.equal(node.style.getPropertyValue('color'), 'red');
    assert.equal(node.getAttribute('aria-hidden'), 'true');
    assert.equal(node.getAttribute('focusable'), 'false');
    assert.equal(node.style.getPropertyValue('--content-icon-url'), '');
    if (mode === 'original') assert.equal(node.querySelector('img').getAttribute('src'), '/private-preview' + url);
  }
  node = renderContentIcon(node, 'leaf');
  assert.equal(node.querySelector('use').getAttribute('href'), '/apkagro/assets/icons-v2.svg#leaf');
  assert.ok(![...node.classList].some(name => name.startsWith('content-icon-file-')));
});

test('Pages artifact contains only the public website with working prefixed routes and closed intake', async () => {
  await mkdir(path.join(root, 'output'), { recursive: true });
  const outputDir = await mkdtemp(path.join(root, 'output', 'pages-test-'));
  const source = await readFile(path.join(root, 'public', 'assets/js/site.js'), 'utf8');
  try {
    await buildPages({ outputDir, basePath: '/apkagro/' });
    const main = await readFile(path.join(outputDir, 'index.html'), 'utf8');
    assert.match(main, /id="programs"/);
    assert.equal((main.match(/class="program-card"/g) || []).length, 7);
    assert.match(main, /href="\/apkagro\/privacy\//);
    assert.match(main, /src="\/apkagro\/assets\/js\/site.js/);
    for (const route of ['privacy', 'consent', 'operator', 'admin']) {
      const html = await readFile(path.join(outputDir, route, 'index.html'), 'utf8');
      assert.match(html, /<html lang="ru">/);
      assert.match(html, /href="\/apkagro\/assets\/css\//);
    }
    const config = JSON.parse(await readFile(path.join(outputDir, 'assets/pages-config.json'), 'utf8'));
    assert.equal(config.enabled, false);
    const site = await readFile(path.join(outputDir, 'assets/js/site.js'), 'utf8');
    assert.match(site, /\/apkagro\/assets\/pages-config.json/);
    const bootstrap=await readFile(path.join(outputDir,'assets/js/site-content.js'),'utf8');
    assert.ok(bootstrap.includes('`/apkagro/assets/images/${p.image}.webp`'));
    assert.match(main,/href="\/apkagro\/assets\/content\/theme.css"/);
    assert.ok((await stat(path.join(outputDir,'assets/content/theme.css'))).size>100);
    assert.ok(site.includes('Предпросмотр дизайна'));
    assert.ok(!site.includes('/api/'));
    const admin = await readFile(path.join(outputDir, 'assets/js/admin.js'), 'utf8');
    assert.ok(admin.includes('preventDefault'));
    assert.ok(!admin.includes('fetch('));
    assert.ok(!admin.includes('/api/'));
    for (const document of ['consent.pdf', 'consent.docx', 'privacy-policy.pdf', 'license-extract.pdf']) {
      assert.ok((await stat(path.join(outputDir, 'documents', document))).size > 100);
    }
    assert.ok((await stat(path.join(outputDir, '.nojekyll'))).isFile());
    const topLevel = await readdir(outputDir);
    for (const forbidden of ['README.md', '.env', '.git', 'data', 'server', 'private-access']) {
      assert.ok(!topLevel.includes(forbidden), `${forbidden} must not be published`);
    }
    assert.equal(await readFile(path.join(root, 'public/assets/js/site.js'), 'utf8'), source);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test('Pages builder rejects invalid prefixes and output locations before touching files', async () => {
  await assert.rejects(buildPages({ basePath: '//another-host/' }), /base path/i);
  await assert.rejects(buildPages({ basePath: '/../../' }), /base path/i);
  await assert.rejects(buildPages({ outputDir: path.join(root, 'public') }), /output/i);
  await assert.rejects(buildPages({ outputDir: path.join(root, 'output') }), /output/i);
});
