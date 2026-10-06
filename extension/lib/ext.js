// One name for the extension API in both browsers. Firefox has `browser`; Chrome's
// `chrome` also returns promises in Manifest V3.
export const ext = globalThis.browser ?? globalThis.chrome;

const SETTINGS_KEYS = ['owner', 'repo', 'token', 'siteUrl'];

export async function getSettings() {
  const s = await ext.storage.local.get(SETTINGS_KEYS);
  return {
    owner: s.owner || '',
    repo: s.repo || '',
    token: s.token || '',
    siteUrl: s.siteUrl || '',
  };
}

export function isConfigured(s) {
  return Boolean(s.owner && s.repo && s.token);
}

export async function saveSettings(values) {
  const clean = {};
  for (const k of SETTINGS_KEYS) if (k in values) clean[k] = String(values[k] || '').trim();
  await ext.storage.local.set(clean);
}

// The last library we downloaded, so the popup can show folders and spot duplicates instantly.
export async function getCachedLibrary() {
  const { libraryCache } = await ext.storage.local.get('libraryCache');
  return libraryCache || null;
}

export async function setCachedLibrary(library) {
  await ext.storage.local.set({ libraryCache: library, libraryCachedAt: Date.now() });
}

/** A page of the library website, e.g. libraryPageUrl(settings, '#/entry/e_123'). Null if no site is set. */
export function libraryPageUrl(settings, hash = '') {
  if (!settings.siteUrl) return null;
  return settings.siteUrl.replace(/#.*$/, '').replace(/\/?$/, '/') + hash;
}

/**
 * Match patterns for the library website in the settings: `origin` is the access to ask the browser
 * for, `page` is where content/library-bridge.js runs. Null if no valid site is set.
 */
export function librarySitePatterns(siteUrl) {
  let url;
  try {
    url = new URL(siteUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const base = `${url.protocol}//${url.hostname}`;
  return { origin: `${base}/*`, page: `${base}${url.pathname.replace(/[^/]*$/, '')}*` };
}

function patternToRegExp(pattern) {
  const m = /^(\*|https?):\/\/(\*|(?:\*\.)?[^/*]+)(\/.*)$/.exec(pattern);
  if (!m) return null;
  const esc = (s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  const scheme = m[1] === '*' ? 'https?' : m[1];
  const host = m[2] === '*' ? '[^/]+' : m[2].startsWith('*.') ? `(?:[^/]+\\.)?${esc(m[2].slice(2))}` : esc(m[2]);
  const path = m[3].split('*').map(esc).join('.*');
  return new RegExp(`^${scheme}://${host}(?::\\d+)?${path}$`, 'i');
}

/** Does `url` fall under one of these extension match patterns (e.g. "https://*.mangago.me/*")? */
export function urlMatches(url, patterns) {
  return patterns.some((p) => {
    const re = patternToRegExp(p);
    return Boolean(re && re.test(String(url)));
  });
}
