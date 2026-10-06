// Reads and writes the library in a (private) GitHub repo through the Contents API.
// library.json holds all entries and folders; covers/ holds the cover images.

import { emptyLibrary, normalizeLibrary } from './model.js';

const API = 'https://api.github.com';
const LIBRARY_PATH = 'library.json';
const MAX_ATTEMPTS = 4;

export class GitHubError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'GitHubError';
    this.status = status;
  }
}

// ---------- base64 helpers (work in browsers, extension workers and Node) ----------

export function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(b64) {
  const binary = atob(b64.replace(/\s/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function encodeText(text) {
  return bytesToBase64(new TextEncoder().encode(text));
}

function decodeText(b64) {
  return new TextDecoder().decode(base64ToBytes(b64));
}

function encodePath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

export class GitHubStore {
  constructor({ owner, repo, token, fetchImpl }) {
    if (!owner || !repo || !token) throw new GitHubError('GitHub owner, repo and token are required.', 0);
    this.owner = owner.trim();
    this.repo = repo.trim();
    this.token = token.trim();
    this.fetch = fetchImpl || globalThis.fetch.bind(globalThis);
    this.sha = null; // sha of library.json we last read or wrote
  }

  async request(method, path, { body, accept, cache } = {}) {
    const res = await this.fetch(`${API}${path}`, {
      method,
      cache: cache || 'no-store', // GitHub sends max-age=60; never serve a stale library from the HTTP cache
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: accept || 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      let message = `GitHub returned ${res.status}`;
      try {
        const data = await res.json();
        if (data && data.message) message = `${message}: ${data.message}`;
      } catch {
        /* not JSON */
      }
      if (res.status === 401) message = 'GitHub rejected the token (401). Check that it is correct and not expired.';
      if (res.status === 404 && path === this.repoPath()) {
        message = `Repo ${this.owner}/${this.repo} not found, or the token can't see it.`;
      }
      throw new GitHubError(message, res.status);
    }
    return res;
  }

  repoPath() {
    return `/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.repo)}`;
  }

  contentsPath(path) {
    return `${this.repoPath()}/contents/${encodePath(path)}`;
  }

  /** Check the token can read and write the repo. Returns repo info. */
  async testConnection() {
    const res = await this.request('GET', this.repoPath());
    const repo = await res.json();
    if (repo.permissions && !repo.permissions.push) {
      throw new GitHubError('The token can read the repo but cannot write to it. Give it "Contents: Read and write".', 403);
    }
    let hasLibrary = true;
    try {
      await this.loadLibrary();
    } catch (err) {
      if (err.status === 404) hasLibrary = false;
      else throw err;
    }
    return { fullName: repo.full_name, private: repo.private, hasLibrary };
  }

  /** Download library.json. Throws GitHubError(404) if it doesn't exist yet. */
  async loadLibrary() {
    const { library, sha } = await this.fetchLibrary();
    this.sha = sha;
    return library;
  }

  // Returns the library together with the sha it was read at. updateLibrary relies on this pair
  // staying together even when several saves run at once on the same store.
  async fetchLibrary() {
    const res = await this.request('GET', this.contentsPath(LIBRARY_PATH));
    const meta = await res.json();
    let text;
    if (meta.encoding === 'base64' && meta.content) {
      text = decodeText(meta.content);
    } else {
      // Files over 1 MB come back without content; fetch the raw bytes instead.
      const raw = await this.request('GET', this.contentsPath(LIBRARY_PATH), {
        accept: 'application/vnd.github.raw+json',
      });
      text = await raw.text();
    }
    return { library: normalizeLibrary(JSON.parse(text)), sha: meta.sha };
  }

  /** Create an empty library.json if the repo doesn't have one. */
  async initLibrary() {
    try {
      return await this.loadLibrary();
    } catch (err) {
      if (err.status !== 404) throw err;
    }
    const lib = emptyLibrary();
    await this.saveLibrary(lib, null, 'Create library');
    return lib;
  }

  async saveLibrary(library, sha, message) {
    const body = {
      message: message || 'Update library',
      content: encodeText(JSON.stringify(library, null, 2) + '\n'),
    };
    if (sha) body.sha = sha;
    const res = await this.request('PUT', this.contentsPath(LIBRARY_PATH), { body });
    const data = await res.json();
    return data.content.sha;
  }

  /**
   * Load the latest library, apply `mutator`, and save it.
   * If someone else saved in between (409/422 conflict), reload and apply again.
   * Returns the saved library.
   */
  async updateLibrary(mutator, message) {
    let lastError;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      let library;
      let sha = null;
      try {
        ({ library, sha } = await this.fetchLibrary());
      } catch (err) {
        if (err.status !== 404) throw err;
        library = emptyLibrary();
      }
      const next = normalizeLibrary((await mutator(library)) || library);
      try {
        await this.saveLibrary(next, sha, message);
        return next;
      } catch (err) {
        if (err.status === 409 || err.status === 422) {
          lastError = err;
          await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
          continue;
        }
        throw err;
      }
    }
    throw lastError || new GitHubError('Could not save after several attempts.', 409);
  }

  /** Upload a binary file (e.g. a cover). `data` is a Uint8Array. Returns the path. */
  async putFile(path, data, message) {
    const body = { message: message || `Add ${path}`, content: bytesToBase64(data) };
    await this.request('PUT', this.contentsPath(path), { body });
    return path;
  }

  async deleteFile(path, message) {
    let sha;
    try {
      const res = await this.request('GET', this.contentsPath(path));
      sha = (await res.json()).sha;
    } catch (err) {
      if (err.status === 404) return;
      throw err;
    }
    await this.request('DELETE', this.contentsPath(path), {
      body: { message: message || `Remove ${path}`, sha },
    });
  }

  /** Download a file's raw bytes as a Blob (used for covers on the website). */
  async getFileBlob(path) {
    const res = await this.request('GET', this.contentsPath(path), {
      accept: 'application/vnd.github.raw+json',
      cache: 'default',
    });
    return res.blob();
  }
}

/** Pick a cover file name for an entry. A new name per upload avoids needing the old file's sha. */
export function coverPathFor(entryId, mimeType) {
  const ext = mimeType === 'image/webp' ? 'webp' : mimeType === 'image/png' ? 'png' : 'jpg';
  return `covers/${entryId}-${Date.now().toString(36)}.${ext}`;
}
