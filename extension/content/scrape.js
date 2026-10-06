// Runs in the page after the adapters are injected. The popup then calls MB_SCRAPE().
(function (root) {
  const U = root.MB_UTIL;

  async function runScrape(doc, url, env) {
    const adapters = Object.values(root.MB_ADAPTERS).sort((a, b) => (a.priority || 0) - (b.priority || 0));
    const generic = root.MB_ADAPTERS.generic;

    for (const adapter of adapters) {
      if (adapter === generic) continue;
      let matched = false;
      try {
        matched = adapter.matches(url, doc);
      } catch {
        matched = false;
      }
      if (!matched) continue;
      try {
        const result = await adapter.scrape(doc, url, env);
        if (result) return finish(result, adapter, doc, url);
      } catch (err) {
        const fallback = await generic.scrape(doc, url, env);
        fallback.warning = `${adapter.label} reader failed (${(err && err.message) || err}); showing basic page info instead.`;
        return finish(fallback, generic, doc, url);
      }
    }
    return finish(await generic.scrape(doc, url, env), generic, doc, url);
  }

  // Fill gaps from the page's meta tags and attach adapter defaults.
  function finish(result, adapter, doc, url) {
    result.siteLabel = result.siteLabel || adapter.label;
    result.library = result.library || adapter.library;
    result.pageUrl = url.href;
    if (result.kind === 'series') {
      const meta = U.pageMeta(doc, url);
      if (!result.title) result.title = meta.title;
      if (!result.coverUrl) result.coverUrl = meta.coverUrl;
      if (!result.synopsis) result.synopsis = meta.synopsis;
      if (!result.url) result.url = meta.url;
      for (const k of ['altTitles', 'authors', 'genres', 'tags']) result[k] = result[k] || [];
      result.externalIds = result.externalIds || {};
    }
    return result;
  }

  root.MB_RUN_SCRAPE = runScrape;
  root.MB_SCRAPE = function () {
    return runScrape(document, new URL(location.href), { fetch: (...args) => fetch(...args) });
  };
})(globalThis);
