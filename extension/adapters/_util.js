// Helpers shared by the site adapters. Adapters are classic scripts (not modules)
// because they are injected into the page with scripting.executeScript.
// Each adapter registers itself in globalThis.MB_ADAPTERS[id] with:
//   { id, label, library, priority, matches(url, doc), async scrape(doc, url, env) }
// scrape() returns { kind: 'series', ... } | { kind: 'chapter', ... } | null.
(function (root) {
  const U = {
    text(el) {
      return el ? String(el.textContent || '').replace(/\s+/g, ' ').trim() : '';
    },

    // Text that keeps line breaks from <br>, <p> and <div>, and the source's own newlines.
    multiline(el) {
      if (!el) return '';
      let out = '';
      const walk = (node) => {
        for (const child of node.childNodes) {
          if (child.nodeType === 3) {
            out += child.nodeValue;
          } else if (child.nodeType === 1) {
            const tag = child.nodeName.toUpperCase();
            if (tag === 'SCRIPT' || tag === 'STYLE') continue;
            if (tag === 'BR') {
              out += '\n';
              continue;
            }
            const block = tag === 'P' || tag === 'DIV' || tag === 'LI';
            if (block) out += '\n';
            walk(child);
            if (block) out += '\n';
          }
        }
      };
      walk(el);
      return out
        .split('\n')
        .map((l) => l.replace(/[ \t\u00a0]+/g, ' ').trim())
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    },

    all(doc, selector) {
      return Array.from(doc.querySelectorAll(selector));
    },

    texts(doc, selector) {
      return U.uniq(U.all(doc, selector).map(U.text).filter(Boolean));
    },

    meta(doc, name) {
      const el =
        doc.querySelector(`meta[property="${name}"]`) || doc.querySelector(`meta[name="${name}"]`);
      return el ? (el.getAttribute('content') || '').trim() : '';
    },

    abs(href, base) {
      if (!href) return null;
      try {
        return new URL(href, base).href;
      } catch {
        return null;
      }
    },

    imgSrc(img) {
      if (!img) return null;
      for (const attr of ['data-src', 'data-lazy-src', 'data-original', 'src']) {
        const v = img.getAttribute(attr);
        if (v && !v.startsWith('data:')) return v.trim();
      }
      const srcset = img.getAttribute('data-srcset') || img.getAttribute('srcset');
      if (srcset) return srcset.split(',')[0].trim().split(' ')[0];
      return null;
    },

    num(str) {
      const m = String(str == null ? '' : str).match(/\d+(?:\.\d+)?/);
      return m ? Number(m[0]) : null;
    },

    // Largest chapter number in a list of strings like "Ch.25", "Vol.6 Ch.35", "Chapter 12.5", "c180".
    maxChapter(strings, re) {
      const pattern = re || /(?:ch(?:apter)?\.?|episode|ep\.?)\s*(\d+(?:\.\d+)?)/i;
      let best = null;
      for (const s of strings) {
        const m = String(s).match(pattern);
        if (m) {
          const n = Number(m[1]);
          if (Number.isFinite(n) && (best == null || n > best)) best = n;
        }
      }
      return best;
    },

    uniq(list) {
      const seen = new Set();
      const out = [];
      for (const v of list) {
        const key = String(v).toLowerCase();
        if (v && !seen.has(key)) {
          seen.add(key);
          out.push(v);
        }
      }
      return out;
    },

    pubStatus(str) {
      const s = String(str || '').toLowerCase();
      if (/ongoing|releasing|publishing|on going/.test(s)) return 'ongoing';
      if (/complete|finished|ended/.test(s)) return 'completed';
      if (/hiatus|on hold/.test(s)) return 'hiatus';
      if (/cancel|discontinued|dropped/.test(s)) return 'cancelled';
      return null;
    },

    // Turn markdown-ish synopses into plain text: [text](url) -> text, drop **, __, horizontal rules.
    stripMarkdown(s) {
      return String(s || '')
        .replace(/\r/g, '')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/^\s*[-*_]{3,}\s*$/gm, '')
        .replace(/(\*\*|__)(.*?)\1/g, '$2')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    },

    // { al, mal, mu, md } values may be full URLs or bare ids; keep just the id.
    externalIds(links) {
      const out = {};
      if (!links) return out;
      for (const key of ['al', 'mal', 'mu', 'md']) {
        let v = links[key];
        if (!v) continue;
        v = String(v);
        const m = v.match(/\/(?:manga|series|title)\/([^/?#]+)/i);
        out[key] = m ? m[1] : v;
      }
      return out;
    },

    // Data from <meta> tags, used when an adapter can't find something.
    pageMeta(doc, url) {
      const title =
        U.meta(doc, 'og:title') || U.meta(doc, 'twitter:title') || U.text(doc.querySelector('title'));
      const image = U.meta(doc, 'og:image') || U.meta(doc, 'twitter:image');
      const canonical = doc.querySelector('link[rel="canonical"]');
      return {
        title,
        coverUrl: U.abs(image, url.href),
        synopsis: U.meta(doc, 'og:description') || U.meta(doc, 'description'),
        url: U.abs(U.meta(doc, 'og:url') || (canonical && canonical.getAttribute('href')), url.href) || url.href,
      };
    },
  };

  root.MB_UTIL = U;
  root.MB_ADAPTERS = root.MB_ADAPTERS || {};
})(globalThis);
