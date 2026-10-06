import { useEffect, useRef, useState } from 'react';
import { coverUrl } from '../lib/covers.js';

const HUES = [8, 28, 200, 160, 260, 330, 45, 120];

function placeholderHue(title) {
  let h = 0;
  for (const ch of title || '') h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return HUES[h % HUES.length];
}

function initials(title) {
  const words = String(title || '?').split(/\s+/).filter(Boolean);
  return words
    .slice(0, 2)
    .map((w) => Array.from(w)[0])
    .join('')
    .toUpperCase();
}

/** Cover from the data repo (downloaded when it scrolls into view), else the site's URL, else initials. */
export function CoverImage({ entry, store, className = '', eager = false }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(eager);
  const [src, setSrc] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (visible) return undefined;
    const el = ref.current;
    if (!el || !('IntersectionObserver' in window)) {
      setVisible(true);
      return undefined;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: '600px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    setFailed(false);
    if (!visible) return undefined;
    let cancelled = false;
    if (entry.coverPath && store) {
      coverUrl(store, entry.coverPath).then(
        (url) => !cancelled && setSrc(url),
        () => !cancelled && setSrc(entry.coverSourceUrl || null),
      );
    } else {
      setSrc(entry.coverSourceUrl || null);
    }
    return () => {
      cancelled = true;
    };
  }, [visible, entry.coverPath, entry.coverSourceUrl, store]);

  const show = src && !failed;
  return (
    <div
      ref={ref}
      className={`cover ${show ? '' : 'cover--empty'} ${className}`}
      style={show ? undefined : { '--hue': placeholderHue(entry.title) }}
    >
      {show ? (
        <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      ) : (
        <span className="cover__initials" aria-hidden="true">
          {initials(entry.title)}
        </span>
      )}
    </div>
  );
}
