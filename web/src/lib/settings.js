// Connection settings and small UI preferences, kept in this browser only.
// The key is stored in localStorage when "Remember on this device" is ticked, otherwise in
// sessionStorage so it's forgotten when the tab closes.
import { DEFAULT_REPO } from '../config.js';

const SETTINGS_KEY = 'manga-bookmarker:settings';
const PREFS_KEY = 'manga-bookmarker:prefs';

function read(storage, key) {
  try {
    return JSON.parse(storage.getItem(key) || '{}') || {};
  } catch {
    return {};
  }
}

function write(storage, key, value) {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode or storage blocked: settings last for this visit only */
  }
}

function remove(storage, key) {
  try {
    storage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function loadSettings() {
  const saved = { ...read(sessionStorage, SETTINGS_KEY), ...read(localStorage, SETTINGS_KEY) };
  return {
    owner: saved.owner || DEFAULT_REPO.owner,
    repo: saved.repo || DEFAULT_REPO.repo,
    token: saved.token || '',
  };
}

export function saveSettings(s, remember = true) {
  const value = { owner: s.owner.trim(), repo: s.repo.trim(), token: s.token.trim() };
  clearSettings();
  write(remember ? localStorage : sessionStorage, SETTINGS_KEY, value);
}

/** Forget the key on this device (the library on GitHub is untouched). */
export function clearSettings() {
  remove(localStorage, SETTINGS_KEY);
  remove(sessionStorage, SETTINGS_KEY);
}

export function isConfigured(s) {
  return Boolean(s.owner && s.repo && s.token);
}

export function loadPrefs() {
  return { sort: 'added', ...read(localStorage, PREFS_KEY) };
}

export function savePrefs(prefs) {
  write(localStorage, PREFS_KEY, prefs);
}
