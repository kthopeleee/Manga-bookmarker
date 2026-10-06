// Work done inside the current tab: reading the series page, fetching its cover, and showing a
// small notice. Used by the popup and by the right-click quick save in the background script.
import { ext } from './ext.js';
import { bytesToBase64 } from '../shared/github-store.js';
import { makeThumbnail } from '../shared/image.js';

// Injected into the page in this order; content/scrape.js defines MB_SCRAPE().
const PAGE_SCRIPTS = [
  'adapters/_util.js',
  'adapters/mangago.js',
  'adapters/comix.js',
  'adapters/mangadex.js',
  'adapters/novelupdates.js',
  'adapters/asura.js',
  'adapters/wp-manga.js',
  'adapters/generic.js',
  'content/scrape.js',
];

export async function scrapeTab(tabId) {
  await ext.scripting.executeScript({ target: { tabId }, files: PAGE_SCRIPTS });
  const [res] = await ext.scripting.executeScript({
    target: { tabId },
    func: () => globalThis.MB_SCRAPE(),
  });
  return res && res.result;
}

// Download the cover and shrink it. Tries from the extension first, then from inside the page
// (which works for images on the same site as the page).
export async function prepareCover(tabId, url) {
  if (!url) return null;
  let blob = null;
  try {
    const res = await fetch(url, { credentials: 'omit' });
    if (res.ok) blob = await res.blob();
  } catch {
    /* no access from the extension; try the page */
  }
  if (!blob || !blob.type.startsWith('image/')) {
    try {
      const [res] = await ext.scripting.executeScript({ target: { tabId }, func: fetchImageInPage, args: [url] });
      if (res && res.result) blob = await (await fetch(res.result)).blob();
    } catch {
      blob = null;
    }
  }
  if (!blob) return null;
  try {
    const thumb = await makeThumbnail(blob);
    return { base64: bytesToBase64(thumb.bytes), type: thumb.type };
  } catch {
    return null;
  }
}

// Runs inside the page. Returns the image as a data: URL, or null.
function fetchImageInPage(url) {
  return fetch(url)
    .then((r) => (r.ok ? r.blob() : null))
    .then((b) =>
      b && b.size < 8_000_000
        ? new Promise((resolve) => {
            const fr = new FileReader();
            fr.onload = () => resolve(fr.result);
            fr.onerror = () => resolve(null);
            fr.readAsDataURL(b);
          })
        : null,
    )
    .catch(() => null);
}

/** Show a notice in the top corner of the page. tone: 'info' stays up; 'ok' and 'error' fade out. */
export async function showToast(tabId, message, tone = 'info') {
  try {
    await ext.scripting.executeScript({ target: { tabId }, func: toastInPage, args: [message, tone] });
  } catch {
    /* the page can't be scripted; the toolbar badge still shows the result */
  }
}

// Runs inside the page. Lives in a shadow root so the site's CSS can't restyle it.
function toastInPage(message, tone) {
  const colors = { info: '#37474f', ok: '#2e7d32', error: '#c62828' };
  let host = document.querySelector('manga-bookmarker-toast');
  if (!host) {
    host = document.createElement('manga-bookmarker-toast');
    host.attachShadow({ mode: 'open' });
    document.documentElement.append(host);
  }
  clearTimeout(host.mbTimer);
  const box = document.createElement('div');
  box.textContent = message;
  box.setAttribute(
    'style',
    `position:fixed;top:16px;right:16px;z-index:2147483647;max-width:340px;padding:10px 14px;border-radius:8px;` +
      `background:${colors[tone] || colors.info};color:#fff;font:14px/1.4 system-ui,sans-serif;` +
      'box-shadow:0 4px 16px rgba(0,0,0,.25);cursor:pointer',
  );
  box.addEventListener('click', () => host.remove());
  host.shadowRoot.replaceChildren(box);
  if (tone !== 'info') host.mbTimer = setTimeout(() => host.remove(), tone === 'error' ? 8000 : 5000);
}
