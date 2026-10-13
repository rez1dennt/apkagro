// Measure the fixed header and photo badges independently of the chosen layout mode.
export function wrapCaption(node,className) {
  if(!node||node.querySelector(':scope > .'+className))return;
  const caption=node.ownerDocument.createElement('span');caption.className=className;
  const text=[...node.childNodes].filter(n=>n.nodeType===3);
  if(!text.length)return;node.insertBefore(caption,text[0]);for(const n of text)caption.append(n);
}
export function initResponsiveContent({onHeaderModeChange=()=>{}}={}) {
  const header=document.querySelector('.header'),inner=header?.querySelector('.header__inner'),nav=header?.querySelector('.nav'),cta=header?.querySelector('.header__cta');
  wrapCaption(cta,'header__caption');
  if(cta)cta.setAttribute('aria-label',cta.textContent.trim());
  const cards=[...document.querySelectorAll('.program-card')];
  for(const card of cards)wrapCaption(card.querySelector('.program-category'),'program-category__caption');
  let frame=0,previousMode;
  function measure() {
    frame=0;
    if(inner&&nav){
      // A detached visual probe always uses desktop styles, so hiding nav cannot change its measured demand.
      const probe=nav.cloneNode(true);probe.classList.add('nav-fit-probe');probe.setAttribute('aria-hidden','true');probe.inert=true;inner.append(probe);
      const controls=[...inner.children].filter(n=>n!==nav&&n!==probe&&!n.classList.contains('menu-toggle')&&getComputedStyle(n).display!=='none');
      const gap=parseFloat(getComputedStyle(inner).columnGap)||0;
      const required=probe.getBoundingClientRect().width+controls.reduce((sum,n)=>sum+n.getBoundingClientRect().width,0)+gap*controls.length;
      probe.remove();
      const compact=innerWidth<960||required>inner.clientWidth+1;
      header.classList.toggle('header--compact',compact);
      if(compact!==previousMode){previousMode=compact;onHeaderModeChange(compact);}
    }
    for(const card of cards){
      const photo=card.querySelector('.program-card__photo'),category=card.querySelector('.program-category');if(!photo||!category)continue;
      const probe=category.cloneNode(true);probe.classList.remove('program-category--flow');probe.classList.add('category-fit-probe');probe.setAttribute('aria-hidden','true');photo.append(probe);
      const flow=probe.getBoundingClientRect().height>Math.min(48,photo.getBoundingClientRect().height*.3);
      probe.remove();category.classList.toggle('program-category--flow',flow);
      if(flow){if(category.parentElement!==card)photo.after(category);}else if(category.parentElement!==photo)photo.append(category);
    }
  }
  function schedule(){if(!frame)frame=requestAnimationFrame(measure);}
  measure();window.addEventListener('resize',schedule);
  document.fonts?.ready.then(schedule);
  const observer=new ResizeObserver(schedule);if(inner)observer.observe(inner);
  for(const card of cards)observer.observe(card.querySelector('.program-card__photo'));
  return ()=>{cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('resize',schedule);};
}
