// Canonical values are shared by server validation, editor and public rendering.
const mediaPattern = /^\/media\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$/;

export function parseCustomIcon(value) {
 if (typeof value !== 'string') return null;
 const match = value.match(/^custom:(text|original):(.*)$/);
 return match && mediaPattern.test(match[2]) ? {url: match[2], mode: match[1]} : null;
}

export function customIconValue(url, mode = 'text') {
 if (!mediaPattern.test(url) || !['text', 'original'].includes(mode)) {
  throw new TypeError('Некорректная собственная иконка.');
 }
 return 'custom:' + mode + ':' + url;
}

// Keep the original wrapper's classes, dimensions and transforms. Only raster
// images enter the custom branch. SSR uses external theme CSS under strict CSP;
// the editor may set a DOM style property using its authenticated raster route.
export function renderContentIcon(wrapper, value, {resolveUrl = url => url, inlineStyle = true} = {}) {
 if (!wrapper) return null;
 if (wrapper.localName === 'use') wrapper = wrapper.parentNode;
 const document = wrapper.ownerDocument;
 const custom = parseCustomIcon(value);
 const node = custom ? document.createElement('span') : document.createElementNS('http://www.w3.org/2000/svg', 'svg');
 for (const attr of wrapper.attributes) {
  if (!['data-custom-icon', 'style'].includes(attr.name)) node.setAttribute(attr.name, attr.value);
 }
 // Setting the style attribute reparses inline CSS and is blocked by style-src 'self'.
 // Copy individual DOM properties instead, preserving presentation and priorities.
 for (const property of Array.from(wrapper.style)) {
  const priority = typeof wrapper.style.getPropertyPriority === 'function' ? wrapper.style.getPropertyPriority(property) : '';
  node.style.setProperty(property, wrapper.style.getPropertyValue(property), priority);
 }
 node.setAttribute('aria-hidden', 'true');
 node.setAttribute('focusable', 'false');
 for (const name of [...node.classList]) {
  if (name.startsWith('content-icon-file-')) node.classList.remove(name);
 }
 node.classList.remove('content-icon', 'content-icon--text', 'content-icon--original');
 node.style.removeProperty('--content-icon-url');
 if (custom) {
  const fileClass = 'content-icon-file-' + custom.url.split('/').at(-1).slice(0, -5);
  node.classList.add('content-icon', 'content-icon--' + custom.mode, fileClass);
  const url = resolveUrl(custom.url);
  if (custom.mode === 'text' && inlineStyle) {
   node.style.setProperty('--content-icon-url', 'url("' + url + '")');
  } else if (custom.mode === 'original') {
   const image = document.createElement('img');
   image.src = url;
   image.alt = '';
   image.setAttribute('aria-hidden', 'true');
   node.append(image);
  }
 } else {
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', '/assets/icons-v2.svg#' + value);
  node.append(use);
 }
 wrapper.replaceWith(node);
 return node;
}
