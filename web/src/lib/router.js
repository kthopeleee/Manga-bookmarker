// Hash routes, so the site works on GitHub Pages without server rewrites.
//   #/manga  #/novel  #/manga/unsorted  #/manga/folder/<id>  #/entry/<id>  #/add?library=novel  #/settings
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
  return { name: 'board', library, section: 'all' };
}

export function boardHash({ library, section, folderId }) {
  if (section === 'unsorted') return `#/${library}/unsorted`;
  if (section === 'folder') return `#/${library}/folder/${encodeURIComponent(folderId)}`;
  return `#/${library}`;
}

export function navigate(hash) {
  if (window.location.hash !== hash) window.location.hash = hash;
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
