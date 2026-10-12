import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
    assert.ok(site.includes('`/apkagro/assets/images/${course.image}.webp`'));
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
