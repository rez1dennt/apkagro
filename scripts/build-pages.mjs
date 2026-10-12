import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CONSENT_VERSION } from '../public/assets/js/organization.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const sourceDir = path.join(root, 'public');
const outputRoot = path.join(root, 'output');
const previewMessage = 'Предпросмотр дизайна. Отправка заявок будет доступна после подключения сервера.';

function normalizeBasePath(value) {
  const base = value.endsWith('/') ? value : `${value}/`;
  if (!/^\/(?:[a-zA-Z0-9._-]+\/)*$/.test(base) || base.split('/').some(part => part === '.' || part === '..')) {
    throw new Error('Invalid Pages base path');
  }
  return base;
}

export function rewritePublicUrls(text, basePath) {
  const base = normalizeBasePath(basePath);
  // Match URL strings, including template literals; leave regex literals and external links alone.
  return text
    .replace(/(["'`])\/(?=(?:assets|documents|privacy|consent|operator|admin|api)(?:[/.?#]|$)|[?#]|["'`])/g, `$1${base}`)
    .replace(/(url\(\s*)\/(?=assets\/)/g, `$1${base}`);
}

function replaceOnce(text, before, after) {
  if (text.split(before).length !== 2) throw new Error(`Pages source contract changed: ${before}`);
  return text.replace(before, after);
}

function previewSiteScript(text) {
  text = replaceOnce(text, "fetch('/api/config'", "fetch('/assets/pages-config.json'");
  text = replaceOnce(text,
    'Приём заявок пока закрыт. Данные и документы не отправляются. Вопросы: sacracorona@yandex.ru.',
    previewMessage);
  // The design artifact contains no application POST handler or server endpoints.
  const start = text.indexOf("form?.addEventListener('submit', async event => {");
  const end = text.indexOf("document.querySelector('#new-application')", start);
  if (start < 0 || end < 0) throw new Error('Pages application handler source contract changed');
  return text.slice(0, start) +
    `form?.addEventListener('submit', event => {\n  event.preventDefault();\n  showStatus('${previewMessage}');\n});\n` + text.slice(end);
}

const previewAdminScript = `const form = document.querySelector('#admin-login-form');
const message = 'Это предпросмотр оформления кабинета. Вход и работа с заявками будут доступны после подключения сервера.';
document.querySelector('.admin-subtitle').textContent = message;
form?.addEventListener('submit', event => {
  event.preventDefault();
  const status = document.querySelector('#login-error');
  status.textContent = message;
  status.hidden = false;
});
`;

async function publicFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error('Public assets must not contain symbolic links');
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await publicFiles(target));
    else if (entry.isFile()) files.push(target);
  }
  return files;
}

export async function buildPages({
  basePath = process.env.PAGES_BASE_PATH || '/apkagro/',
  outputDir = path.join(outputRoot, 'github-pages')
} = {}) {
  const base = normalizeBasePath(basePath);
  const target = path.resolve(outputDir);
  const relative = path.relative(outputRoot, target);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('Pages output must be a child directory of workspace output/');
  }
  const files = await publicFiles(sourceDir);
  // Only this verified output child is replaced; private files and source code are never copied.
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  for (const file of files) {
    const name = path.relative(sourceDir, file).split(path.sep).join('/');
    let content = await readFile(file);
    if (/\.(?:html|css|js)$/.test(name)) {
      let text = content.toString('utf8');
      if (name === 'assets/js/site.js') text = previewSiteScript(text);
      if (name === 'assets/js/admin.js') text = previewAdminScript;
      content = rewritePublicUrls(text, base);
    }
    const destination = path.join(target, name);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, content);
  }
  await mkdir(path.join(target, 'admin'), { recursive: true });
  await writeFile(path.join(target, 'admin/index.html'), await readFile(path.join(target, 'admin.html')));
  await writeFile(path.join(target, 'assets/pages-config.json'), JSON.stringify({ enabled: false, consentVersion: CONSENT_VERSION }) + '\n');
  await writeFile(path.join(target, '.nojekyll'), '');
  return { outputDir: target, basePath: base, publicFiles: files.length };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const result = await buildPages();
  console.log(`GitHub Pages design preview: ${result.publicFiles} public files, base ${result.basePath}, output ${result.outputDir}`);
}
