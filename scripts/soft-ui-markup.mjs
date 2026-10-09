import { readFile, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const cookie = `<aside class="cookie-notice" id="cookie-banner" role="region" aria-labelledby="cookie-title" hidden inert>
    <button class="cookie-notice__close" id="cookie-dismiss" type="button" aria-label="Закрыть уведомление о cookie"><svg class="icon" aria-hidden="true"><use href="/assets/icons-v2.svg#close"></use></svg></button>
    <div class="cookie-notice__heading"><svg class="icon" aria-hidden="true"><use href="/assets/icons-v2.svg#lock"></use></svg><h2 id="cookie-title">Технические cookie</h2></div>
    <p>Технические cookie нужны для формы и защищённого входа. Аналитика и рекламные cookie не подключены.</p>
    <div class="cookie-notice__actions"><button class="button button--green" id="cookie-acknowledge" type="button">Понятно</button><a class="cookie-notice__policy" href="/privacy/#cookies">Подробнее о cookie</a></div>
  </aside>`;
const css = '<link rel="stylesheet" href="/assets/css/soft-ui.css?v=20261009-working">';
const version = source => source.replaceAll('20261009-working', '20261009-working');
let main = await readFile(new URL('public/index.html', root), 'utf8');
main = main.replace(/<a class="ministry(?: ministry--footer)?"[^>]*>[\s\S]*?<\/a>/g, '');
if (!main.includes('/assets/css/soft-ui.css')) main = main.replace('</head>', `${css}</head>`);
if (!main.includes('data-cookie-open')) main = main.replace('<a href="/operator/">Сведения об операторе</a>', '<a href="/operator/">Сведения об операторе</a><button class="footer__cookie" type="button" data-cookie-open>Cookie</button>');
if (!main.includes('id="cookie-banner"')) main = main.replace('  <noscript>', `  ${cookie}\n  <noscript>`);
else main = main.replace(/<aside class="cookie-notice"[\s\S]*?<\/aside>/, cookie);
await writeFile(new URL('public/index.html', root), version(main));
let builder = await readFile(new URL('scripts/build-legals.mjs', root), 'utf8');
if (!builder.includes('const cookie =')) builder = builder.replace('const downloads =', 'const cookie = base.match(/<aside class="cookie-notice"[\\s\\S]*?<\\/aside>/)[0];\nconst downloads =');
builder = builder.replace('${footer}${notice}</body>', '${footer}${notice}${cookie}</body>');
if (!builder.includes('/assets/css/soft-ui.css')) builder = builder.replace('<link rel="preload" as="font"', `${css}<link rel="preload" as="font"`);
builder = builder.replace('<h2>9. Технические файлы', '<h2 id="cookies">9. Технические файлы');
// Add the notice-storage explanation beside the existing technical-cookie description.
if (!builder.includes('Выбор по cookie-плашке')) builder = builder.replace('<p>Новая редакция публикуется', '<p>Выбор по cookie-плашке сохраняется в локальном хранилище вашего браузера на 180 дней: версия уведомления и время подтверждения. Эти сведения не содержат данные заявки и не отправляются оператору. Уведомление можно повторно открыть кнопкой «Cookie» в подвале. Подтверждение уведомления не заменяет отдельное согласие на обработку персональных данных.</p><p>Новая редакция публикуется');
await writeFile(new URL('scripts/build-legals.mjs', root), version(builder));
let site = await readFile(new URL('public/assets/js/site.js', root), 'utf8');
if (!site.includes("import './cookie-notice.js")) site = `import './cookie-notice.js?v=20261009-working';\n${site}`;
await writeFile(new URL('public/assets/js/site.js', root), site);
let refinement = await readFile(new URL('scripts/refine-markup.mjs', root), 'utf8');
await writeFile(new URL('scripts/refine-markup.mjs', root), version(refinement));
console.log('Soft UI styles, shared cookie notice and APK-only branding applied.');
