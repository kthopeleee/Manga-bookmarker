// Runs by itself on the supported manga sites, after the adapters and content/scrape.js.
// If the series on this page is in your library, shows a badge in the corner with your reading
// status. Clicking it opens the entry on your library website.
(function (root) {
  const ext = root.browser ?? root.chrome;

  const LOOKS = {
    completed: { icon: '✓', label: 'Read', color: '#2e7d32' },
    reading: { icon: '📖', label: 'Reading', color: '#1565c0' },
    plan: { icon: '🔖', label: 'Plan to read', color: '#8a6d00' },
    dropped: { icon: '✕', label: 'Dropped', color: '#6d4c41' },
  };
  const SAVED = { icon: '🔖', label: 'In your library', color: '#455a64' };

  let pageUrl = null;
  let series = null; // identity of the series on this page, or null if it isn't a series page
  let hidden = false; // closed with × on this page
  let host = null;
  let shadow = null;
  let navTimer;

  async function readPage() {
    const url = location.href;
    pageUrl = url;
    series = null;
    hidden = false;
    render(null);
    let s = null;
    try {
      s = await root.MB_SCRAPE();
    } catch {
      s = null;
    }
    if (url !== location.href) return;
    // The generic reader turns any page (home, search, lists) into a "series", so only trust site readers.
    if (!s || s.kind !== 'series' || s.adapter === 'generic') return;
    series = {
      site: s.site,
      seriesKey: s.seriesKey,
      url: s.url,
      title: s.title,
      altTitles: s.altTitles,
      externalIds: s.externalIds,
      library: s.library,
    };
    await check();
  }

  async function check() {
    if (!series) return;
    const asked = series;
    let res = null;
    try {
      res = await ext.runtime.sendMessage({ type: 'lookup', payload: asked });
    } catch {
      return; // extension reloaded or updated; this page's script is orphaned
    }
    if (asked !== series) return;
    render(res && res.ok ? res.entry : null);
  }

  function detail(entry) {
    if (entry.lastReadChapter == null) return entry.where;
    const of = entry.chaptersAvailable != null ? ` / ${entry.chaptersAvailable}` : '';
    return `ch ${entry.lastReadChapter}${of}`;
  }

  function span(text, css) {
    const el = document.createElement('span');
    el.textContent = text;
    if (css) el.style.cssText = css;
    return el;
  }

  // Styles go through element.style (CSSOM), which a page's Content-Security-Policy doesn't block.
  function render(entry) {
    if (!entry || hidden) {
      if (host) host.remove();
      return;
    }
    if (!host) {
      host = document.createElement('manga-bookmarker-badge');
      shadow = host.attachShadow({ mode: 'closed' }); // keeps your library details away from the page's scripts
    }
    const look = LOOKS[entry.readingStatus] || SAVED;
    const badge = document.createElement(entry.libraryUrl ? 'a' : 'div');
    if (entry.libraryUrl) {
      badge.href = entry.libraryUrl;
      badge.target = '_blank';
      badge.rel = 'noopener';
    }
    badge.title = `“${entry.title}” · ${entry.where}\n${
      entry.libraryUrl ? 'Click to open it in your library.' : 'Add your library website in the extension settings to open it from here.'
    }`;
    badge.style.cssText =
      'position:fixed;right:16px;bottom:16px;z-index:2147483646;display:flex;align-items:center;gap:6px;' +
      'max-width:calc(100vw - 32px);box-sizing:border-box;padding:7px 8px 7px 12px;border-radius:999px;' +
      `background:${look.color};color:#fff;font:600 13px/1.2 system-ui,-apple-system,sans-serif;` +
      `text-decoration:none;box-shadow:0 4px 14px rgba(0,0,0,.3);cursor:${entry.libraryUrl ? 'pointer' : 'default'}`;

    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '×';
    close.title = 'Hide';
    close.setAttribute('aria-label', 'Hide');
    close.style.cssText =
      'margin-left:2px;padding:0 4px;border:0;background:none;color:inherit;font:400 17px/1 system-ui,sans-serif;opacity:.75;cursor:pointer';
    close.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      hidden = true;
      render(null);
    });

    badge.append(
      span(look.icon),
      span(look.label),
      span(`· ${detail(entry)}`, 'font-weight:400;opacity:.9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis'),
      close,
    );
    shadow.replaceChildren(badge);
    if (!host.isConnected) document.documentElement.append(host);
  }

  // Single-page sites (MangaDex, Comix) change the URL without reloading, so watch for that.
  setInterval(() => {
    if (location.href === pageUrl) return;
    pageUrl = location.href;
    series = null;
    render(null);
    clearTimeout(navTimer);
    navTimer = setTimeout(readPage, 800); // give the site a moment to draw the new page
  }, 1000);

  // Re-check after a save, a quick save or a library refresh.
  ext.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes.libraryCache || changes.siteUrl)) check();
  });

  readPage();
})(globalThis);
