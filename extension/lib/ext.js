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
  await ext.storage.local.set({ libraryCache: library });
}
