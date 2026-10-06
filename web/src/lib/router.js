// Hash routes, so the site works on GitHub Pages without server rewrites.
//   #/manga  #/novel  #/manga/unsorted  #/manga/folder/<id>  #/entry/<id>  #/add?library=novel  #/settings
//   #/manga/genres?g=romance&g=isekai&match=any  (the ticked genres live in the URL, so a reload keeps them)
import { useEffect, useState } from 'react';

export function parseHash(hash) {
  const raw = String(hash || '').replace(/^#\/?/, '');
  const [pathPart, query = ''] = raw.split('?');
  const parts = pathPart.split('/').filter(Boolean).map(decodeURIComponent);
  const params = new URLSearchParams(query);

  if (parts[0] === 'entry' && parts[1]) return { name: 'entry', id: parts[1] };
  if (parts[0] === 'add') return { name: 'add', library: params.get('library') === 'novel' ? 'novel' : 'manga' };
  if (parts[0] === 'settings') return { name: 'settings' };

  const library = parts[0] === 'novel' ? 'novel' : 'manga';
  if (parts[1] === 'unsorted') return { name: 'board', library, section: 'unsorted' };
  if (parts[1] === 'folder' && parts[2]) return { name: 'board', library, section: 'folder', folderId: parts[2] };
  if (parts[1] === 'genres') {
    const genres = [...new Set(params.getAll('g').filter(Boolean))];
    return { name: 'board', library, section: 'genres', genres, match: params.get('match') === 'any' ? 'any' : 'all' };
  }
  return { name: 'board', library, section: 'all' };
}

export function boardHash({ library, section, folderId, genres, match }) {
  if (section === 'unsorted') return `#/${library}/unsorted`;
  if (section === 'folder') return `#/${library}/folder/${encodeURIComponent(folderId)}`;
  if (section === 'genres') {
    const params = new URLSearchParams();
    for (const g of genres || []) params.append('g', g);
    if (match === 'any') params.set('match', 'any');
    const query = params.toString();
    return `#/${library}/genres${query ? `?${query}` : ''}`;
  }
  return `#/${library}`;
}

/** replace: change the URL without adding a history step (ticking a genre shouldn't need a Back press). */
export function navigate(hash, { replace = false } = {}) {
  if (window.location.hash === hash) return;
  if (!replace) {
    window.location.hash = hash;
    return;
  }
  // Tell useRoute straight away rather than a tick later, so a ticked checkbox doesn't flicker off and on.
  window.history.replaceState(window.history.state, '', hash);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

export function useRoute() {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
