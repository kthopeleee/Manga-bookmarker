// Tag normalisation shared by the extension and the website.
// Tags are stored as lowercase keys ("sci-fi", "slice of life") and title-cased for display.

const ALIASES = {
  'sci fi': 'sci-fi',
  'scifi': 'sci-fi',
  'science fiction': 'sci-fi',
  "boys' love": 'boys love',
  'shonen ai': 'shounen ai',
  'shonen': 'shounen',
  'shojo': 'shoujo',
  'shojo ai': 'shoujo ai',
  'rom com': 'romcom',
  'romantic comedy': 'romcom',
  'reincarnated': 'reincarnation',
  'martial art': 'martial arts',
  'school': 'school life',
  'webnovel': 'web novel',
  'ln': 'light novel',
  'wn': 'web novel',
  'yaoi': 'yaoi',
  'supernatural': 'supernatural',
  // Same genre, different spelling on different sites (see genres.js).
  "girls' love": 'girls love',
  'oneshot': 'one shot',
  'webtoon': 'webtoons',
  'genderswap': 'gender bender',
  'gender swap': 'gender bender',
  'magical girl': 'magical girls',
  'super hero': 'superhero',
};

// Tags whose display can't be worked out from the words ("Shounen Ai", not "Shounen AI").
const DISPLAY = {
  'shounen ai': 'Shounen Ai',
  'shoujo ai': 'Shoujo Ai',
  'slice of life': 'Slice of Life',
};

// Words that stay upper-case when a tag is displayed.
const ACRONYMS = new Set(['bl', 'gl', 'pov', 'ai', 'mc', 'op', 'rpg', 'vrmmo', 'mmorpg', 'litrpg', 'cn', 'kr', 'jp']);

export function normalizeTag(raw) {
  if (raw == null) return '';
  let t = String(raw)
    .replace(/\(\s*\d+\s*\)\s*$/, '') // "Isekai (99)" -> "Isekai"
    .replace(/[_\-–—]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  if (!t) return '';
  return ALIASES[t] || t;
}

export function uniqueTags(list) {
  const seen = new Set();
  const out = [];
  for (const raw of list || []) {
    const t = normalizeTag(raw);
    if (t && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

export function displayTag(tag) {
  if (DISPLAY[tag]) return DISPLAY[tag];
  return String(tag || '')
    .split(' ')
    .map((word) =>
      word
        .split('-')
        .map((part) => (ACRONYMS.has(part) ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1)))
        .join('-'),
    )
    .join(' ');
}

export function entryTags(entry) {
  return uniqueTags([...(entry.scrapedTags || []), ...(entry.customTags || [])]);
}
