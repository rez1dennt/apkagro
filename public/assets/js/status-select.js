const controls = new Map();
const motion = matchMedia('(prefers-reduced-motion: reduce)');

function icon(id, className) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('icon', className);
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `/assets/icons-v2.svg#${id}`);
  svg.append(use);
  return svg;
}

function enhance(select) {
  if (controls.has(select)) return;
  const wrapper = document.createElement('div');
  wrapper.className = 'status-select';
  wrapper.dataset.select = select.id;
  select.before(wrapper);
  wrapper.append(select);
  const label = select.labels?.[0];
  const name = select.getAttribute('aria-label') || label?.textContent.trim() || 'Статус';
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.id = `${select.id}-trigger`;
  trigger.className = 'status-select__trigger';
  trigger.setAttribute('role', 'combobox');
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', `${select.id}-options`);
  const value = document.createElement('span');
  value.className = 'status-select__value';
  trigger.append(value, icon('chevron', 'status-select__arrow'));
  if (label) label.htmlFor = trigger.id;

  const panel = document.createElement('div');
  panel.id = `${select.id}-options`;
  panel.className = 'status-select__panel';
  panel.setAttribute('role', 'listbox');
  panel.setAttribute('aria-label', name);
  panel.hidden = true;
  panel.inert = true;
  const options = [...select.options];
  const items = options.map((option, index) => {
    const item = document.createElement('div');
    item.id = `${select.id}-option-${index}`;
    item.className = 'status-select__option';
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', 'false');
    item.dataset.value = option.value;
    const text = document.createElement('span');
    text.textContent = option.textContent;
    item.append(text, icon('check', 'status-select__check'));
    item.addEventListener('pointermove', () => { if (!option.disabled) setActive(index); });
    item.addEventListener('click', () => choose(index));
    panel.append(item);
    return item;
  });
  wrapper.append(trigger, panel);
  select.hidden = true;
  select.setAttribute('aria-hidden', 'true');
  let open = false, active = Math.max(0, select.selectedIndex), timer, prefixTimer, prefix = '';

  function sync() {
    value.textContent = select.selectedOptions[0]?.textContent || '';
    trigger.setAttribute('aria-label', `${name}: ${value.textContent}`);
    trigger.disabled = select.disabled;
    items.forEach((item, index) => {
      item.setAttribute('aria-selected', String(options[index].value === select.value));
      item.setAttribute('aria-disabled', String(options[index].disabled));
    });
  }
  function setActive(index) {
    active = index;
    items.forEach((item, current) => item.classList.toggle('is-active', current === active));
    if (open) {
      const item = items[active];
      trigger.setAttribute('aria-activedescendant', item.id);
      // Scroll only the listbox, keeping the modal and page at their current positions.
      const top = item.offsetTop, bottom = top + item.offsetHeight;
      if (top < panel.scrollTop + 6) panel.scrollTop = Math.max(0, top - 6);
      else if (bottom > panel.scrollTop + panel.clientHeight - 6) panel.scrollTop = bottom - panel.clientHeight + 6;
    }
  }
  function place() {
    const rect = trigger.getBoundingClientRect(), dialog = trigger.closest('dialog');
    const bounds = dialog?.getBoundingClientRect();
    const below = Math.min(innerHeight - 10, bounds ? bounds.bottom - 10 : innerHeight - 10) - rect.bottom - 8;
    const above = rect.top - Math.max(10, bounds ? bounds.top + 10 : 10) - 8;
    const upward = below < 230 && above > below;
    wrapper.dataset.placement = upward ? 'top' : 'bottom';
    panel.style.maxHeight = `${Math.max(48, Math.min(260, upward ? above : below))}px`;
    if (open) setActive(active);
  }
  function show() {
    if (trigger.disabled || open) return;
    for (const control of controls.values()) if (control.select !== select) control.close();
    clearTimeout(timer);
    open = true;
    panel.hidden = false;
    panel.inert = false;
    panel.removeAttribute('aria-hidden');
    place();
    setActive(Math.max(0, select.selectedIndex));
    panel.getBoundingClientRect();
    wrapper.classList.add('is-open');
    trigger.setAttribute('aria-expanded', 'true');
  }
  function close({ restoreFocus = false, immediate = false } = {}) {
    clearTimeout(timer);
    open = false;
    wrapper.classList.remove('is-open');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.removeAttribute('aria-activedescendant');
    panel.inert = true;
    panel.setAttribute('aria-hidden', 'true');
    if (restoreFocus) trigger.focus({ preventScroll: true });
    const duration = immediate || motion.matches ? 0 : Math.max(...getComputedStyle(panel).transitionDuration.split(',').map(time => parseFloat(time) * (time.includes('ms') ? 1 : 1000)));
    if (!duration) panel.hidden = true;
    else timer = setTimeout(() => { if (!open) panel.hidden = true; }, duration + 16);
  }
  function choose(index) {
    if (options[index].disabled) return;
    select.value = options[index].value;
    sync();
    close({ restoreFocus: true });
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function move(direction) {
    let index = active;
    for (let count = 0; count < options.length; count++) {
      index = (index + direction + options.length) % options.length;
      if (!options[index].disabled) { setActive(index); break; }
    }
  }
  trigger.addEventListener('click', () => open ? close() : show());
  trigger.addEventListener('keydown', event => {
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close({ restoreFocus: true }); return; }
    if (event.key === 'Tab') { close(); return; }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      if (!open) show();
      else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') move(event.key === 'ArrowDown' ? 1 : -1);
      if (event.key === 'Home') setActive(0);
      if (event.key === 'End') setActive(options.length - 1);
      return;
    }
    if ((event.key === 'Enter' || event.key === ' ') && open) { event.preventDefault(); choose(active); return; }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey && event.key !== ' ') {
      event.preventDefault();clearTimeout(prefixTimer);prefix += event.key.toLocaleLowerCase('ru');
      const index = options.findIndex(option => !option.disabled && option.textContent.trim().toLocaleLowerCase('ru').startsWith(prefix));
      if (index >= 0) { show();setActive(index); }
      prefixTimer = setTimeout(() => { prefix = ''; }, 650);
    }
  });
  panel.addEventListener('pointerdown', event => event.preventDefault());
  select.addEventListener('change', sync);
  new MutationObserver(sync).observe(select, { attributes: true, attributeFilter: ['disabled'] });
  const control = { select, wrapper, trigger, sync, close, place, get open() { return open; } };
  controls.set(select, control);
  sync();
}

export function enhanceStatusSelects() { document.querySelectorAll('#status-filter, #detail-status').forEach(enhance); }
export function syncStatusSelect(select) { controls.get(select)?.sync(); }
export function closeStatusSelects(options) { for (const control of controls.values()) control.close(options); }
document.addEventListener('pointerdown', event => {
  for (const control of controls.values()) if (control.open && !control.wrapper.contains(event.target)) control.close();
});
window.addEventListener('resize', () => { for (const control of controls.values()) if (control.open) control.place(); });
document.addEventListener('scroll', () => { for (const control of controls.values()) if (control.open) control.place(); }, true);
