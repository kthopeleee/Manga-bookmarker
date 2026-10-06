// Runs on your library website (the background script registers it for the address in settings).
// Lets the website's "Add by hand" form ask the extension to read a series link.
(function () {
  const ext = globalThis.browser ?? globalThis.chrome;

  // The website looks for these to know it can offer "Fill in from link".
  document.documentElement.setAttribute('data-manga-bookmarker', ext.runtime.getManifest().version);
  window.postMessage({ type: 'manga-bookmarker:ready' }, location.origin);

  window.addEventListener('message', async (event) => {
    const msg = event.data;
    if (event.source !== window || !msg || msg.type !== 'manga-bookmarker:read-link') return;
    let res;
    try {
      res = await ext.runtime.sendMessage({ type: 'readLink', payload: { url: String(msg.url || '') } });
    } catch {
      res = { ok: false, error: 'The extension was reloaded or updated. Reload this page and try again.' };
    }
    window.postMessage({ type: 'manga-bookmarker:read-link-result', id: msg.id, ...res }, location.origin);
  });
})();
