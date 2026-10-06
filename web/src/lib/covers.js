// Covers live in the private repo, so <img> can't load them directly: download each once through
// the API, keep it in the browser's Cache Storage, and hand out object URLs.
const CACHE_NAME = 'manga-bookmarker-covers-v1';
const memory = new Map();

function mimeFor(path) {
  if (path.endsWith('.webp')) return 'image/webp';
  if (path.endsWith('.png')) return 'image/png';
  return 'image/jpeg';
}

async function load(store, path, key) {
  const cacheKey = `https://covers.invalid/${key}`;
  let cache = null;
  try {
    cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(cacheKey);
    if (hit) return URL.createObjectURL(await hit.blob());
  } catch {
    cache = null; // Cache Storage unavailable (private window, http): just download
  }
  const raw = await store.getFileBlob(path);
  const blob = new Blob([raw], { type: mimeFor(path) });
  try {
    if (cache) await cache.put(cacheKey, new Response(blob, { headers: { 'Content-Type': blob.type } }));
  } catch {
    /* cache full or unavailable */
  }
  return URL.createObjectURL(blob);
}

/** Remove downloaded covers from this browser (used when locking). */
export function clearCoverCache() {
  for (const p of memory.values()) p.then((url) => URL.revokeObjectURL(url), () => {});
  memory.clear();
  try {
    caches.delete(CACHE_NAME).catch(() => {});
  } catch {
    /* Cache Storage unavailable */
  }
}

/** Promise of an object URL for a cover file in the data repo. Cover paths never change, so caching forever is safe. */
export function coverUrl(store, path) {
  const key = `${store.owner}/${store.repo}/${path}`;
  if (!memory.has(key)) {
    memory.set(
      key,
      load(store, path, key).catch((err) => {
        memory.delete(key);
        throw err;
      }),
    );
  }
  return memory.get(key);
}
