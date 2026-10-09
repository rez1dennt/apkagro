import {readFile,writeFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const font='<link rel="preload" as="font" type="font/woff2" href="/assets/fonts/esqadero-regular.woff2" crossorigin>';
const css='<link rel="stylesheet" href="/assets/css/refinement.css">';
const versionAssets=source=>source.replace(/(href|src)="(\/assets\/(?:css|js)\/[^"?]+\.(?:css|js))(?:\?[^\"]*)?"/g,'$1="$2?v=20261009-working"');
for(const file of ['public/index.html','public/admin.html']){
  let source=await readFile(new URL(file,root),'utf8');
  source=source.replaceAll('/assets/icons.svg#','/assets/icons-v2.svg#');
  if(!source.includes('as="font"'))source=source.replace('</head>',font+'</head>');
  if(!source.includes('/assets/css/refinement.css'))source=source.replace('</head>',css+'</head>');
  if(file.endsWith('index.html')){
    const benefitIcons=['sprout','laptop','tractor','support'];let index=0;
    source=source.replace(/<article class="benefit">[\s\S]*?<\/article>/g,article=>article.replace('<span class="circle"></span>',`<svg class="icon benefit-icon" aria-hidden="true"><use href="/assets/icons-v2.svg#${benefitIcons[index++]}"></use></svg>`));
    const category={drone:['drone','Агротехнологии'],flowers:['sprout','Растениеводство'],wine:['grapes','Виноградарство'],bread:['wheat','Пищевые технологии'],cider:['calendar','Управление проектом'],nutrition:['leaf','Пищевые технологии']};
    source=source.replace(/<button class="program-card"[^>]*data-course="([^"]+)"[\s\S]*?<\/button>/g,(card,id)=>{
      if(card.includes('program-category'))return card;
      const [icon,label]=category[id];
      card=card.replace(/(<img[^>]+>)/,`$1<span class="program-category"><svg class="icon" aria-hidden="true"><use href="/assets/icons-v2.svg#${icon}"></use></svg>${label}</span>`);
      return card.replace('</button>','<span class="program-card__footer"><span>Онлайн · 72 часа</span><span>Подробнее <svg class="icon" aria-hidden="true"><use href="/assets/icons-v2.svg#arrow"></use></svg></span></span></button>');
    });
  }
  await writeFile(new URL(file,root),versionAssets(source));
}
let legalBuilder=await readFile(new URL('scripts/build-legals.mjs',root),'utf8');
if(!legalBuilder.includes('/assets/css/refinement.css'))legalBuilder=legalBuilder.replace('<link rel="stylesheet" href="/assets/css/site.css">',`<link rel="stylesheet" href="/assets/css/site.css">${css}${font}`);
await writeFile(new URL('scripts/build-legals.mjs',root),versionAssets(legalBuilder.replaceAll('/assets/icons.svg#','/assets/icons-v2.svg#')));
let adminJs=await readFile(new URL('public/assets/js/admin.js',root),'utf8');await writeFile(new URL('public/assets/js/admin.js',root),adminJs.replaceAll('/assets/icons.svg#','/assets/icons-v2.svg#'));
console.log('Shared refinement stylesheet, local font, detailed icons and course metadata applied.');
