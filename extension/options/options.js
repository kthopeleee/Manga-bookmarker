import { ext, getSettings, saveSettings, setCachedLibrary, librarySitePatterns } from '../lib/ext.js';
import { GitHubStore } from '../shared/github-store.js';

const form = document.getElementById('form');
const status = document.getElementById('status');
const libraryBox = document.getElementById('library-box');
const libraryText = document.getElementById('library-text');
const createBtn = document.getElementById('create-library');
const permBox = document.getElementById('perm-box');

const hostPermissions = ext.runtime.getManifest().host_permissions || [];

function setStatus(text, kind = '') {
  status.textContent = text;
  status.className = `status ${kind}`;
}

// Everything in host_permissions, plus the library website so its "Add by hand" form can use the extension.
function wantedOrigins() {
  const site = librarySitePatterns(form.elements.siteUrl.value.trim());
  return site ? [...hostPermissions, site.origin] : hostPermissions;
}

async function checkPermissions() {
  const ok = await ext.permissions.contains({ origins: wantedOrigins() });
  permBox.hidden = ok;
  return ok;
}

document.getElementById('grant').addEventListener('click', async () => {
  let granted = false;
  try {
    granted = await ext.permissions.request({ origins: wantedOrigins() });
  } catch (err) {
    setStatus(err.message, 'error');
  }
  if ((await checkPermissions()) && granted && form.elements.siteUrl.value.trim()) {
    setStatus('Access allowed. Reload your library website to fill in series from links.', 'ok');
  }
});

// Pre-filled so only the key needs pasting. The data repo is private, so these names aren't secret.
const DEFAULTS = {
  owner: 'kthopeleee',
  repo: 'manga-library-data',
  siteUrl: 'https://kthopeleee.github.io/Manga-bookmarker/',
};

async function load() {
  const s = await getSettings();
  for (const [k, v] of Object.entries(s)) if (form.elements[k]) form.elements[k].value = v || DEFAULTS[k] || '';
  await checkPermissions();
}

async function test() {
  const values = Object.fromEntries(new FormData(form));
  await saveSettings(values);
  setStatus('Testing…');
  libraryBox.hidden = true;
  await checkPermissions(); // shows the "Allow access" box if anything is missing
  if (!(await ext.permissions.contains({ origins: hostPermissions }))) {
    setStatus('Saved. Allow access below, then test again.', 'error');
    return;
  }
  try {
    const store = new GitHubStore(values);
    const info = await store.testConnection();
    setStatus(`Connected to ${info.fullName}.`, 'ok');
    libraryBox.hidden = false;
    const privacy = info.private ? '' : ' Warning: this repo is public, so anyone can see your library.';
    if (info.hasLibrary) {
      const lib = await store.loadLibrary();
      await setCachedLibrary(lib);
      const folders = lib.folders.length === 1 ? '1 folder' : `${lib.folders.length} folders`;
      libraryText.textContent = `Library found: ${lib.entries.length} series, ${folders}.${privacy}`;
      createBtn.hidden = true;
    } else {
      libraryText.textContent = `This repo doesn't have a library yet.${privacy}`;
      createBtn.hidden = false;
    }
  } catch (err) {
    setStatus(err.message, 'error');
  }
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  test();
});

createBtn.addEventListener('click', async () => {
  createBtn.disabled = true;
  try {
    const store = new GitHubStore(await getSettings());
    const lib = await store.initLibrary();
    await setCachedLibrary(lib);
    libraryText.textContent = 'Library created. You can start bookmarking.';
    createBtn.hidden = true;
  } catch (err) {
    libraryText.textContent = err.message;
  } finally {
    createBtn.disabled = false;
  }
});

load();
