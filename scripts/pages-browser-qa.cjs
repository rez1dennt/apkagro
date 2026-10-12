const { createServer } = require('node:http');
const { readFile, stat, mkdir, writeFile } = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));

const root = path.resolve(__dirname, '..');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2', '.pdf': 'application/pdf', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };

(async () => {
  let server, browser;
  const errors = [], broken = [], apiRequests = [], textIssues = [];
  let checks = 0;
  const check = (value, label) => { assert.ok(value, label); checks++; };
  try {
    let base = process.env.PAGES_PREVIEW_URL;
    if (!base) {
      const { buildPages } = await import('./build-pages.mjs');
      const build = await buildPages();
      server = createServer(async (request, response) => {
        try {
          const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
          if (!pathname.startsWith(build.basePath)) { response.writeHead(404).end(); return; }
          let file = path.resolve(build.outputDir, pathname.slice(build.basePath.length));
          const relative = path.relative(build.outputDir, file);
          if (relative.startsWith('..') || path.isAbsolute(relative)) { response.writeHead(404).end(); return; }
          if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
          response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
          response.end(await readFile(file));
        } catch { response.writeHead(404).end(); }
      });
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
      base = `http://127.0.0.1:${server.address().port}${build.basePath}`;
    }
    if (!base.endsWith('/')) base += '/';
    const prefix = new URL(base).pathname;
    const { courses } = await import('../public/assets/js/courses.js');
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_EXECUTABLE || path.join(os.homedir(), 'AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe'), headless: true });
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('response', response => { if (response.status() >= 400) broken.push(`${response.status()} ${response.url()}`); });
    page.on('request', request => { if (/\/api\//.test(new URL(request.url()).pathname)) apiRequests.push(request.url()); });
    const output = path.join(root, 'output/qa/pages');
    await mkdir(output, { recursive: true });
    for (const width of [1440, 768, 360, 320]) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of ['', 'privacy/', 'consent/', 'operator/', 'admin/']) {
        const response = await page.goto(base + route, { waitUntil: 'networkidle' });
        check(response.status() === 200, `${route || 'home'} opens at ${width}`);
        check(await page.locator('h1').count() === 1, `${route} heading ${width}`);
        check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route} no overflow ${width}`);
        check(await page.evaluate(async () => {
          const images = [...document.images].filter(image => !image.closest('dialog'));
          for (const image of images) image.loading = 'eager';
          await Promise.all(images.map(image => image.decode().catch(() => {})));
          return images.every(image => image.complete && image.naturalWidth > 0);
        }), `${route} images loaded ${width}`);
        if (route === 'admin/') {
          check((await page.locator('.admin-subtitle').textContent()).includes('предпросмотр'), `admin preview explicit ${width}`);
          await page.locator('#admin-login-form').evaluate(form => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
          check((await page.locator('#login-error').textContent()).includes('после подключения сервера'), `admin never authenticates ${width}`);
          check(await page.locator('#dashboard-screen').isHidden(), `no fake dashboard ${width}`);
        } else {
          check(await page.locator('.header').isVisible(), `${route} stylesheet/header ${width}`);
          if (await page.locator('#cookie-banner').isVisible()) await page.locator('#cookie-acknowledge').click();
          const footerName = await page.locator('.footer__organization > div > p').first().innerText();
          if (/[„“]/.test(footerName) || (footerName.match(/«/g) || []).length !== 1 || (footerName.match(/»/g) || []).length !== 1) {
            textIssues.push(`${route || 'home'}/${width}: footer must show one balanced pair of quotes: ${footerName}`);
          } else checks++;
        }
      }
      await page.goto(base, { waitUntil: 'networkidle' });
      check(await page.locator('.program-card').count() === 7, `all seven courses ${width}`);
      const copy = {
        '.hero__description': 'Бесплатное повышение квалификации для специалистов АПК по актуальным направлениям развития отрасли.',
        '#application-title': 'Оставьте заявку на обучение',
        '.closing h2': 'Подайте заявку на обучение в рамках проекта «Кадры в АПК»',
        '#steps-title': 'Как поступить на обучение',
        '.faq-contact h3': 'Есть другие вопросы?'
      };
      for (const [selector, expected] of Object.entries(copy)) {
        const actual = (await page.locator(selector).innerText()).replace(/\s+/g, ' ').trim();
        if (actual !== expected) textIssues.push(`${selector}/${width}: expected "${expected}"; got "${actual}"`);
        else checks++;
      }
      const wineCopy = (await page.locator('.program-card[data-course="wine"] .program-card__body').innerText()).replace(/\s+/g, ' ');
      if (!wineCopy.includes('виноделия и виноторговли')) textIssues.push(`wine/${width}: joined words in ${wineCopy}`);
      else checks++;
      if (width === 360) {
        await page.locator('.hero__copy').screenshot({ path: path.join(output, 'hero-copy-360.png') });
        await page.locator('.application__intro').screenshot({ path: path.join(output, 'application-copy-360.png') });
        await page.locator('.closing').screenshot({ path: path.join(output, 'closing-copy-360.png') });
        await page.locator('.footer__organization').screenshot({ path: path.join(output, 'footer-copy-360.png') });
      }
      check((await page.locator('#form-status').textContent()).includes('Предпросмотр дизайна'), `intake preview explicit ${width}`);
      await page.locator('#application-form').evaluate(form => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
      check(await page.locator('#application-success').isHidden(), `no fake successful intake ${width}`);
      if (width <= 768 && await page.locator('.menu-toggle').isVisible()) {
        await page.locator('.menu-toggle').click();
        check(await page.locator('.menu-toggle').getAttribute('aria-expanded') === 'true', `menu opens ${width}`);
        await page.keyboard.press('Escape');
        check(await page.locator('.menu-toggle').getAttribute('aria-expanded') === 'false', `menu closes ${width}`);
      }
      for (const [id, course] of Object.entries(courses)) {
        await page.locator(`.program-card[data-course="${id}"]`).click();
        await page.locator('#course-dialog[open]').waitFor();
        check(await page.locator('#dialog-title').textContent() === course.title, `${id} correct title ${width}`);
        check(await page.locator('#dialog-image').evaluate(async image => { await image.decode(); return image.complete && image.naturalWidth > 0; }), `${id} prefixed modal image loads ${width}`);
        check((await page.locator('#dialog-image').getAttribute('src')).startsWith(prefix), `${id} image prefix ${width}`);
        check(await page.locator('#course-dialog').evaluate(dialog => dialog.scrollWidth <= dialog.clientWidth), `${id} no modal overflow ${width}`);
        if (width === 1440 && id === 'drone') await page.locator('#course-dialog').screenshot({ path: path.join(output, 'drone-modal.png') });
        await page.keyboard.press('Escape');
        await page.locator('#course-dialog').waitFor({ state: 'hidden' });
      }
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `home no overflow ${width}`);
      if ([1440, 320].includes(width)) await page.screenshot({ path: path.join(output, `home-${width}.png`), fullPage: true });
    }
    for (const document of ['consent.pdf', 'consent.docx', 'privacy-policy.pdf', 'license-extract.pdf']) {
      const response = await context.request.get(base + 'documents/' + document);
      check(response.ok() && (await response.body()).length > 100, `${document} public download`);
    }
    check(errors.length === 0, `browser errors: ${JSON.stringify(errors)}`);
    check(broken.length === 0, `broken requests: ${JSON.stringify(broken)}`);
    check(apiRequests.length === 0, `no server API requests: ${JSON.stringify(apiRequests)}`);
    check(textIssues.length === 0, `responsive text regressions:\n${textIssues.join('\n')}`);
    await writeFile(path.join(output, 'report.json'), JSON.stringify({ base, checks, errors, broken, apiRequests }, null, 2));
    console.log(`${checks} GitHub Pages route/asset/modal/mobile/preview checks passed: ${base}`);
  } finally {
    if (browser) await browser.close();
    if (server) await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
