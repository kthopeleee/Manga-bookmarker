import { ext, getSettings, saveSettings, setCachedLibrary } from '../lib/ext.js';
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

async function checkPermissions() {
  const ok = await ext.permissions.contains({ origins: hostPermissions });
  permBox.hidden = ok;
  return ok;
}

document.getElementById('grant').addEventListener('click', async () => {
  await ext.permissions.request({ origins: hostPermissions });
  await checkPermissions();
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
  if (!(await checkPermissions())) {
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
