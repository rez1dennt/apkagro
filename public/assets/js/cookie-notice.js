// This notice describes essential cookies; it never changes the application's PD consent.
const banner = document.querySelector('#cookie-banner');
if (banner) {
  const key = 'apk:cookie-notice:v1';
  const maxAge = 180 * 24 * 60 * 60 * 1000;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let timer;
  let opener;
  let acknowledged = false;
  try {
    const stored = JSON.parse(localStorage.getItem(key));
    acknowledged = stored?.version === 1 && Date.now() - stored.time >= 0 && Date.now() - stored.time < maxAge;
  } catch { /* The notice also works if browser storage is unavailable. */ }

  function show(trigger) {
    clearTimeout(timer);
    opener = trigger || null;
    banner.hidden = false;
    banner.inert = false;
    banner.removeAttribute('aria-hidden');
    // Paint the initial state before applying the opening transition.
    banner.getBoundingClientRect();
    banner.classList.add('is-visible');
    if (opener) banner.querySelector('#cookie-acknowledge').focus({ preventScroll: true });
  }
  function close() {
    clearTimeout(timer);
    acknowledged = true;
    try { localStorage.setItem(key, JSON.stringify({ version: 1, time: Date.now() })); } catch { /* No storage is required to dismiss. */ }
    banner.classList.remove('is-visible');
    banner.inert = true;
    banner.setAttribute('aria-hidden', 'true');
    if (opener?.isConnected) opener.focus({ preventScroll: true });
    timer = setTimeout(() => { banner.hidden = true; }, motion.matches ? 0 : 220);
  }
  banner.querySelector('#cookie-acknowledge').addEventListener('click', close);
  banner.querySelector('#cookie-dismiss').addEventListener('click', close);
  banner.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); close(); }
  });
  document.querySelectorAll('[data-cookie-open]').forEach(button => button.addEventListener('click', () => show(button)));
  const menu = document.querySelector('.menu-toggle');
  if (menu) new MutationObserver(() => {
    banner.inert = !banner.classList.contains('is-visible') || menu.getAttribute('aria-expanded') === 'true';
  }).observe(menu, { attributes: true, attributeFilter: ['aria-expanded'] });
  if (!acknowledged) show();
}
